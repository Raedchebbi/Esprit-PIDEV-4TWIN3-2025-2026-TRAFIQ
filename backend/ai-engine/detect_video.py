# =============================================================
# TRAFIQ – AI-Powered Traffic Accident Detection Engine
# =============================================================
# This script processes a video file frame by frame using two
# YOLO models:
#   1. Vehicle Detection Model  → detects and tracks vehicles
#   2. Crash Detection Model    → classifies crash severity
#
# When a collision is confirmed, it:
#   - Saves a snapshot of the frame to /snapshots
#   - Logs the incident details to incidents_log.json
#
# HOW TO RUN:
#   cd backend/ai-engine
#   python detect_video.py
# =============================================================

from ultralytics import YOLO
import cv2
import json
import datetime
import os
import math
from itertools import combinations

# ================= CONFIG =================
# Base directory — resolves to wherever this script is located
# This makes all paths work regardless of who runs it or on what machine
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Paths to the trained YOLO model weights (relative to this script)
MODEL_VEHICLE_PATH = os.path.join(BASE_DIR, "models", "vehicule-model.pt")
MODEL_CRASH_PATH   = os.path.join(BASE_DIR, "models", "crash-model.pt")

# Path to the input video file (place your video inside backend/ai-engine/)
VIDEO_PATH = os.path.join(BASE_DIR, "accident0.mp4")

# Minimum confidence threshold for YOLO detections (0.0 - 1.0)
BASE_CONF = 0.4

# Minimum Intersection over Union (IoU) overlap between two vehicle
# bounding boxes to consider them as potentially colliding
IOU_THRESHOLD = 0.4

# If a vehicle's pixel displacement between frames drops below this,
# it is considered to have slowed down or stopped (collision indicator)
DIST_DROP_THRESHOLD  = 25
SPEED_DROP_THRESHOLD = 15

# Number of consecutive frames a collision must be detected before
# it is confirmed — reduces false positives from brief overlaps
CONFIRMATION_FRAMES = 2

# After logging an incident, wait this many frames before allowing
# another incident to be logged — avoids duplicate entries
COOLDOWN_FRAMES = 400

# Output paths (relative to this script)
LOG_PATH     = os.path.join(BASE_DIR, "incidents_log.json")  # JSON incident log
SNAPSHOT_DIR = os.path.join(BASE_DIR, "snapshots")           # Snapshot output folder

# Create snapshots folder if it doesn't exist
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# ================= LOAD MODEL =================
print("Loading vehicle detection model...")
vehicle_model = YOLO(MODEL_VEHICLE_PATH)
print("Model loaded successfully.")


# ================= IoU FUNCTION =================
def compute_iou(boxA, boxB):
    """
    Computes the Intersection over Union (IoU) between two bounding boxes.
    IoU measures how much two boxes overlap:
        - IoU = 0.0 → no overlap
        - IoU = 1.0 → perfect overlap (same box)

    Parameters:
        boxA, boxB: [x1, y1, x2, y2] coordinates of each bounding box

    Returns:
        float: IoU value between 0 and 1
    """
    # Find the coordinates of the intersection rectangle
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    # Compute intersection area (0 if no overlap)
    inter = max(0, xB - xA) * max(0, yB - yA)

    # Compute individual box areas
    areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

    # Union area = sum of both areas minus the intersection
    union = areaA + areaB - inter

    if union == 0:
        return 0
    return inter / union


# ================= VIDEO CAPTURE =================
cap = cv2.VideoCapture(VIDEO_PATH)

# Dictionary to store the last known center position of each tracked vehicle
# Used to compute speed (pixel displacement per frame)
vehicle_memory = {}

# Tracks how many consecutive frames a collision condition has been met
collision_streak = 0

# Cooldown counter to prevent duplicate incident logging
cooldown = 0


