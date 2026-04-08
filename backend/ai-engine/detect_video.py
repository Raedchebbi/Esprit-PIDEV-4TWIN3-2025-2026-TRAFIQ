# =============================================================
# TRAFIQ – Multi-Camera Risk Assessment Engine v2
# =============================================================
#
# Data flow:
#
#   RTSP × N      YOLO × N     Collision     Groq Vision    Event
#   ─────────     ────────     Check         Assessor       Dispatch
#   cam0.read() ──►            ──► streak    ──► every      ──► sio.emit()
#   cam1.read() ──► track()        confirm       N frames       pymongo
#   cam2.read() ──►                                             write
#        │
#   reconnect on drop
#   (exponential backoff)
#
# HOW TO RUN:
#   cd backend/ai-engine
#   cp .env.example .env        # fill in GROQ_API_KEY, RTSP_CAM_*, etc.
#   pip install -r requirements.txt
#   python detect_video.py
#
# ENVIRONMENT VARIABLES (see .env.example for full list):
#   GROQ_API_KEY            — required when ENABLE_RISK_ASSESSMENT=true
#   RTSP_CAM_0/1/2          — RTSP stream URLs (falls back to accident0.mp4)
#   ENABLE_RISK_ASSESSMENT  — true/false (default: true)
#   RISK_FRAME_INTERVAL     — call Groq every N frames (default: 60)
#   NESTJS_URL              — NestJS Socket.io URL (default: http://localhost:3000)
#   MONGO_URI               — MongoDB connection string
#   SHOW_DISPLAY            — true to open OpenCV preview windows (dev only)
# =============================================================

import os
import io
import json
import math
import time
import queue
import base64
import logging
import datetime
import threading
from dataclasses import dataclass, field
from itertools import combinations
from typing import Optional

import cv2
from ultralytics import YOLO
from PIL import Image
from dotenv import load_dotenv
import groq as groq_sdk
import socketio

from prompts import build_risk_prompt


# ── Bootstrap ──────────────────────────────────────────────────────────────────
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("trafiq.engine")


# ── Config ─────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Camera sources: use RTSP_CAM_* env vars; fall back to test video if none set
_raw_sources = [
    os.environ.get("RTSP_CAM_0"),
    os.environ.get("RTSP_CAM_1"),
    os.environ.get("RTSP_CAM_2"),
    os.environ.get("RTSP_CAM_3"),
    os.environ.get("RTSP_CAM_4"),
]
CAMERA_SOURCES: list[str] = [s for s in _raw_sources if s]
if not CAMERA_SOURCES:
    _fallback_candidates = [
        os.path.join(BASE_DIR, "accident.mp4"),
        os.path.join(BASE_DIR, "accident0.mp4"),
    ]
    CAMERA_SOURCES = [src for src in _fallback_candidates if os.path.exists(src)]
    if not CAMERA_SOURCES:
        _fallback = os.path.join(BASE_DIR, "accident.mp4")
        CAMERA_SOURCES = [_fallback]
    logger.warning(
        "No RTSP_CAM_* env vars found — using fallback sources: %s",
        ", ".join(CAMERA_SOURCES),
    )

MODEL_PATH             = os.path.join(BASE_DIR, "models", "vehicule-model.pt")
SNAPSHOT_DIR           = os.path.join(BASE_DIR, "snapshots")
BASE_CONF              = float(os.environ.get("BASE_CONF", "0.35"))
IOU_THRESHOLD          = float(os.environ.get("IOU_THRESHOLD", "0.4"))
# IoU > this value = duplicate detection of same object, not a real collision
IOU_MAX_THRESHOLD      = float(os.environ.get("IOU_MAX_THRESHOLD", "0.85"))
# Collision proximity: boxes within this fraction of avg vehicle diagonal are "colliding".
PROXIMITY_THRESHOLD    = float(os.environ.get("PROXIMITY_THRESHOLD", "0.18"))
# Both vehicles in a collision pair must individually meet this confidence
MIN_PAIR_CONF          = float(os.environ.get("MIN_PAIR_CONF", "0.50"))
SPEED_DROP_THRESHOLD   = float(os.environ.get("SPEED_DROP_THRESHOLD", "12"))
# Minimum box area (px²) — boxes smaller than this are noise/distant reflections, not vehicles
MIN_BOX_AREA           = float(os.environ.get("MIN_BOX_AREA", "3000"))
# A collision pair must have similar-sized boxes: smaller/larger ratio must exceed this
MIN_BOX_SIZE_RATIO     = float(os.environ.get("MIN_BOX_SIZE_RATIO", "0.25"))
# If a vehicle's decayed peak speed (px/frame) never exceeded this, it was never moving
# fast enough to have been in a real crash (distinguishes normal red-light stop from crash)
SPEED_HIGH_THRESHOLD   = float(os.environ.get("SPEED_HIGH_THRESHOLD", "8.0"))
CONFIRMATION_FRAMES    = int(os.environ.get("CONFIRMATION_FRAMES", "3"))
COOLDOWN_FRAMES        = int(os.environ.get("COOLDOWN_FRAMES", "500"))
RISK_FRAME_INTERVAL    = int(os.environ.get("RISK_FRAME_INTERVAL", "60"))
ENABLE_RISK_ASSESSMENT = os.environ.get("ENABLE_RISK_ASSESSMENT", "true").lower() == "true"
NESTJS_URL             = os.environ.get("NESTJS_URL", "http://localhost:3000")
INCIDENTS_FILE         = os.path.join(BASE_DIR, "incidents.jsonl")
GROQ_API_KEY           = os.environ.get("GROQ_API_KEY")
MAX_RECONNECT_ATTEMPTS = int(os.environ.get("MAX_RECONNECT_ATTEMPTS", "10"))
SHOW_DISPLAY           = os.environ.get("SHOW_DISPLAY", "false").lower() == "true"

os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# Fail fast on missing Groq key so the error is obvious at startup
if ENABLE_RISK_ASSESSMENT and not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is not set but ENABLE_RISK_ASSESSMENT=true.\n"
        "Add it to .env or set ENABLE_RISK_ASSESSMENT=false to run YOLO-only."
    )


