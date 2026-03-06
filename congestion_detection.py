import cv2
import numpy as np
from ultralytics import YOLO
import supervision as sv
import time
from collections import deque
import yt_dlp

# ==============================
# CONFIGURATION
# ==============================
YOUTUBE_URL = "https://www.youtube.com/watch?v=iEIk3RpV6RA"

# Congestion thresholds
CONGESTION_VEHICLE_COUNT = 6       # Number of vehicles to trigger congestion
CONGESTION_SPEED_THRESHOLD = 15    # Below this speed = slow/congested
CONGESTION_CONFIRM_SECONDS = 4     # Seconds before confirming congestion alert
CLEAR_CONFIRM_SECONDS = 6          # Seconds before clearing congestion alert

# Tracking
HISTORY = 8


# ==============================
# CONGESTION LEVEL
# ==============================
def get_congestion_level(vehicle_count, avg_speed, slow_ratio):
    """
    Returns: (level, label, color)
    Levels: 0=FREE, 1=MODERATE, 2=HEAVY, 3=SEVERE
    """
    if vehicle_count <= 2:
        return 0, "TRAFFIC FREE", (0, 200, 0)

    if slow_ratio > 0.75 and vehicle_count >= CONGESTION_VEHICLE_COUNT:
        return 3, "SEVERE CONGESTION", (0, 0, 255)
    elif slow_ratio > 0.5 and vehicle_count >= CONGESTION_VEHICLE_COUNT:
        return 2, "HEAVY CONGESTION", (0, 100, 255)
    elif slow_ratio > 0.3 or vehicle_count >= CONGESTION_VEHICLE_COUNT:
        return 1, "MODERATE TRAFFIC", (0, 200, 255)
    else:
        return 0, "TRAFFIC FREE", (0, 200, 0)