# ================= MAIN DETECTION LOOP =================
while True:
    ret, frame = cap.read()

    # Stop if video has ended or cannot be read
    if not ret:
        break

    # Run YOLO vehicle tracking on the current frame
    # persist=True keeps track IDs consistent across frames
    results = vehicle_model.track(frame, persist=True, conf=BASE_CONF, verbose=False)

    # Draw bounding boxes and track IDs on the frame for visualization
    annotated_frame = results[0].plot()

    # Lists and dicts to store per-frame detection data
    boxes     = []  # List of (vehicle_id, bounding_box) tuples
    centers   = {}  # Current center positions {vehicle_id: (cx, cy)}
    speeds    = {}  # Pixel speed per frame {vehicle_id: speed}
    confs_map = {}  # YOLO detection confidence {vehicle_id: confidence}

    # ---- Extract detections if any vehicles are tracked ----
    if results[0].boxes.id is not None:
        ids   = results[0].boxes.id.cpu().numpy()    # Tracked vehicle IDs
        xyxy  = results[0].boxes.xyxy.cpu().numpy()  # Bounding box coordinates
        confs = results[0].boxes.conf.cpu().numpy()  # Detection confidence scores

        for i, box in enumerate(xyxy):
            x1, y1, x2, y2 = box

            # Compute center of bounding box
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2

            vid = int(ids[i])
            centers[vid]   = (cx, cy)
            confs_map[vid] = float(confs[i])
            boxes.append((vid, [x1, y1, x2, y2]))

            # Compute speed as Euclidean distance from last known position
            if vid in vehicle_memory:
                dx = cx - vehicle_memory[vid][0]
                dy = cy - vehicle_memory[vid][1]
                speed = math.sqrt(dx * dx + dy * dy)
                speeds[vid] = speed
            else:
                # First time seeing this vehicle — no speed yet
                speeds[vid] = 0

        # Update memory with current frame positions
        vehicle_memory = centers.copy()

    # ---- Collision Detection ----
    # Reset collision state for this frame
    collision_detected = False
    collision_idA      = None
    collision_idB      = None
    collision_iou      = 0
    collision_conf     = 0

    # Check all pairs of detected vehicles for collision conditions
    for (idA, boxA), (idB, boxB) in combinations(boxes, 2):
        iou = compute_iou(boxA, boxB)

        if idA in speeds and idB in speeds:
            speedA = speeds[idA]
            speedB = speeds[idB]

            # Collision is flagged if:
            #   1. Bounding boxes overlap significantly (IoU above threshold)
            #   2. At least one vehicle has slowed down (speed drop)
            if (
                iou > IOU_THRESHOLD
                and (speedA < SPEED_DROP_THRESHOLD or speedB < SPEED_DROP_THRESHOLD)
            ):
                collision_detected = True
                collision_idA  = idA
                collision_idB  = idB
                collision_iou  = iou

                # Average YOLO confidence of both vehicles involved
                collision_conf = round(
                    (confs_map.get(idA, 0) + confs_map.get(idB, 0)) / 2, 2
                )
                print(f"IoU: {iou:.2f} | Speeds: {speedA:.1f}, {speedB:.1f} | Conf: {collision_conf:.2f}")
                break  # Only log the first detected collision pair per frame

    # ---- Streak Counter ----
    # Increment streak if collision detected this frame, otherwise decay it
    if collision_detected:
        collision_streak += 1
    else:
        collision_streak = max(0, collision_streak - 1)

    # Decrement cooldown counter each frame
    if cooldown > 0:
        cooldown -= 1

    # ---- Incident Confirmation & Logging ----
    # Only log if streak reaches threshold AND cooldown has expired
    if collision_streak >= CONFIRMATION_FRAMES and cooldown == 0:
        timestamp   = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        incident_id = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        # Save a snapshot of the collision frame
        snapshot_filename = f"snapshot_{incident_id}.jpg"
        snapshot_path     = os.path.join(SNAPSHOT_DIR, snapshot_filename)
        cv2.imwrite(snapshot_path, frame)

        # Build the incident record
        incident_data = {
            "incident_id":   incident_id,
            "incident_type": "vehicle_collision",
            "timestamp":     timestamp,
            "snapshot":      snapshot_filename,  # just the filename, NestJS handles the path
            "vehicle_a":     int(collision_idA),
            "vehicle_b":     int(collision_idB),
            "iou":           round(float(collision_iou), 2),
            "confidence":    float(collision_conf)
        }

        # Load existing log entries (or start fresh if file doesn't exist)
        logs = []
        if os.path.exists(LOG_PATH):
            with open(LOG_PATH, "r") as f:
                try:
                    logs = json.load(f)
                except:
                    logs = []

        # Append new incident and save
        logs.append(incident_data)
        with open(LOG_PATH, "w") as f:
            json.dump(logs, f, indent=4)

        print(f"COLLISION CONFIRMED — Vehicle #{collision_idA} & #{collision_idB} | IoU: {collision_iou:.2f} | Conf: {collision_conf:.2f}")

        # Reset streak and start cooldown to avoid duplicate logging
        collision_streak = 0
        cooldown = COOLDOWN_FRAMES

    # ---- Display ----
    # Show the annotated frame in a window
    cv2.imshow("TRAFIQ AI", annotated_frame)

    # Press ESC to stop the detection early
    if cv2.waitKey(1) & 0xFF == 27:
        break

# ================= CLEANUP =================
cap.release()
cv2.destroyAllWindows()
print("Detection complete.")