# ── Model Load ─────────────────────────────────────────────────────────────────
logger.info("Loading vehicle detection model: %s", MODEL_PATH)
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model file not found: {MODEL_PATH}\n"
        "Place your .pt weights file inside backend/ai-engine/models/"
    )
vehicle_model = YOLO(MODEL_PATH)
logger.info("Model loaded. Classes: %s", vehicle_model.names)


# ── Socket.io Client (Python → NestJS) ────────────────────────────────────────
sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=10,
    reconnection_delay=2,
    logger=False,
    engineio_logger=False,
    handle_sigint=False,
)

@sio.event
def connect():
    logger.info("[WS] Connected to NestJS at %s", NESTJS_URL)

@sio.event
def disconnect():
    logger.warning("[WS] Disconnected from NestJS — auto-reconnect active")

@sio.event
def connect_error(data):
    logger.warning("[WS] Connection error: %s", data)

def connect_to_nestjs() -> bool:
    try:
        sio.connect(NESTJS_URL, wait_timeout=5)
        return True
    except Exception as exc:
        logger.warning(
            "[WS] Could not connect to NestJS (%s) — engine runs without real-time push", exc
        )
        return False


# ── Groq Client ────────────────────────────────────────────────────────────────
_groq_client = groq_sdk.Groq(api_key=GROQ_API_KEY, max_retries=0) if ENABLE_RISK_ASSESSMENT else None

# Groq runs in a background thread so API latency / retries never block the video loop.
# maxsize=1: if worker is still busy, the main loop drops the request — no queue pile-up.
_groq_queue       = queue.Queue(maxsize=1)
_groq_result: dict       = {"risk_score": 0.0, "risk_level": "LOW", "source": "init"}
_groq_result_lock = threading.Lock()


# ── Data Classes ───────────────────────────────────────────────────────────────

@dataclass
class CameraState:
    """
    Mutable per-camera state that persists across frames.

    vehicle_memory  : last known center (cx, cy) per tracked vehicle ID
    collision_streak: consecutive frames with an active collision condition
    cooldown        : frames remaining before another incident can be logged
    last_good_frame : most recent valid frame (used as placeholder if cam drops)
    online          : whether the camera is currently connected
    """
    cam_id:           int
    url:              str
    cap:              cv2.VideoCapture
    vehicle_memory:   dict = field(default_factory=dict)
    collision_streak: int  = 0
    cooldown:         int  = 0
    last_good_frame:  object = None   # np.ndarray | None
    online:           bool  = True
    display_collision_ttl: int  = 0          # frames left to keep collision overlay visible
    display_box_a:    Optional[list] = None  # last confirmed colliding box A (lingering display)
    display_box_b:    Optional[list] = None  # last confirmed colliding box B
    speed_peak:       dict = field(default_factory=dict)  # {vid: decayed peak speed} for recent-movement check


def _open_capture(url: str) -> cv2.VideoCapture:
    """Open a camera/video stream."""
    return cv2.VideoCapture(url)


@dataclass
class FrameFeatures:
    """Per-camera, per-frame detection output."""
    cam_id:             int
    vehicle_count:      int
    near_miss_count:    int     # boxes with IoU > 60% of threshold
    max_iou:            float
    collision_detected: bool
    collision_idA:      Optional[int]
    collision_idB:      Optional[int]
    collision_iou:      float
    collision_conf:     float
    frame:              object          # np.ndarray | None
    collision_box_a:    Optional[list]  # [x1,y1,x2,y2] of vehicle A
    collision_box_b:    Optional[list]  # [x1,y1,x2,y2] of vehicle B
    plotted_frame:      object = None   # YOLO-annotated frame for display


# ── Helper: IoU ────────────────────────────────────────────────────────────────

def compute_iou(boxA, boxB) -> float:
    """
    Intersection over Union between two [x1, y1, x2, y2] bounding boxes.
    Returns 0.0 if boxes don't overlap or have zero area.
    """
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    union = areaA + areaB - inter
    return inter / union if union > 0 else 0.0


def compute_box_gap_ratio(boxA, boxB) -> float:
    """
    Normalized gap between two bounding boxes, expressed as a fraction of the
    average vehicle diagonal.

    - 0.0  = boxes just touching (no gap, no overlap)
    - < 0  conceptually (any overlap means gap_x=0 AND gap_y=0 → ratio=0)
    - > 0  = boxes separated; 1.0 = gap equal to one full vehicle diagonal

    This catches side-impact / T-bone aftermath where bounding boxes are
    adjacent but don't actually overlap (IoU ≈ 0 despite a real collision).
    """
    gap_x   = max(0.0, max(boxA[0], boxB[0]) - min(boxA[2], boxB[2]))
    gap_y   = max(0.0, max(boxA[1], boxB[1]) - min(boxA[3], boxB[3]))
    avg_w   = ((boxA[2] - boxA[0]) + (boxB[2] - boxB[0])) / 2
    avg_h   = ((boxA[3] - boxA[1]) + (boxB[3] - boxB[1])) / 2
    diag    = math.sqrt(avg_w ** 2 + avg_h ** 2)
    return math.sqrt(gap_x ** 2 + gap_y ** 2) / max(diag, 1.0)


# ── Helper: Camera Reconnect ───────────────────────────────────────────────────

def reconnect_camera(state: CameraState) -> bool:
    """
    Try to reopen a dropped RTSP stream with exponential backoff.
    Caps delay at 30 seconds per attempt.
    Returns True on success, False after MAX_RECONNECT_ATTEMPTS.
    """
    if state.cap:
        state.cap.release()

    for attempt in range(1, MAX_RECONNECT_ATTEMPTS + 1):
        delay = min(2 ** attempt, 30)
        logger.warning(
            "[CAM-%d] Reconnect attempt %d/%d in %ds",
            state.cam_id, attempt, MAX_RECONNECT_ATTEMPTS, delay,
        )
        time.sleep(delay)
        cap = _open_capture(state.url)
        if cap.isOpened():
            state.cap    = cap
            state.online = True
            logger.info("[CAM-%d] Reconnected.", state.cam_id)
            _push_event("camera_status", {"cam_id": state.cam_id, "status": "online"})
            return True
        cap.release()

    logger.error(
        "[CAM-%d] Gave up reconnecting after %d attempts.", state.cam_id, MAX_RECONNECT_ATTEMPTS
    )
    state.online = False
    _push_event("camera_status", {"cam_id": state.cam_id, "status": "offline"})
    return False