# ==============================
# YOUTUBE STREAM
# ==============================
def get_youtube_stream_url(youtube_url):
    print("Connecting to YouTube stream...")
    ydl_opts = {
        'format': 'best[height<=720]',
        'quiet': True,
        'no_warnings': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            print(f"Stream found: {info.get('title', 'No title')}")
            return info['url']
    except Exception as e:
        print(f"Stream error: {e}")
        return None


# ==============================
# INIT
# ==============================
print("Loading YOLO model...")
model = YOLO("yolov8n.pt")
tracker = sv.ByteTrack()

stream_url = get_youtube_stream_url(YOUTUBE_URL)
if not stream_url:
    print("Could not get stream. Exiting.")
    exit()

print("Opening stream...")
cap = cv2.VideoCapture(stream_url)
if not cap.isOpened():
    print("Failed to open stream.")
    exit()

print("Stream OK! Starting detection...\n")

# Tracking state
positions = {}
speeds = {}
speed_history = {}

# Congestion state
congestion_level = 0
congestion_label = "TRAFFIC FREE"
congestion_color = (0, 200, 0)
congestion_start_time = None
clear_start_time = None
alert_active = False
alert_flash_counter = 0

# Stats history for smoothing
level_history = deque(maxlen=30)

# FPS
fps_counter = deque(maxlen=30)
last_time = time.time()
frame_number = 0

reconnect_attempts = 0
max_reconnect_attempts = 5

# ==============================
# MAIN LOOP
# ==============================
while True:
    ret, frame = cap.read()

    if not ret:
        reconnect_attempts += 1
        print(f"Reconnecting... ({reconnect_attempts}/{max_reconnect_attempts})")
        if reconnect_attempts >= max_reconnect_attempts:
            print("Max reconnect attempts reached. Stopping.")
            break
        time.sleep(2)
        cap.release()
        stream_url = get_youtube_stream_url(YOUTUBE_URL)
        if stream_url:
            cap = cv2.VideoCapture(stream_url)
            if cap.isOpened():
                reconnect_attempts = 0
        continue

    reconnect_attempts = 0
    frame_number += 1

    # FPS
    current_time = time.time()
    dt = current_time - last_time if (current_time - last_time) > 0 else 0.001
    fps_counter.append(1.0 / dt)
    last_time = current_time
    avg_fps = np.mean(fps_counter)

    # ==============================
    # DETECTION + TRACKING
    # ==============================
    results = model(frame)[0]
    detections = sv.Detections.from_ultralytics(results)

    # Vehicles only: car=2, motorcycle=3, bus=5, truck=7
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

        # Init
        if tracker_id not in positions:
            positions[tracker_id] = deque(maxlen=40)
            speed_history[tracker_id] = deque(maxlen=20)

        positions[tracker_id].append((cx, cy, time.time()))

        # Speed
        current_speed = 0
        if len(positions[tracker_id]) >= HISTORY:
            x_old, y_old, t_old = positions[tracker_id][-HISTORY]
            dist = np.sqrt((cx - x_old) ** 2 + (cy - y_old) ** 2)
            elapsed = time.time() - t_old
            if elapsed > 0:
                raw_speed = dist / elapsed
                if tracker_id in speeds:
                    speeds[tracker_id] = 0.7 * speeds[tracker_id] + 0.3 * raw_speed
                else:
                    speeds[tracker_id] = raw_speed
                speed_history[tracker_id].append(raw_speed)
                current_speed = speeds[tracker_id]

        frame_speeds.append(current_speed)

        # Color per vehicle based on speed
        if current_speed < CONGESTION_SPEED_THRESHOLD:
            box_color = (0, 0, 255)     # Red = slow
        elif current_speed < CONGESTION_SPEED_THRESHOLD * 2:
            box_color = (0, 165, 255)   # Orange = medium
        else:
            box_color = (0, 255, 0)     # Green = moving

        speed_label = f"ID{tracker_id} {int(current_speed)}px/s"
        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
        cv2.putText(frame, speed_label, (x1, y1 - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, box_color, 1)

    # ==============================
    # CONGESTION ANALYSIS
    # ==============================
    vehicle_count = len(current_tracked_ids)
    avg_speed = np.mean(frame_speeds) if frame_speeds else 0
    slow_vehicles = sum(1 for s in frame_speeds if s < CONGESTION_SPEED_THRESHOLD)
    slow_ratio = slow_vehicles / vehicle_count if vehicle_count > 0 else 0

    raw_level, raw_label, raw_color = get_congestion_level(vehicle_count, avg_speed, slow_ratio)
    level_history.append(raw_level)

    # Smooth level using majority vote
    smoothed_level = int(np.round(np.mean(level_history)))

    # Re-derive label/color from smoothed level
    level_map = {
        0: ("TRAFFIC FREE",      (0, 200, 0)),
        1: ("MODERATE TRAFFIC",  (0, 200, 255)),
        2: ("HEAVY CONGESTION",  (0, 100, 255)),
        3: ("SEVERE CONGESTION", (0, 0, 255)),
    }
    congestion_label, congestion_color = level_map[smoothed_level]

    # Alert logic: confirm before triggering / clearing
    if smoothed_level >= 2:
        clear_start_time = None
        if congestion_start_time is None:
            congestion_start_time = time.time()
        elif time.time() - congestion_start_time >= CONGESTION_CONFIRM_SECONDS:
            alert_active = True
    else:
        congestion_start_time = None
        if alert_active:
            if clear_start_time is None:
                clear_start_time = time.time()
            elif time.time() - clear_start_time >= CLEAR_CONFIRM_SECONDS:
                alert_active = False
                clear_start_time = None

    alert_flash_counter += 1

    # ==============================
    # CLEANUP
    # ==============================
    lost_ids = set(positions.keys()) - current_tracked_ids
    for lid in lost_ids:
        positions.pop(lid, None)
        speeds.pop(lid, None)
        speed_history.pop(lid, None)

    # ==============================
    # UI OVERLAY
    # ==============================
    h, w = frame.shape[:2]

    # --- Top status bar ---
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 70), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    # Congestion status
    cv2.putText(frame, congestion_label, (20, 45),
                cv2.FONT_HERSHEY_SIMPLEX, 1.1, congestion_color, 3)

    # Level bar (4 segments)
    bar_colors = [(0, 200, 0), (0, 200, 255), (0, 100, 255), (0, 0, 255)]
    for i in range(4):
        bx = w - 220 + i * 52
        color = bar_colors[i] if i <= smoothed_level else (60, 60, 60)
        cv2.rectangle(frame, (bx, 15), (bx + 45, 55), color, -1)
        cv2.rectangle(frame, (bx, 15), (bx + 45, 55), (200, 200, 200), 1)

    # --- Bottom stats panel ---
    overlay2 = frame.copy()
    cv2.rectangle(overlay2, (0, h - 100), (w, h), (10, 10, 10), -1)
    cv2.addWeighted(overlay2, 0.7, frame, 0.3, 0, frame)

    cv2.putText(frame, f"Vehicles: {vehicle_count}", (20, h - 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(frame, f"Avg Speed: {int(avg_speed)} px/s", (20, h - 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    cv2.putText(frame, f"Slow: {slow_vehicles}/{vehicle_count}", (280, h - 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 180, 255), 2)
    cv2.putText(frame, f"Slow ratio: {int(slow_ratio * 100)}%", (280, h - 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 180, 255), 2)

    cv2.putText(frame, f"FPS: {int(avg_fps)}", (w - 140, h - 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 0), 2)

    # --- ALERT FLASH ---
    if alert_active and (alert_flash_counter % 20 < 10):
        alert_overlay = frame.copy()
        cv2.rectangle(alert_overlay, (0, 75), (w, 145), (0, 0, 180), -1)
        cv2.addWeighted(alert_overlay, 0.6, frame, 0.4, 0, frame)
        cv2.putText(frame, "!! CONGESTION ALERT -- HEAVY TRAFFIC DETECTED !!",
                    (20, 125), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)

    # LIVE badge
    cv2.putText(frame, "LIVE", (w - 80, 105),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

    cv2.imshow("Congestion Detection", frame)

    key = cv2.waitKey(1)
    if key == 27:
        print("\n--- FINAL STATS ---")
        print(f"Last congestion level: {congestion_label}")
        print(f"Vehicles detected: {vehicle_count}")
        print(f"Average speed: {int(avg_speed)} px/s")
        break

cap.release()
cv2.destroyAllWindows()
print("Done.")