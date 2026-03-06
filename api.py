from flask import Flask, jsonify, Response, request, send_file
from flask_cors import CORS
import threading
import time
import cv2
import numpy as np
from ultralytics import YOLO
import supervision as sv
from collections import deque
import yt_dlp
import json
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ==============================
# DIRECTORIES
# ==============================
INCIDENTS_FILE = "incidents.json"
SNAPSHOTS_DIR = "snapshots"
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

# ==============================
# INCIDENTS PERSISTENCE
# ==============================
def load_incidents():
    if os.path.exists(INCIDENTS_FILE):
        with open(INCIDENTS_FILE, "r") as f:
            return json.load(f)
    return []

def save_incidents(incidents):
    with open(INCIDENTS_FILE, "w") as f:
        json.dump(incidents, f, indent=2)

incidents_lock = threading.Lock()
incidents_db = load_incidents()

def save_snapshot(incident_id, frame):
    path = os.path.join(SNAPSHOTS_DIR, f"{incident_id}.jpg")
    cv2.imwrite(path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(f"[SNAPSHOT SAVED] {path}")
    return path

def log_incident(level, label, vehicle_count, avg_speed, slow_ratio, frame=None):
    with incidents_lock:
        incident_id = f"CGS-{int(time.time())}"
        snapshot_url = None

        if frame is not None:
            save_snapshot(incident_id, frame)
            snapshot_url = f"/api/snapshots/{incident_id}"

        incident = {
            "id": incident_id,
            "type": "CONGESTION",
            "label": label,
            "level": level,
            "vehicle_count": vehicle_count,
            "avg_speed": round(avg_speed, 1),
            "slow_ratio": round(slow_ratio * 100, 1),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp_unix": time.time(),
            "duration_seconds": 0,
            "resolved": False,
            "resolved_at": None,
            "severity": "high" if level >= 3 else "medium",
            "snapshot": snapshot_url,
        }
        incidents_db.append(incident)
        save_incidents(incidents_db)
        print(f"[INCIDENT LOGGED] {incident_id} — {label}")
        return incident_id

def auto_resolve_last_congestion():
    with incidents_lock:
        for inc in reversed(incidents_db):
            if inc["type"] == "CONGESTION" and not inc["resolved"]:
                inc["resolved"] = True
                inc["resolved_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                inc["duration_seconds"] = int(time.time() - inc["timestamp_unix"])
                save_incidents(incidents_db)
                print(f"[INCIDENT RESOLVED] {inc['id']} — {inc['duration_seconds']}s")
                break

def resolve_incident(incident_id):
    with incidents_lock:
        for inc in incidents_db:
            if inc["id"] == incident_id and not inc["resolved"]:
                inc["resolved"] = True
                inc["resolved_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                inc["duration_seconds"] = int(time.time() - inc["timestamp_unix"])
                save_incidents(incidents_db)
                return True
    return False

# ==============================
# SHARED STATE
# ==============================
state_lock = threading.Lock()
detection_state = {
    "vehicle_count": 0, "avg_speed": 0, "slow_ratio": 0,
    "congestion_level": 0, "congestion_label": "TRAFFIC FREE",
    "alert_active": False, "vehicle_count_up": 0, "vehicle_count_down": 0,
    "fps": 0, "running": False, "stream_title": "", "last_update": None,
}

latest_frame = None
frame_lock = threading.Lock()

# ==============================
# CONFIG
# ==============================
YOUTUBE_URL = "https://www.youtube.com/watch?v=iEIk3RpV6RA"
CONGESTION_VEHICLE_COUNT = 6
CONGESTION_SPEED_THRESHOLD = 15
HISTORY = 8
CONGESTION_CONFIRM_SECONDS = 4
CLEAR_CONFIRM_SECONDS = 6

def get_youtube_stream_url(url):
    ydl_opts = {'format': 'best[height<=720]', 'quiet': True, 'no_warnings': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info['url'], info.get('title', '')
    except Exception as e:
        print(f"Stream error: {e}")
        return None, ''

def get_congestion_level(vehicle_count, slow_ratio):
    if vehicle_count <= 2:
        return 0, "TRAFFIC FREE"
    if slow_ratio > 0.75 and vehicle_count >= CONGESTION_VEHICLE_COUNT:
        return 3, "SEVERE CONGESTION"
    elif slow_ratio > 0.5 and vehicle_count >= CONGESTION_VEHICLE_COUNT:
        return 2, "HEAVY CONGESTION"
    elif slow_ratio > 0.3 or vehicle_count >= CONGESTION_VEHICLE_COUNT:
        return 1, "MODERATE TRAFFIC"
    return 0, "TRAFFIC FREE"

# ==============================
# DETECTION THREAD
# ==============================
def detection_loop():
    global latest_frame
    print("Loading YOLO...")
    model = YOLO("yolov8n.pt")
    tracker = sv.ByteTrack()

    stream_url, title = get_youtube_stream_url(YOUTUBE_URL)
    if not stream_url:
        return

    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        return

    with state_lock:
        detection_state["running"] = True
        detection_state["stream_title"] = title

    positions = {}
    speeds = {}
    speed_history = {}
    first_y_position = {}
    counted_ids_up = set()
    counted_ids_down = set()
    vehicle_count_up = 0
    vehicle_count_down = 0
    LINE_Y_CENTER = 370

    level_history = deque(maxlen=30)
    fps_counter = deque(maxlen=30)
    last_time = time.time()
    congestion_start_time = None
    clear_start_time = None
    alert_active = False
    reconnect_attempts = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            reconnect_attempts += 1
            if reconnect_attempts >= 5:
                break
            time.sleep(2)
            cap.release()
            stream_url, _ = get_youtube_stream_url(YOUTUBE_URL)
            if stream_url:
                cap = cv2.VideoCapture(stream_url)
                if cap.isOpened():
                    reconnect_attempts = 0
            continue

        reconnect_attempts = 0
        clean_frame = frame.copy()  # clean copy for snapshot

        current_time = time.time()
        dt = max(current_time - last_time, 0.001)
        fps_counter.append(1.0 / dt)
        last_time = current_time

        results = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(results)
        vehicle_mask = np.isin(detections.class_id, [2, 3, 5, 7])
        detections = detections[vehicle_mask]
        detections = tracker.update_with_detections(detections)

        current_tracked_ids = set()
        frame_speeds = []

        for xyxy, tracker_id in zip(detections.xyxy, detections.tracker_id):
            current_tracked_ids.add(tracker_id)
            x1, y1, x2, y2 = map(int, xyxy)
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            if tracker_id not in positions:
                positions[tracker_id] = deque(maxlen=40)
                speed_history[tracker_id] = deque(maxlen=20)
                first_y_position[tracker_id] = cy

            positions[tracker_id].append((cx, cy, time.time()))

            current_speed = 0
            if len(positions[tracker_id]) >= HISTORY:
                x_old, y_old, t_old = positions[tracker_id][-HISTORY]
                dist = np.sqrt((cx - x_old) ** 2 + (cy - y_old) ** 2)
                elapsed = time.time() - t_old
                if elapsed > 0:
                    raw_speed = dist / elapsed
                    speeds[tracker_id] = (0.7 * speeds[tracker_id] + 0.3 * raw_speed
                                          if tracker_id in speeds else raw_speed)
                    speed_history[tracker_id].append(raw_speed)
                    current_speed = speeds[tracker_id]

            frame_speeds.append(current_speed)

            diff = cy - first_y_position[tracker_id]
            direction = "DOWN" if diff > 20 else "UP" if diff < -20 else None
            if direction and abs(cy - LINE_Y_CENTER) < 50:
                if direction == "DOWN" and tracker_id not in counted_ids_down and cy > LINE_Y_CENTER:
                    counted_ids_down.add(tracker_id)
                    vehicle_count_down += 1
                elif direction == "UP" and tracker_id not in counted_ids_up and cy < LINE_Y_CENTER:
                    counted_ids_up.add(tracker_id)
                    vehicle_count_up += 1

            color = (0, 0, 255) if current_speed < CONGESTION_SPEED_THRESHOLD else \
                    (0, 165, 255) if current_speed < CONGESTION_SPEED_THRESHOLD * 2 else \
                    (0, 255, 0)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"ID{tracker_id} {int(current_speed)}",
                        (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
            # Draw on clean frame too so vehicles are visible in snapshot
            cv2.rectangle(clean_frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(clean_frame, f"ID{tracker_id} {int(current_speed)}",
                        (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        vehicle_count = len(current_tracked_ids)
        avg_speed = float(np.mean(frame_speeds)) if frame_speeds else 0
        slow_vehicles = sum(1 for s in frame_speeds if s < CONGESTION_SPEED_THRESHOLD)
        slow_ratio = slow_vehicles / vehicle_count if vehicle_count > 0 else 0

        raw_level, _ = get_congestion_level(vehicle_count, slow_ratio)
        level_history.append(raw_level)
        smoothed_level = int(np.round(np.mean(level_history)))
        level_map = {0: "TRAFFIC FREE", 1: "MODERATE TRAFFIC",
                     2: "HEAVY CONGESTION", 3: "SEVERE CONGESTION"}
        congestion_label = level_map[smoothed_level]

        # Alert + snapshot logging
        if smoothed_level >= 2:
            clear_start_time = None
            if congestion_start_time is None:
                congestion_start_time = time.time()
            elif time.time() - congestion_start_time >= CONGESTION_CONFIRM_SECONDS:
                if not alert_active:
                    alert_active = True
                    # Build annotated snapshot
                    snap = clean_frame.copy()
                    h, w = snap.shape[:2]
                    # Top banner
                    cv2.rectangle(snap, (0, 0), (w, 52), (20, 20, 140), -1)
                    cv2.putText(snap,
                        f"!! CONGESTION ALERT — {congestion_label}",
                        (14, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
                    cv2.putText(snap,
                        datetime.now().strftime("%Y-%m-%d  %H:%M:%S"),
                        (14, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 200, 255), 1)
                    # Bottom bar
                    cv2.rectangle(snap, (0, h - 36), (w, h), (10, 10, 10), -1)
                    cv2.putText(snap,
                        f"Vehicles: {vehicle_count}   Slow: {int(slow_ratio*100)}%   Avg speed: {int(avg_speed)} px/s",
                        (14, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 220, 0), 1)
                    log_incident(smoothed_level, congestion_label,
                                 vehicle_count, avg_speed, slow_ratio, frame=snap)
        else:
            congestion_start_time = None
            if alert_active:
                if clear_start_time is None:
                    clear_start_time = time.time()
                elif time.time() - clear_start_time >= CLEAR_CONFIRM_SECONDS:
                    alert_active = False
                    clear_start_time = None
                    auto_resolve_last_congestion()

        for lid in set(positions.keys()) - current_tracked_ids:
            positions.pop(lid, None)
            speeds.pop(lid, None)
            speed_history.pop(lid, None)
            first_y_position.pop(lid, None)

        with state_lock:
            detection_state.update({
                "vehicle_count": vehicle_count,
                "avg_speed": round(avg_speed, 1),
                "slow_ratio": round(slow_ratio * 100, 1),
                "congestion_level": smoothed_level,
                "congestion_label": congestion_label,
                "alert_active": alert_active,
                "vehicle_count_up": vehicle_count_up,
                "vehicle_count_down": vehicle_count_down,
                "fps": round(float(np.mean(fps_counter)), 1),
                "last_update": time.time(),
            })

        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        with frame_lock:
            latest_frame = buffer.tobytes()

    cap.release()
    with state_lock:
        detection_state["running"] = False


detection_thread = threading.Thread(target=detection_loop, daemon=True)
detection_thread.start()

# ==============================
# API ROUTES
# ==============================
@app.route('/api/status')
def get_status():
    with state_lock:
        return jsonify(detection_state.copy())

@app.route('/api/stream')
def video_stream():
    def generate():
        while True:
            with frame_lock:
                frame = latest_frame
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.033)
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/incidents')
def get_incidents():
    with incidents_lock:
        data = list(incidents_db)
    data.sort(key=lambda x: x['timestamp_unix'], reverse=True)
    return jsonify(data)

@app.route('/api/incidents/stats')
def incident_stats():
    with incidents_lock:
        total = len(incidents_db)
        active = sum(1 for i in incidents_db if not i['resolved'])
        resolved = total - active
        severe = sum(1 for i in incidents_db if i.get('level', 0) >= 3)
        resolved_list = [i for i in incidents_db if i['resolved'] and i['duration_seconds'] > 0]
        avg_duration = int(sum(i['duration_seconds'] for i in resolved_list) / len(resolved_list)) if resolved_list else 0
    return jsonify({"total": total, "active": active, "resolved": resolved,
                    "severe": severe, "avg_duration_seconds": avg_duration})

@app.route('/api/incidents/<incident_id>/resolve', methods=['POST'])
def resolve_incident_route(incident_id):
    success = resolve_incident(incident_id)
    if success:
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Not found or already resolved"}), 404

@app.route('/api/snapshots/<incident_id>')
def get_snapshot(incident_id):
    if not incident_id.startswith("CGS-"):
        return jsonify({"error": "Invalid ID"}), 400
    path = os.path.join(SNAPSHOTS_DIR, f"{incident_id}.jpg")
    if not os.path.exists(path):
        return jsonify({"error": "Snapshot not found"}), 404
    return send_file(path, mimetype='image/jpeg')

@app.route('/api/snapshots/<incident_id>/download')
def download_snapshot(incident_id):
    if not incident_id.startswith("CGS-"):
        return jsonify({"error": "Invalid ID"}), 400
    path = os.path.join(SNAPSHOTS_DIR, f"{incident_id}.jpg")
    if not os.path.exists(path):
        return jsonify({"error": "Snapshot not found"}), 404
    return send_file(path, mimetype='image/jpeg',
                     as_attachment=True, download_name=f"{incident_id}.jpg")

if __name__ == '__main__':
    print("Starting Flask API on http://localhost:5000")
    print("  GET  /api/status")
    print("  GET  /api/stream")
    print("  GET  /api/incidents")
    print("  GET  /api/incidents/stats")
    print("  POST /api/incidents/<id>/resolve")
    print("  GET  /api/snapshots/<id>          ← view snapshot")
    print("  GET  /api/snapshots/<id>/download  ← download snapshot")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)