# ── Helper: Feature Extraction ─────────────────────────────────────────────────

def extract_features(state: CameraState, frame) -> FrameFeatures:
    """
    Run YOLO tracking on one frame and compute collision indicators.

    Mutates state.vehicle_memory, state.collision_streak, state.cooldown.

    Near-miss: any pair with IoU > IOU_THRESHOLD * 0.6 (approaching threshold).
    Collision : IoU > IOU_THRESHOLD AND at least one vehicle nearly stopped.
    """
    # Use predict() instead of track() — using track(persist=True) with a single
    # model across multiple cameras corrupts ByteTrack's internal state (it tries
    # to match cam0 objects in cam1's frame).  We compute our own inter-frame
    # matching via vehicle_memory centers, so built-in tracking is not needed.
    try:
        results = vehicle_model.predict(frame, conf=BASE_CONF, iou=0.45, verbose=False)
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        logger.exception("[CAM-%d] YOLO predict failed on frame: %s", state.cam_id, exc)
        return FrameFeatures(
            cam_id=state.cam_id,
            vehicle_count=0,
            near_miss_count=0,
            max_iou=0.0,
            collision_detected=False,
            collision_idA=None,
            collision_idB=None,
            collision_iou=0.0,
            collision_conf=0.0,
            frame=frame,
            collision_box_a=None,
            collision_box_b=None,
            plotted_frame=frame.copy() if SHOW_DISPLAY and frame is not None else None,
        )

    # YOLO-rendered frame (boxes + track IDs) — only used for live display
    plotted_frame = results[0].plot() if SHOW_DISPLAY else None

    boxes      = []   # list of (vehicle_id, [x1,y1,x2,y2])
    centers    = {}   # {vid: (cx, cy)}
    speeds     = {}   # {vid: pixel_displacement}
    confs_map  = {}   # {vid: confidence}
    near_misses = 0
    max_iou     = 0.0

    raw_xyxy  = results[0].boxes.xyxy.cpu().numpy()
    raw_confs = results[0].boxes.conf.cpu().numpy()

    if len(raw_xyxy) > 0:
        # ── Post-detection deduplication ──────────────────────────────────────
        _raw = sorted(
            zip(range(len(raw_xyxy)), raw_xyxy, raw_confs),
            key=lambda t: float(t[2]),
            reverse=True,
        )
        _kept_boxes: list[list] = []
        _kept_confs: list[float] = []
        for _idx, _box, _conf in _raw:
            _duplicate = any(
                compute_iou([float(v) for v in _box], _kb) > 0.60
                for _kb in _kept_boxes
            )
            if not _duplicate:
                _kept_boxes.append([float(v) for v in _box])
                _kept_confs.append(float(_conf))

        # Assign IDs by matching to previous frame's centers (nearest-neighbor)
        _next_id = getattr(state, '_next_vid', state.cam_id * 10000)
        for box, conf in zip(_kept_boxes, _kept_confs):
            x1, y1, x2, y2 = box
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2

            # Match to nearest previous-frame center for ID continuity
            best_vid = None
            best_dist = 80.0  # max pixels to consider same vehicle
            for prev_vid, (px, py) in state.vehicle_memory.items():
                if prev_vid in centers:  # already claimed
                    continue
                d = math.sqrt((cx - px) ** 2 + (cy - py) ** 2)
                if d < best_dist:
                    best_dist = d
                    best_vid = prev_vid
            if best_vid is not None:
                vid = best_vid
            else:
                vid = _next_id
                _next_id += 1

            centers[vid]   = (cx, cy)
            confs_map[vid] = conf
            boxes.append((vid, box))

            if vid in state.vehicle_memory:
                dx = cx - state.vehicle_memory[vid][0]
                dy = cy - state.vehicle_memory[vid][1]
                speeds[vid] = math.sqrt(dx * dx + dy * dy)
            else:
                speeds[vid] = 0.0

        state._next_vid = _next_id
        state.vehicle_memory = centers.copy()

    # Update decayed peak speed for each tracked vehicle.
    # 0.92 decay ≈ peak halves every ~8 frames (0.27 s at 30 fps).
    # A car braking gradually over 2 s (60 frames) loses its peak entirely by
    # the time it stops; a collision (1–2 frames) keeps peak > SPEED_HIGH_THRESHOLD.
    for vid in speeds:
        prev_peak = state.speed_peak.get(vid, 0.0)
        state.speed_peak[vid] = max(speeds[vid], prev_peak * 0.92)
    # Remove stale entries for vehicles no longer visible
    state.speed_peak = {v: p for v, p in state.speed_peak.items() if v in speeds}

    # Collision / near-miss detection across all vehicle pairs
    collision_detected = False
    collision_idA = collision_idB = None
    collision_iou = collision_conf = 0.0
    _collision_box_a = _collision_box_b = None

    # Debug: track best candidate per frame for periodic logging
    _dbg_best_gap = 999.0
    _dbg_best_pair = None

    for (idA, boxA), (idB, boxB) in combinations(boxes, 2):
        iou = compute_iou(boxA, boxB)
        if iou > max_iou:
            max_iou = iou

        # Near-miss: boxes approaching the collision threshold
        if iou > IOU_THRESHOLD * 0.6:
            near_misses += 1

        # ── Noise filters (skip before expensive proximity check) ─────────────
        area_A = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        area_B = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
        # 1. Tiny box → noise / distant reflection, not a real vehicle
        if area_A < MIN_BOX_AREA or area_B < MIN_BOX_AREA:
            continue
        # 2. Highly mismatched sizes → tiny ghost paired with a real car
        size_ratio = min(area_A, area_B) / max(area_A, area_B)
        if size_ratio < MIN_BOX_SIZE_RATIO:
            continue
        # 3. At least one vehicle must have moved fast recently.
        #    Guards against two cars that stopped normally at a red light.
        spA = state.speed_peak.get(idA, 0.0)
        spB = state.speed_peak.get(idB, 0.0)
        if spA < SPEED_HIGH_THRESHOLD and spB < SPEED_HIGH_THRESHOLD:
            continue
        # ─────────────────────────────────────────────────────────────────────

        gap_ratio = compute_box_gap_ratio(boxA, boxB)

        # Track closest qualifying pair for debug
        if gap_ratio < _dbg_best_gap:
            _dbg_best_gap = gap_ratio
            _dbg_best_pair = {
                "ids": (idA, idB), "gap": gap_ratio, "iou": iou,
                "spdA": speeds.get(idA, -1), "spdB": speeds.get(idB, -1),
                "spkA": spA, "spkB": spB,
                "confA": confs_map.get(idA, 0), "confB": confs_map.get(idB, 0),
                "areaA": area_A, "areaB": area_B,
            }

        if (
            not collision_detected
            and gap_ratio < PROXIMITY_THRESHOLD
            and iou < IOU_MAX_THRESHOLD
            and idA in speeds and idB in speeds
            # BOTH vehicles must be slow — rules out one slow + one moving fast in same lane
            and speeds[idA] < SPEED_DROP_THRESHOLD
            and speeds[idB] < SPEED_DROP_THRESHOLD
            and confs_map.get(idA, 0.0) >= MIN_PAIR_CONF
            and confs_map.get(idB, 0.0) >= MIN_PAIR_CONF
        ):
            collision_detected = True
            collision_idA  = idA
            collision_idB  = idB
            collision_iou  = iou
            collision_conf = round(
                (confs_map.get(idA, 0.0) + confs_map.get(idB, 0.0)) / 2, 2
            )
            _collision_box_a = [float(v) for v in boxA]
            _collision_box_b = [float(v) for v in boxB]

    # Periodic debug log (every 60 frames ≈ 2s)
    state._dbg_counter = getattr(state, "_dbg_counter", 0) + 1
    if state._dbg_counter % 60 == 0:
        logger.info(
            "[CAM-%d] DBG vehicles=%d near_miss=%d max_iou=%.3f streak=%d cd=%d best_pair=%s",
            state.cam_id, len(boxes), near_misses, max_iou,
            state.collision_streak, state.cooldown,
            _dbg_best_pair,
        )

    # Update streak (grows on collision, decays otherwise) and cooldown
    state.collision_streak = (
        state.collision_streak + 1 if collision_detected
        else max(0, state.collision_streak - 1)
    )
    if state.cooldown > 0:
        state.cooldown -= 1

    return FrameFeatures(
        cam_id=state.cam_id,
        vehicle_count=len(boxes),
        near_miss_count=near_misses,
        max_iou=max_iou,
        collision_detected=collision_detected,
        collision_idA=collision_idA,
        collision_idB=collision_idB,
        collision_iou=collision_iou,
        collision_conf=collision_conf,
        frame=frame,
        collision_box_a=_collision_box_a if collision_detected else None,
        collision_box_b=_collision_box_b if collision_detected else None,
        plotted_frame=plotted_frame,
    )


# ── Helper: Scene Fusion ───────────────────────────────────────────────────────

def fuse_scenes(features_list: list, camera_states: list) -> dict:
    """
    Merge per-camera FrameFeatures into one scene dict for the Groq prompt.
    """
    per_camera = [
        {
            "cam_id":               feat.cam_id,
            "online":               state.online,
            "vehicle_count":        feat.vehicle_count,
            "near_miss_count":      feat.near_miss_count,
            "max_iou":              round(feat.max_iou, 2),
            "collision_streak":     state.collision_streak,
            "collision_detected":   feat.collision_detected,
            # True if this camera has an active confirmed-incident TTL
            "collision_confirmed":  state.display_collision_ttl > 0,
        }
        for feat, state in zip(features_list, camera_states)
    ]
    any_confirmed = any(s.display_collision_ttl > 0 for s in camera_states)
    return {
        "camera_count":        len(features_list),
        "total_vehicles":      sum(f.vehicle_count for f in features_list),
        "total_near_misses":   sum(f.near_miss_count for f in features_list),
        "max_iou":             max((f.max_iou for f in features_list), default=0.0),
        "cameras_with_streak": sum(1 for s in camera_states if s.collision_streak > 0),
        "collision_confirmed": any_confirmed,
        "per_camera":          per_camera,
    }


# ── Helper: Composite Image ────────────────────────────────────────────────────

def build_composite_image(frames: list) -> str:
    """
    Tile camera frames into a grid JPEG for Groq vision.

    Layout:
      1 camera  → 640×480  (single tile, full quality)
      2 cameras → 640×240  (side by side)
      3 cameras → 2×2 grid, 640×480 (cam0 top-left, cam1 top-right, cam2 bottom-left, blank bottom-right)
      4 cameras → 2×2 grid, 640×480

    Keeping total composite ≤ 640×480 ensures Groq receives clear detail
    without hitting token / size limits.
    """
    import math as _math

    n = len(frames)
    if n <= 2:
        TILE_W, TILE_H = 640 // max(n, 1), 480
        cols, rows = n, 1
    else:
        # 2-column grid
        cols = 2
        rows = _math.ceil(n / cols)
        TILE_W, TILE_H = 320, 240

    tiles = []
    for frame in frames:
        if frame is None:
            img = Image.new("RGB", (TILE_W, TILE_H), color=(20, 20, 20))
        else:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(rgb).resize((TILE_W, TILE_H))
        tiles.append(img)

    # Pad to fill the grid
    while len(tiles) < cols * rows:
        tiles.append(Image.new("RGB", (TILE_W, TILE_H), color=(10, 10, 10)))

    composite = Image.new("RGB", (TILE_W * cols, TILE_H * rows))
    for idx, tile in enumerate(tiles):
        col = idx % cols
        row = idx // cols
        composite.paste(tile, (TILE_W * col, TILE_H * row))

    buf = io.BytesIO()
    composite.save(buf, format="JPEG", quality=75)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ── Helper: Algorithmic Risk Fallback ─────────────────────────────────────────

def algorithmic_risk_score(scene: dict, reason: str = "fallback", collision: bool = False) -> dict:
    """
    Pure heuristic risk score used when Groq is unavailable.

    If `collision=True` (proximity-based detection fired), the score is forced
    to CRITICAL (0.95) regardless of IoU — because proximity collisions have
    IoU≈0 by design (T-bone / side-impact) and would otherwise score LOW.

    Score = weighted sum of:
      - max IoU overlap             (50% weight — strongest collision signal)
      - near-miss events            (15% per event, capped by formula)
      - vehicle density             (2% per vehicle, up to 15 vehicles)
      - cameras with active streak  (20% each)
    """
    if collision:
        return {
            "risk_score":         0.95,
            "risk_level":         "CRITICAL",
            "primary_factors":    ["proximity_collision"],
            "reasoning":          "Collision detected (proximity): vehicles touching/overlapping.",
            "recommended_action": "Dispatch emergency services immediately.",
            "source":             "heuristic",
        }

    max_iou     = scene.get("max_iou", 0.0)
    near_misses = scene.get("total_near_misses", 0)
    vehicles    = min(scene.get("total_vehicles", 0), 15)
    streaks     = scene.get("cameras_with_streak", 0)

    score = min(1.0,
        max_iou     * 0.50 +
        near_misses * 0.15 +
        vehicles    * 0.02 +
        streaks     * 0.20
    )

    if   score >= 0.80: level = "CRITICAL"
    elif score >= 0.60: level = "HIGH"
    elif score >= 0.30: level = "MEDIUM"
    else:               level = "LOW"

    return {
        "risk_score":         round(score, 2),
        "risk_level":         level,
        "primary_factors":    [reason],
        "reasoning":          (
            f"Heuristic: "
            f"IoU={max_iou:.2f}, near_misses={near_misses}, "
            f"vehicles={vehicles}, streaks={streaks}"
        ),
        "recommended_action": "Monitor intersection.",
        "source":             "heuristic",
    }


# ── Helper: Groq Risk Assessment ──────────────────────────────────────────────

def assess_risk(scene: dict, frames: list, last_risk: dict) -> dict:
    """
    Call Groq llama-3.2-11b-vision-preview with a composite camera image
    and structured telemetry. Returns a risk dict on both success and failure.

    Failure modes handled (all fall back to algorithmic_risk_score):
      - RateLimitError     : too many requests — slow down
      - APITimeoutError    : network timeout
      - AuthenticationError: bad API key — disables Groq for this session
      - APIConnectionError : Groq unreachable
      - JSONDecodeError    : model returned non-JSON
      - KeyError/ValueError: response missing required fields
      - empty content      : model returned nothing
    """
    global ENABLE_RISK_ASSESSMENT, _groq_client
    if not ENABLE_RISK_ASSESSMENT or _groq_client is None:
        return algorithmic_risk_score(scene, reason="disabled")

    # Skip Groq if there are no vehicles — no risk to assess
    if scene["total_vehicles"] == 0:
        return {
            "risk_score":         0.0,
            "risk_level":         "LOW",
            "primary_factors":    ["no_vehicles"],
            "reasoning":          "No vehicles detected in any camera.",
            "recommended_action": "Normal monitoring.",
            "source":             "heuristic",
        }

    try:
        composite_b64 = build_composite_image(frames)
        messages      = build_risk_prompt(scene, last_risk, composite_b64)

        t0 = time.monotonic()
        response = _groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=messages,
            max_tokens=300,
            temperature=0.1,
        )
        latency_ms = round((time.monotonic() - t0) * 1000)

        content = response.choices[0].message.content
        if not content or not content.strip():
            logger.warning("Groq returned empty content — heuristic fallback")
            return algorithmic_risk_score(scene, reason="empty_response")

        # Strip markdown code fences that some models add despite instructions
        text = content.strip()
        if "```" in text:
            parts = text.split("```")
            text = parts[1].lstrip("json").strip() if len(parts) > 1 else text

        result = json.loads(text)

        # Sanitise output
        result["risk_score"] = max(0.0, min(1.0, float(result.get("risk_score", 0.0))))
        result["risk_level"] = str(result.get("risk_level", "UNKNOWN")).upper()
        result["source"]     = "groq"

        logger.info(
            "Groq risk: %.2f [%s] latency=%dms — %s",
            result["risk_score"], result["risk_level"], latency_ms,
            str(result.get("reasoning", ""))[:80],
        )
        return result

    except groq_sdk.RateLimitError:
        logger.warning("Groq rate limit — heuristic fallback. Increase RISK_FRAME_INTERVAL.")
        return algorithmic_risk_score(scene, reason="rate_limited")

    except groq_sdk.APITimeoutError:
        logger.warning("Groq timeout — heuristic fallback")
        return algorithmic_risk_score(scene, reason="timeout")

    except groq_sdk.AuthenticationError:
        logger.error(
            "Groq authentication failed — check GROQ_API_KEY. "
            "Disabling Groq for this session."
        )
        # Disable for remainder of session to avoid spamming failed auth requests
        ENABLE_RISK_ASSESSMENT = False
        _groq_client           = None
        return algorithmic_risk_score(scene, reason="auth_error")

    except (groq_sdk.APIConnectionError, groq_sdk.APIError) as exc:
        logger.warning("Groq API error: %s — heuristic fallback", exc)
        return algorithmic_risk_score(scene, reason="api_error")

    except json.JSONDecodeError as exc:
        logger.warning("Groq non-JSON response: %s — heuristic fallback", exc)
        return algorithmic_risk_score(scene, reason="parse_error")

    except (KeyError, ValueError, TypeError) as exc:
        logger.warning("Groq response schema invalid: %s — heuristic fallback", exc)
        return algorithmic_risk_score(scene, reason="schema_error")


# ── Helper: Incident Persistence ──────────────────────────────────────────────

def _annotate_frame(frame, feat: FrameFeatures, label: str):
    """
    Draw collision bounding boxes and an info banner onto a copy of the frame.
    Returns the annotated copy without mutating the original.
    """
    import numpy as np
    out = frame.copy()
    h, w = out.shape[:2]

    # Draw red boxes around the two colliding vehicles
    for box in (feat.collision_box_a, feat.collision_box_b):
        if box is None:
            continue
        x1, y1, x2, y2 = (int(v) for v in box)
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 0, 220), 3)

    # Semi-transparent dark banner at the bottom
    banner_h = 52
    overlay  = out.copy()
    cv2.rectangle(overlay, (0, h - banner_h), (w, h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, out, 0.45, 0, out)

    # Text lines
    font       = cv2.FONT_HERSHEY_DUPLEX
    small_font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(out, "COLLISION DETECTED", (8, h - banner_h + 22),
                font, 0.65, (0, 60, 255), 2, cv2.LINE_AA)
    cv2.putText(out,
                f"IoU={feat.collision_iou:.2f}  Conf={feat.collision_conf:.2f}  {label}",
                (8, h - banner_h + 44),
                small_font, 0.48, (200, 200, 200), 1, cv2.LINE_AA)
    return out


def save_incident(
    state: CameraState,
    feat: FrameFeatures,
    last_risk: dict,
) -> Optional[str]:
    """
    Confirm and persist a collision incident.

    Fires only when collision_streak >= CONFIRMATION_FRAMES AND cooldown == 0.
    Saves an annotated JPEG snapshot and appends to incidents.jsonl.
    Returns the snapshot filename, or None if not yet confirmed.
    """
    if state.collision_streak < CONFIRMATION_FRAMES or state.cooldown > 0:
        return None

    now           = datetime.datetime.now()
    incident_id   = now.strftime("%Y%m%d_%H%M%S") + f"_cam{feat.cam_id}"
    snap_filename = f"snapshot_{incident_id}.jpg"
    snap_path     = os.path.join(SNAPSHOT_DIR, snap_filename)

    # Write annotated snapshot to disk
    if feat.frame is not None:
        try:
            ts_label  = now.strftime("%Y-%m-%d %H:%M:%S")
            annotated = _annotate_frame(feat.frame, feat, ts_label)
            cv2.imwrite(snap_path, annotated)
        except OSError as exc:
            logger.error("Snapshot write failed: %s", exc)

    incident_data = {
        "incident_id":   incident_id,
        "incident_type": "vehicle_collision",
        "timestamp":     now.strftime("%Y-%m-%d %H:%M:%S"),
        "snapshot":      snap_filename,
        "vehicle_a":     int(feat.collision_idA) if feat.collision_idA is not None else -1,
        "vehicle_b":     int(feat.collision_idB) if feat.collision_idB is not None else -1,
        "iou":           round(float(feat.collision_iou), 2),
        "confidence":    float(feat.collision_conf),
        "camera_id":     f"cam{feat.cam_id}",
        # risk assessment at the moment of incident
        "risk_score":    last_risk.get("risk_score", 0.0),
        "risk_level":    last_risk.get("risk_level", "UNKNOWN"),
        "risk_reason":   last_risk.get("reasoning", ""),
    }

    # Append incident to JSONL file (one JSON object per line)
    try:
        with open(INCIDENTS_FILE, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(incident_data) + "\n")
    except OSError as exc:
        logger.error("Incident file write failed: %s", exc)

    # Reset to prevent duplicate logging
    state.collision_streak = 0
    state.cooldown         = COOLDOWN_FRAMES

    logger.info(
        "COLLISION CONFIRMED — CAM-%d | #%s vs #%s | IoU=%.2f | Conf=%.2f | Risk=%s",
        feat.cam_id, feat.collision_idA, feat.collision_idB,
        feat.collision_iou, feat.collision_conf,
        last_risk.get("risk_level", "?"),
    )
    return snap_filename


# ── Helper: Live Display Overlay ──────────────────────────────────────────────

_RISK_COLORS = {
    "LOW":      (0,   200,  60),   # green
    "MEDIUM":   (0,   200, 220),   # yellow (BGR)
    "HIGH":     (0,   140, 255),   # orange
    "CRITICAL": (0,    30, 220),   # red
}

def _draw_display(feat: FrameFeatures, last_risk: dict, cam_state: CameraState) -> object:
    """
    Compose the live display frame:
      - YOLO-plotted boxes (track IDs + confidence) as background
      - Red boxes flashing on the colliding pair
      - Top banner: camera ID, vehicle count, near-misses
      - Bottom banner: risk level (color-coded) + reasoning snippet
    """
    base = feat.plotted_frame if feat.plotted_frame is not None else (
        feat.frame.copy() if feat.frame is not None else None
    )
    if base is None:
        return None

    h, w = base.shape[:2]
    font   = cv2.FONT_HERSHEY_DUPLEX
    small  = cv2.FONT_HERSHEY_SIMPLEX

    # ── Collision flash: thick red boxes on the colliding pair ────────────
    # Show either the live detection OR the lingering overlay (TTL > 0)
    show_collision = feat.collision_detected or cam_state.display_collision_ttl > 0
    _box_a = feat.collision_box_a if feat.collision_detected else cam_state.display_box_a
    _box_b = feat.collision_box_b if feat.collision_detected else cam_state.display_box_b

    if show_collision:
        for box in (_box_a, _box_b):
            if box:
                x1, y1, x2, y2 = (int(v) for v in box)
                cv2.rectangle(base, (x1, y1), (x2, y2), (0, 0, 255), 4)
                cv2.rectangle(base, (x1-2, y1-2), (x2+2, y2+2), (0, 0, 180), 2)

    # ── Top banner: camera info ───────────────────────────────────────────
    overlay = base.copy()
    cv2.rectangle(overlay, (0, 0), (w, 36), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.6, base, 0.4, 0, base)

    status = "ONLINE" if cam_state.online else "OFFLINE"
    top_text = (
        f"CAM-{feat.cam_id}  [{status}]   "
        f"Vehicles: {feat.vehicle_count}   "
        f"Near-miss: {feat.near_miss_count}   "
        f"Max IoU: {feat.max_iou:.2f}"
    )
    cv2.putText(base, top_text, (8, 24), small, 0.50, (220, 220, 220), 1, cv2.LINE_AA)

    # ── Bottom banner: risk level (80px tall — fits 3 text rows) ─────────
    level  = last_risk.get("risk_level", "LOW")
    score  = last_risk.get("risk_score", 0.0)
    reason = str(last_risk.get("reasoning", ""))
    color  = _RISK_COLORS.get(level, (200, 200, 200))

    BANNER_H = 80
    banner_y = h - BANNER_H

    overlay2 = base.copy()
    cv2.rectangle(overlay2, (0, banner_y), (w, h), (15, 15, 15), -1)
    cv2.addWeighted(overlay2, 0.65, base, 0.35, 0, base)

    # Filled risk badge (left side)
    badge_w = 130
    cv2.rectangle(base, (0, banner_y), (badge_w, h), color, -1)
    cv2.putText(base, level,              (6, banner_y + 28), font,  0.70, (10, 10, 10), 2, cv2.LINE_AA)
    cv2.putText(base, f"score {score:.2f}", (6, banner_y + 52), small, 0.42, (30, 30, 30), 1, cv2.LINE_AA)

    # Reasoning split across two lines (~60 chars each)
    text_x = badge_w + 8
    max_chars = 62
    line1 = reason[:max_chars]
    line2 = reason[max_chars:max_chars * 2]
    cv2.putText(base, line1, (text_x, banner_y + 22), small, 0.42, (200, 200, 200), 1, cv2.LINE_AA)
    if line2:
        cv2.putText(base, line2, (text_x, banner_y + 42), small, 0.42, (180, 180, 180), 1, cv2.LINE_AA)

    # Collision alert text (3rd row)
    if show_collision:
        if feat.collision_detected:
            alert = f"!! COLLISION  IoU={feat.collision_iou:.2f}  Conf={feat.collision_conf:.2f}"
        else:
            alert = f"!! COLLISION (confirmed)  [{cam_state.display_collision_ttl}f remaining]"
        cv2.putText(base, alert, (text_x, banner_y + 64), small, 0.46, (60, 60, 255), 1, cv2.LINE_AA)

    return base


# ── Helper: Event Push ─────────────────────────────────────────────────────────

def _to_json_safe(obj):
    """Recursively convert numpy scalars to Python native types."""
    if isinstance(obj, dict):
        return {k: _to_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_json_safe(v) for v in obj]
    # numpy scalars (float32, int64, …) expose .item() → Python native
    if hasattr(obj, 'item'):
        return obj.item()
    return obj


def _push_event(event_name: str, payload: dict) -> None:
    """Emit a socket.io event to NestJS. Silent no-op if not connected."""
    if sio.connected:
        try:
            sio.emit(event_name, _to_json_safe(payload))
        except Exception as exc:
            logger.warning("[WS] emit '%s' failed: %s", event_name, exc)


# ── Groq Background Worker ────────────────────────────────────────────────────

def _groq_worker() -> None:
    """
    Runs in a daemon thread.  Consumes (scene, frames, prev_risk, frame_count)
    tuples from _groq_queue, calls assess_risk(), writes the result into the
    shared _groq_result dict, and pushes a risk_event over socket.io.

    Sending None is the shutdown sentinel.
    """
    while True:
        item = _groq_queue.get()
        if item is None:                        # shutdown sentinel
            _groq_queue.task_done()
            return
        scene, frames, prev_risk, fc = item
        risk = assess_risk(scene, frames, prev_risk)
        with _groq_result_lock:
            _groq_result.clear()
            _groq_result.update(risk)
        _push_event("risk_event", {
            **risk,
            "frame_count": fc,
            "timestamp":   datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "scene_summary": {
                "total_vehicles":      scene["total_vehicles"],
                "total_near_misses":   scene["total_near_misses"],
                "cameras_with_streak": scene["cameras_with_streak"],
            },
        })
        _groq_queue.task_done()


# ── Camera Initialisation ──────────────────────────────────────────────────────

def init_cameras(sources: list) -> list[CameraState]:
    """
    Open a VideoCapture for each source URL.
    Raises RuntimeError if no camera could be opened at all.
    """
    states = []
    for i, url in enumerate(sources):
        cap = _open_capture(url)
        if cap.isOpened():
            logger.info("[CAM-%d] Opened: %s", i, url)
        else:
            logger.warning("[CAM-%d] Could not open: %s — will retry on first failed read", i, url)
        states.append(CameraState(cam_id=i, url=url, cap=cap, online=cap.isOpened()))

    if not any(s.online for s in states):
        raise RuntimeError(
            "No camera sources could be opened.\n"
            "Check RTSP_CAM_* values in .env or ensure accident0.mp4 exists."
        )
    return states


# ── Main Loop ──────────────────────────────────────────────────────────────────

def main() -> None:
    logger.info("=== TRAFIQ Engine Starting ===")
    logger.info("  Cameras           : %d  (%s)", len(CAMERA_SOURCES),
                ", ".join(CAMERA_SOURCES))
    logger.info("  Risk assessment   : %s", "ENABLED" if ENABLE_RISK_ASSESSMENT else "DISABLED")
    logger.info("  Groq min interval : %.1f s  (env: MIN_GROQ_INTERVAL_S)", float(os.environ.get("MIN_GROQ_INTERVAL_S", "15.0")))
    logger.info("  NestJS URL        : %s", NESTJS_URL)
    logger.info("  Incidents file    : %s", INCIDENTS_FILE)

    connect_to_nestjs()
    camera_states = init_cameras(CAMERA_SOURCES)

    # Start Groq background thread — Groq calls never block the video loop
    _groq_thread = threading.Thread(target=_groq_worker, daemon=True, name="groq-worker")
    _groq_thread.start()

    frame_count         = 0
    last_risk           = {"risk_score": 0.0, "risk_level": "LOW", "source": "init"}
    _last_groq_ts       = 0.0    # wall-clock time of last Groq submission
    # Min gap between Groq calls even during a collision — avoids rate limits.
    # Groq is only called on collision; normal traffic uses instant heuristic.
    MIN_GROQ_GAP_S      = float(os.environ.get("MIN_GROQ_INTERVAL_S", "15.0"))
    _prev_any_collision = False

    while True:
        frame_count   += 1
        features_list  = []

        # ── Step 1: Read + detect per camera (sequential) ──────────────────────
        for state in camera_states:
            ret, frame = state.cap.read()

            if not ret:
                # Video file — loop back to start (dev/demo mode)
                is_video_file = state.url.endswith((".mp4", ".avi", ".mkv", ".mov"))
                if is_video_file:
                    state.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = state.cap.read()
                    if not ret:
                        logger.warning("[CAM-%d] Video loop failed — using last frame", state.cam_id)
                        features_list.append(_offline_features(state))
                        continue
                else:
                    # RTSP drop — attempt reconnect
                    logger.warning("[CAM-%d] Stream read failed — reconnecting", state.cam_id)
                    _push_event("camera_status", {"cam_id": state.cam_id, "status": "reconnecting"})
                    if not reconnect_camera(state):
                        features_list.append(_offline_features(state))
                        continue
                    ret, frame = state.cap.read()
                    if not ret:
                        features_list.append(_offline_features(state))
                        continue

            state.last_good_frame = frame
            feat = extract_features(state, frame)

            # ── Update lingering collision display TTL ──────────────────────────
            if feat.collision_detected:
                # Each detected frame resets the latch to 30 frames
                state.display_collision_ttl = 30
                state.display_box_a = feat.collision_box_a
                state.display_box_b = feat.collision_box_b
            elif state.display_collision_ttl > 0:
                state.display_collision_ttl -= 1

            features_list.append(feat)

            # ── Step 2: Collision confirmation per camera ───────────────────────
            snap_file = save_incident(state, feat, last_risk)
            if snap_file:
                # Keep overlay visible for the full cooldown so the user sees it
                state.display_collision_ttl = COOLDOWN_FRAMES
                _push_event("incident_confirmed", {
                    "cam_id":     feat.cam_id,
                    "snapshot":   snap_file,
                    "vehicle_a":  feat.collision_idA,
                    "vehicle_b":  feat.collision_idB,
                    "iou":        round(feat.collision_iou, 2),
                    "confidence": feat.collision_conf,
                    "timestamp":  datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "risk_score": last_risk.get("risk_score", 0.0),
                    "risk_level": last_risk.get("risk_level", "UNKNOWN"),
                })

        if not features_list:
            continue

        # ── Step 3: Risk assessment ────────────────────────────────────────────
        # • Collision active  → submit to Groq background thread (non-blocking).
        #   First collision frame always triggers; subsequent ones respect MIN_GROQ_GAP_S
        #   so we don't spam the API while the crash is still in frame.
        # • Normal traffic    → instant heuristic, zero API calls.
        #
        # any_collision includes cameras with active TTL so that risk stays HIGH/CRITICAL
        # even when per-frame collision_detected drops to False (cars already stopped).
        any_collision = (
            any(f.collision_detected for f in features_list)
            or any(s.display_collision_ttl > 0 for s in camera_states)
        )
        _force_groq     = any_collision and not _prev_any_collision   # first collision frame
        _prev_any_collision = any_collision

        scene = fuse_scenes(features_list, camera_states)

        # Pull latest Groq result first so we can inspect it before deciding to submit
        with _groq_result_lock:
            _latest = dict(_groq_result)

        # Only submit to Groq when:
        #   _force_groq  → brand-new collision transition (always trigger once)
        #   OR the gap elapsed AND we don't already have a fresh Groq result for
        #      this collision window (avoids spamming during the 400-frame TTL).
        _have_groq_result = _latest.get("source") == "groq"
        _groq_gap_ok      = time.monotonic() - _last_groq_ts >= MIN_GROQ_GAP_S
        if any_collision and (_force_groq or (not _have_groq_result and _groq_gap_ok)):
            _last_groq_ts = time.monotonic()
            try:
                _groq_queue.put_nowait(
                    (scene, [f.frame for f in features_list], dict(last_risk), frame_count)
                )
            except queue.Full:
                pass   # worker still busy with last request — skip, use cached result

        if _latest.get("source") == "groq" and any_collision:
            last_risk = _latest
        else:
            # Collision cleared — wipe the Groq cache so old HIGH/CRITICAL labels
            # don't persist into normal traffic display
            if not any_collision and _latest.get("source") == "groq":
                with _groq_result_lock:
                    _groq_result.clear()
                    _groq_result.update({"risk_score": 0.0, "risk_level": "LOW", "source": "init"})
            # Pass collision=any_collision so proximity crashes (IoU≈0) still score CRITICAL
            # while Groq is warming up or between calls.
            last_risk = algorithmic_risk_score(scene, reason="normal_traffic", collision=any_collision)

        # ── Step 4: Live display window ────────────────────────────────────────
        if SHOW_DISPLAY:
            for feat, state in zip(features_list, camera_states):
                disp = _draw_display(feat, last_risk, state)
                if disp is not None:
                    cv2.imshow(f"TRAFIQ — CAM-{feat.cam_id}", disp)
            if cv2.waitKey(1) & 0xFF == 27:   # ESC to quit
                logger.info("ESC pressed — stopping engine")
                break

    # Cleanup
    logger.info("Shutting down...")
    for state in camera_states:
        state.cap.release()
    cv2.destroyAllWindows()
    # Stop Groq worker thread gracefully
    try:
        _groq_queue.put_nowait(None)   # sentinel
    except queue.Full:
        pass
    _groq_thread.join(timeout=5)
    if sio.connected:
        sio.disconnect()
    logger.info("Engine stopped.")


def _offline_features(state: CameraState) -> FrameFeatures:
    """Return a zeroed FrameFeatures for a camera that failed to produce a frame."""
    return FrameFeatures(
        cam_id=state.cam_id,
        vehicle_count=0,
        near_miss_count=0,
        max_iou=0.0,
        collision_detected=False,
        collision_idA=None,
        collision_idB=None,
        collision_iou=0.0,
        collision_conf=0.0,
        frame=state.last_good_frame,   # stale frame as placeholder
        collision_box_a=None,
        collision_box_b=None,
        plotted_frame=None,
    )


if __name__ == "__main__":
    main()
