# TRAFIQ AI Engine — Technical Report
## From Raw Video to Accident Prediction

> **Project:** Esprit PIDEV 4TWIN3 — 2025/2026  
> **Module:** `backend/ai-engine/detect_video.py`  
> **Model:** YOLOv8 + Groq `llama-3.2-11b-vision-preview`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Stage 1 — Video Ingestion](#3-stage-1--video-ingestion)
4. [Stage 2 — Vehicle Detection & Tracking (YOLO)](#4-stage-2--vehicle-detection--tracking-yolo)
5. [Stage 3 — Collision Detection Logic](#5-stage-3--collision-detection-logic)
6. [Stage 4 — Incident Confirmation & Persistence](#6-stage-4--incident-confirmation--persistence)
7. [Stage 5 — Risk Assessment (Groq Vision)](#7-stage-5--risk-assessment-groq-vision)
8. [Stage 6 — Event Dispatch (Socket.io + MongoDB)](#8-stage-6--event-dispatch-socketio--mongodb)
9. [Multi-Camera Mode](#9-multi-camera-mode)
10. [Threading Model](#10-threading-model)
11. [Configuration Reference](#11-configuration-reference)
12. [Data Flow Summary](#12-data-flow-summary)

---

## 1. System Overview

TRAFIQ is a real-time traffic monitoring engine that watches video streams from up to 3 cameras simultaneously, detects vehicle collisions using computer vision, and classifies incident severity using a multimodal LLM (Groq).

```
Video Streams ──► YOLO Detection ──► Collision Logic ──► Groq Vision ──► Events
  (RTSP / MP4)      (per frame)        (per pair)         (on crash)     (WS + DB)
```

The engine runs as a single Python process with two threads:
- **Main thread** — video loop, YOLO, collision detection, display
- **Groq thread** — LLM API calls (never blocks the video loop)

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TRAFIQ AI ENGINE                                    │
│                                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                                   │
│  │  CAM-0   │  │  CAM-1   │  │  CAM-2   │   ← RTSP streams or .mp4 files   │
│  │ (RTSP/   │  │ (RTSP/   │  │ (RTSP/   │                                   │
│  │  .mp4)   │  │  .mp4)   │  │  .mp4)   │                                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                                   │
│       │              │              │                                         │
│       └──────────────┼──────────────┘                                        │
│                       │   cv2.read() every frame                              │
│                       ▼                                                       │
│          ┌────────────────────────┐                                           │
│          │   YOLO v8 Tracker      │  ← vehicule-model.pt (custom trained)    │
│          │   .track(persist=True) │    Detects: car, truck, bus, motorcycle  │
│          │   conf=0.4, iou=0.45   │    Assigns stable track IDs per vehicle  │
│          └────────────┬───────────┘                                           │
│                       │ boxes + IDs + confidences                             │
│                       ▼                                                       │
│          ┌────────────────────────┐                                           │
│          │  Feature Extraction    │                                           │
│          │  extract_features()    │                                           │
│          │  ─────────────────     │                                           │
│          │  • Deduplication       │  ← remove ghost duplicate detections      │
│          │  • Speed computation   │  ← Euclidean displacement per frame       │
│          │  • Speed peak decay    │  ← 0.92×/frame exponential decay          │
│          │  • IoU computation     │  ← standard overlap metric                │
│          │  • Gap ratio           │  ← proximity metric for side-impacts      │
│          │  • Noise filtering     │  ← area, size ratio, speed thresholds     │
│          │  • Collision detection │  ← proximity + speed drop + confidence    │
│          └────────────┬───────────┘                                           │
│                       │ FrameFeatures (per camera)                            │
│                       ▼                                                       │
│          ┌────────────────────────┐                                           │
│          │  Collision Confirmation│                                           │
│          │  save_incident()       │                                           │
│          │  ─────────────────     │                                           │
│          │  streak >= 3 frames    │  ← must be consistent, not a flicker      │
│          │  cooldown == 0         │  ← 400-frame cooldown between incidents   │
│          │  → snapshot JPEG       │  ← annotated frame saved to /snapshots    │
│          │  → incidents.jsonl     │  ← append JSON record                     │
│          └────────────┬───────────┘                                           │
│                       │                                                       │
│          ┌────────────┴────────────┐                                          │
│          │                         │                                          │
│          ▼                         ▼                                          │
│  ┌──────────────────┐   ┌─────────────────────────────┐                      │
│  │ Heuristic Score  │   │  Groq Vision Thread          │                     │
│  │ algorithmic_     │   │  _groq_worker()              │                     │
│  │ risk_score()     │   │  ──────────────────────────  │                     │
│  │  • Used always   │   │  • Fires ONCE per collision  │                     │
│  │    for display   │   │  • Non-blocking queue        │                     │
│  │  • CRITICAL if   │   │  • Composite image (grid)    │                     │
│  │    collision=True│   │  • llama-3.2-11b-vision      │                     │
│  └──────────────────┘   │  • Returns JSON risk dict    │                     │
│          │               └─────────────┬───────────────┘                     │
│          │                             │  (async, ~2-4s latency)             │
│          └──────────┬──────────────────┘                                      │
│                     │ last_risk dict                                           │
│                     ▼                                                         │
│          ┌────────────────────────┐                                           │
│          │  Event Dispatch        │                                           │
│          │  _push_event()         │                                           │
│          │  ─────────────────     │                                           │
│          │  • risk_event          │ ──► NestJS Socket.io                      │
│          │  • incident_confirmed  │ ──► NestJS Socket.io                      │
│          │  • camera_offline      │ ──► NestJS Socket.io                      │
│          └────────────────────────┘                                           │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

                    NestJS Backend
          ┌─────────────────────────────┐
          │  Socket.io Gateway          │
          │  → MongoDB (accidents)      │
          │  → React Dashboard (WS)     │
          └─────────────────────────────┘
```

---

## 3. Stage 1 — Video Ingestion

### Source Selection

The engine supports two source types, resolved at startup:

```
Priority 1: RTSP_CAM_0 / RTSP_CAM_1 / RTSP_CAM_2  (live cameras)
Priority 2: accident0.mp4  (fallback for dev/testing)
```

```python
# From .env:
RTSP_CAM_0=rtsp://user:pass@192.168.1.10/stream1
RTSP_CAM_1=rtsp://user:pass@192.168.1.11/stream1
```

### Per-Camera State (`CameraState`)

Each camera owns a `CameraState` object that persists for the entire session:

```
CameraState
├── cam_id               — integer index (0, 1, 2)
├── url                  — RTSP URL or file path
├── cap                  — cv2.VideoCapture handle
├── vehicle_memory       — {vehicle_id: (cx, cy)} from last frame
├── speed_peak           — {vehicle_id: decayed_peak_speed}
├── collision_streak     — consecutive frames with collision flag
├── cooldown             — frames before next incident can be logged
├── display_collision_ttl— frames left to show red overlay
├── display_box_a/b      — last confirmed collision box coordinates
└── online               — connection status
```

### Reconnection Logic

If a camera drops mid-stream:

```
Frame read fails
      │
      ▼
reconnect_camera()
      │
      ├─ attempt 1 → wait  2s
      ├─ attempt 2 → wait  4s
      ├─ attempt 3 → wait  8s
      ├─ attempt N → wait min(2^N, 30)s
      │
      ├─ Success → resume tracking
      └─ MAX_RECONNECT_ATTEMPTS exceeded → mark camera OFFLINE
                                           use last_good_frame as placeholder
```

---

## 4. Stage 2 — Vehicle Detection & Tracking (YOLO)

### Model

- **Architecture:** YOLOv8 (Ultralytics)
- **Weights:** `models/vehicule-model.pt` (custom-trained on vehicle dataset)
- **Classes:** car, truck, bus, motorcycle, van
- **Mode:** `track(persist=True)` — ByteTrack assigns **stable IDs** across frames

### Detection Call

```python
results = vehicle_model.track(
    frame,
    persist=True,   # keep IDs across frames
    conf=0.4,       # minimum detection confidence
    iou=0.45,       # NMS threshold (merges near-duplicate boxes)
    verbose=False
)
```

### Why `persist=True` Matters

Without persistence, YOLO assigns new IDs every frame — impossible to compute speed or track if a vehicle was "moving before the crash." With `persist=True`, vehicle id:17 stays id:17 across hundreds of frames.

```
Frame 1:  [id:17 at (300, 200)]
Frame 2:  [id:17 at (305, 208)]   → speed = √(5²+8²) = 9.4 px/frame
Frame 3:  [id:17 at (307, 212)]   → speed = 2.8 px/frame  ← slowing
Frame 4:  [id:17 at (308, 213)]   → speed = 1.4 px/frame  ← nearly stopped
```

### Post-Track Deduplication

YOLO NMS is class-aware: a "car" and a "truck" detection on the **same physical vehicle** both survive NMS because they have different class labels, creating two IDs for one object.

```
Before dedup:  [id:17 car 0.93] [id:18 truck 0.61]  ← same vehicle!
After dedup:   [id:17 car 0.93]                      ← lower conf removed
```

The dedup pass sorts detections by confidence (highest first) and removes any box that overlaps > 60% IoU with an already-kept box.

### Speed Computation

```
For each vehicle with a previous position:
  dx = cx_current - cx_previous
  dy = cy_current - cy_previous
  speed = √(dx² + dy²)   [pixels per frame]
```

### Speed Peak with Exponential Decay

This is the key mechanism for distinguishing a crash stop from a red-light stop:

```
speed_peak[vid] = max(current_speed, previous_peak × 0.92)
```

```
Normal red-light braking (2 seconds = 60 frames):
  Frame 1:   speed=18 → peak=18
  Frame 20:  speed=8  → peak=18×0.92²⁰ = 18×0.19 = 3.4
  Frame 60:  speed=0  → peak ≈ 0.03   ← peak fully decayed

Collision (impact in 1-2 frames, then stopped):
  Frame 1:   speed=22 → peak=22
  Frame 2:   speed=1  → peak=max(1, 22×0.92) = 20.2  ← still high!
  Frame 3:   speed=0  → peak=max(0, 20.2×0.92) = 18.6 ← still > threshold
```

A vehicle that decelerates gradually cannot maintain a peak above `SPEED_HIGH_THRESHOLD=10`. A vehicle that collides (abrupt stop) retains a high peak for many frames after impact.

---

## 5. Stage 3 — Collision Detection Logic

This is the most complex stage. Every frame runs a **pairwise check** across all tracked vehicles.

### Detection Pipeline per Pair

```
For every pair (vehicleA, vehicleB):

    STEP 1 — Compute IoU and near-miss
    ├─ iou = compute_iou(boxA, boxB)
    ├─ if iou > IOU_THRESHOLD × 0.6  → near_miss++
    └─ track max_iou

    STEP 2 — Noise filters (skip if any fail)
    ├─ area_A < MIN_BOX_AREA (3500 px²)?  → SKIP (tiny ghost)
    ├─ area_B < MIN_BOX_AREA (3500 px²)?  → SKIP (tiny ghost)
    ├─ min(area)/max(area) < 0.20?        → SKIP (mismatched sizes)
    └─ both speed_peak < 10 px/frame?     → SKIP (never moved fast = red light stop)

    STEP 3 — Proximity check
    ├─ gap_ratio = compute_box_gap_ratio(boxA, boxB)
    ├─ gap_ratio < PROXIMITY_THRESHOLD (0.15)?  → boxes are touching/adjacent
    ├─ iou < IOU_MAX_THRESHOLD (0.85)?          → not a duplicate detection
    ├─ speed[A] < SPEED_DROP_THRESHOLD (15)?    → A has stopped
    ├─ speed[B] < SPEED_DROP_THRESHOLD (15)?    → B has stopped
    └─ conf[A] >= MIN_PAIR_CONF (0.45)?         → trusted detection
       conf[B] >= MIN_PAIR_CONF (0.45)?

    ALL pass → collision_detected = True
```

### Why IoU Is Not Enough

Standard collision detection uses Intersection over Union (IoU):

```
IoU = overlap_area / union_area

Head-on crash:          T-bone / side-impact crash:
┌────────┐              ┌────────┐
│   A    ├──►           │   A    │   ┌────────┐
│    ┌───┤◄──           └────────┘   │   B    │
│    │ B │                           └────────┘
└────┘───┘
IoU ≈ 0.4 ✓             IoU = 0.00  ✗ ← missed by pure IoU check!
```

In practice, T-bone crashes (vehicles collide at right angles) leave cars sitting **side by side** with 0% bounding box overlap. The IoU approach would never detect these.

### The Gap Ratio Solution

```python
def compute_box_gap_ratio(boxA, boxB):
    gap_x = max(0, max(boxA.x1, boxB.x1) - min(boxA.x2, boxB.x2))
    gap_y = max(0, max(boxA.y1, boxB.y1) - min(boxA.y2, boxB.y2))
    avg_diagonal = √(avg_width² + avg_height²)
    return √(gap_x² + gap_y²) / avg_diagonal
```

```
Result interpretation:
  0.00 = boxes touching or overlapping (any crash type)
  0.05 = boxes 5% of vehicle size apart (very close, likely post-impact)
  0.15 = boxes 15% of vehicle size apart (THRESHOLD — still a collision zone)
  0.50 = boxes half a vehicle width apart (normal traffic)
  1.00 = boxes a full vehicle diagonal apart (clearly separate)
```

### Noise Filter Diagram

```
Pair detected by YOLO
         │
         ▼
┌─────────────────────────┐
│  Area filter            │
│  box < 3500 px²?        │──YES──► SKIP (ghost / reflection / distant noise)
└─────────┬───────────────┘
          │ NO
          ▼
┌─────────────────────────┐
│  Size ratio filter      │
│  smaller/larger < 0.20? │──YES──► SKIP (tiny ghost paired with real car)
└─────────┬───────────────┘
          │ NO
          ▼
┌─────────────────────────┐
│  Speed peak filter      │
│  both peaks < 10 px/f?  │──YES──► SKIP (red-light stop, no prior movement)
└─────────┬───────────────┘
          │ NO
          ▼
     Proximity check
```

---

## 6. Stage 4 — Incident Confirmation & Persistence

A single-frame detection is not enough. TRAFIQ requires **consistency across multiple frames** before logging an incident.

### Confirmation Logic

```
Each frame:
  collision_detected = True  → streak++
  collision_detected = False → streak = max(0, streak-1)

  if streak >= CONFIRMATION_FRAMES (3) AND cooldown == 0:
      → CONFIRMED INCIDENT
      → streak = 0, cooldown = 400 frames   (prevents duplicate logs)
```

```
Timeline example:

Frame:  100  101  102  103  104  105
Detect:  ✗    ✓    ✓    ✓    ✓    ✓
Streak:  0    1    2    3→   CONFIRMED at frame 103
                              ↓
                         save_incident()
                         cooldown = 400
```

### What Gets Saved

**Snapshot JPEG** (`snapshots/snapshot_YYYYMMDD_HHMMSS_cam0.jpg`):
- The collision frame annotated with red bounding boxes
- Semi-transparent banner: "COLLISION DETECTED", IoU, confidence, timestamp

**Incident record** (appended to `incidents.jsonl`):
```json
{
  "incident_id":   "20260407_172814_cam0",
  "incident_type": "vehicle_collision",
  "timestamp":     "2026-04-07 17:28:14",
  "snapshot":      "snapshot_20260407_172814_cam0.jpg",
  "vehicle_a":     17,
  "vehicle_b":     25,
  "iou":           0.00,
  "confidence":    0.77,
  "camera_id":     "cam0",
  "risk_score":    0.95,
  "risk_level":    "CRITICAL",
  "risk_reason":   "Collision detected (proximity): vehicles touching/overlapping."
}
```

### Display TTL (Lingering Overlay)

After confirmation, the red collision boxes remain visible for `COOLDOWN_FRAMES` even when the per-frame detector no longer fires (vehicles already stopped):

```
Frame 103:  CONFIRMED → display_collision_ttl = 400
Frame 104:  collision_detected = False → ttl = 399  (still shows red boxes)
Frame 200:  collision_detected = False → ttl = 303  (still shows red boxes)
Frame 503:  ttl = 0 → red boxes removed
```

---

## 7. Stage 5 — Risk Assessment (Groq Vision)

### When Groq Is Called

Groq is **NOT** called on normal traffic. It fires only when a collision is active:

```
any_collision = (
    any camera has collision_detected = True this frame
    OR
    any camera has display_collision_ttl > 0
)

Submit to Groq IF:
    any_collision = True
    AND (
        _force_groq = True        ← brand-new collision (False→True transition)
        OR
        (no Groq result yet AND time_since_last_call >= 15s)
    )

Do NOT re-submit if Groq already returned a result for this collision window.
```

### Non-Blocking Architecture

Groq calls take 2–5 seconds. Running them on the main thread would freeze the video:

```
Main Thread (30 fps):                    Groq Thread (background):
─────────────────────                    ──────────────────────────
frame 103: collision! → put_nowait() ──► receive (scene, frames, ...)
frame 104: check queue (still busy)      │
frame 105: check queue (still busy)      │  assess_risk()
frame 106: check queue (still busy)      │  → build composite image
...                                      │  → POST to Groq API (~3s)
frame 200: read result ◄─────────────── │  → parse JSON response
           update display                └► write to _groq_result
```

The queue has `maxsize=1` — if Groq is still processing, new requests are **silently dropped** (never pile up).

### Composite Image for Groq

All camera frames are tiled into a single image:

```
1 camera:   640×480  (full resolution, best quality)
2 cameras:  640×240  (side by side)
3 cameras:  2×2 grid, 640×480  (320×240 per tile)

[  CAM-0  |  CAM-1  ]
[  CAM-2  |  blank  ]
```

Groq sees all angles simultaneously — if CAM-1 shows the crash from the front and CAM-2 shows it from the side, both views inform the assessment.

### Risk Prompt Design

The system prompt instructs Groq to assess **current severity**, not predict future risk:

```
Scale:
  0.00–0.29 → LOW      Normal traffic, no incident visible
  0.30–0.59 → MEDIUM   Suspicious proximity or minor contact
  0.60–0.79 → HIGH     Clear collision, vehicles stopped/damaged
  0.80–1.00 → CRITICAL Severe crash: fire, debris, casualties visible

Hard rules:
  • collision_confirmed = YES  →  score MUST be ≥ 0.75
  • Fire or debris visible     →  score MUST be ≥ 0.90
```

### Groq Response

```json
{
  "risk_score":         0.92,
  "risk_level":         "CRITICAL",
  "primary_factors":    ["vehicle_fire", "collision_confirmed", "debris_field"],
  "reasoning":          "Right vehicle on fire with large debris field; severe frontal impact confirmed.",
  "recommended_action": "Dispatch emergency services immediately."
}
```

### Fallback: Heuristic Score

When Groq is unavailable (rate limit, timeout, no collision), the algorithmic fallback runs instantly:

```
Normal traffic:
  score = IoU×0.50 + near_misses×0.15 + vehicles×0.02 + streaks×0.20

Collision confirmed (proximity, IoU≈0):
  score = 0.95, level = CRITICAL   ← forced, bypasses IoU formula
```

This ensures the display always shows CRITICAL during a confirmed crash, even before Groq responds.

### Risk Score State Machine

```
State: NO_COLLISION
  any_collision = False
  last_risk = heuristic(normal traffic)
  display: LOW/MEDIUM badge

        ↓  collision detected (False→True)
        
State: COLLISION_ACTIVE
  any_collision = True
  _force_groq = True → submit to Groq queue
  last_risk = heuristic(collision=True) → CRITICAL 0.95 (instant)
  display: CRITICAL badge

        ↓  Groq responds (~3s later)
        
State: GROQ_CONFIRMED
  last_risk = Groq result (0.75–1.0)
  _have_groq_result = True → no more Groq calls
  display: Groq badge (CRITICAL with reasoning text)

        ↓  TTL expires (400 frames)
        
State: NO_COLLISION  ← cycle resets
  Groq cache wiped
  last_risk = heuristic(normal traffic)
```

---

## 8. Stage 6 — Event Dispatch (Socket.io + MongoDB)

### Socket.io Events

The engine emits three event types to the NestJS backend:

| Event | Trigger | Payload |
|-------|---------|---------|
| `risk_event` | Every Groq response | risk_score, risk_level, reasoning, frame_count, scene_summary |
| `incident_confirmed` | Collision streak confirmed | cam_id, snapshot path, vehicle IDs, IoU, confidence, risk_level |
| `camera_offline` | Camera reconnect fails | cam_id, url, timestamp |

### Flow to Frontend

```
detect_video.py
      │
      │  socket.io  (python-socketio client)
      ▼
NestJS RiskGateway   (WebSocket gateway)
      │
      ├─► MongoDB    (accidents collection)
      │
      └─► React Dashboard  (live WebSocket push)
               │
               ├─ Risk level badge
               ├─ Live camera feed
               └─ Incident history table
```

---

## 9. Multi-Camera Mode

### Configuration

```env
RTSP_CAM_0=rtsp://192.168.1.10/stream1   # or path/to/video0.mp4
RTSP_CAM_1=rtsp://192.168.1.11/stream1   # or path/to/video1.mp4
RTSP_CAM_2=rtsp://192.168.1.12/stream1   # or path/to/video2.mp4
```

### Processing Model

Each camera is processed **independently** within the same frame iteration:

```
Frame loop iteration N:
  ├─ CAM-0: read → YOLO → extract_features → FrameFeatures_0
  ├─ CAM-1: read → YOLO → extract_features → FrameFeatures_1
  └─ CAM-2: read → YOLO → extract_features → FrameFeatures_2

  fuse_scenes([FF_0, FF_1, FF_2], [state_0, state_1, state_2])
  → scene = {
      total_vehicles:    sum across all 3
      total_near_misses: sum across all 3
      max_iou:           worst case across all 3
      collision_confirmed: True if ANY camera has TTL > 0
      per_camera: [
        { cam_id:0, collision_confirmed:False, ... },
        { cam_id:1, collision_confirmed:True,  ... },  ← crash on CAM-1
        { cam_id:2, collision_confirmed:False, ... },
      ]
    }
```

### Risk Escalation: Any Camera Can Trigger

```
CAM-0: normal traffic  → collision_detected=False
CAM-1: crash detected  → collision_detected=True   ← triggers Groq for ALL cameras
CAM-2: normal traffic  → collision_detected=False

Result: single CRITICAL score displayed on all 3 windows
        Groq composite image contains all 3 camera views
```

### Independent TTL Counters

Each camera has its own `display_collision_ttl`. CAM-1 can show the confirmed crash overlay while CAM-0 and CAM-2 show normal detection:

```
CAM-0: [ONLINE] Vehicles: 3  Near-miss: 0  Max IoU: 0.12  | LOW 0.08
CAM-1: [ONLINE] Vehicles: 2  Near-miss: 0  Max IoU: 0.00  | CRITICAL 0.95
           !! COLLISION (confirmed) [298f remaining]
CAM-2: [ONLINE] Vehicles: 4  Near-miss: 1  Max IoU: 0.23  | CRITICAL 0.95
```

---

## 10. Threading Model

```
┌─────────────────────────────────────────────────────────┐
│  Main Thread                                             │
│                                                          │
│  while True:                                             │
│    for each camera:                                      │
│      cap.read()          ← ~1ms per camera               │
│      yolo.track()        ← ~15-30ms (GPU)               │
│      extract_features()  ← ~1ms                          │
│      save_incident()     ← ~5ms (disk write)             │
│    fuse_scenes()         ← <1ms                          │
│    compute any_collision ← <1ms                          │
│    queue.put_nowait()    ← <1ms (non-blocking!)          │
│    _groq_result.copy()   ← <1ms (lock, fast)             │
│    _draw_display()       ← ~5ms                          │
│    cv2.imshow()          ← ~1ms                          │
│                                                          │
│  Total per iteration: ~25-50ms → 20-40 fps               │
└─────────────────────────────────────────────────────────┘

                    queue.Queue(maxsize=1)
                    ┌─── put_nowait() ──────────────────┐
                    │                                   ▼
┌─────────────────────────────────────────────────────────┐
│  Groq Thread (daemon)                                    │
│                                                          │
│  while True:                                             │
│    item = queue.get()    ← blocks until work available   │
│    assess_risk()         ← 2-5 seconds (API call)        │
│    _groq_result.update() ← lock, write result            │
│    _push_event()         ← socket.io emit                │
│    queue.task_done()                                     │
└─────────────────────────────────────────────────────────┘
```

**Key properties:**
- `maxsize=1` — at most one pending request; extras are dropped silently
- `max_retries=0` on Groq client — 429 errors raise immediately (no sleep)
- `daemon=True` — thread dies automatically when main thread exits
- Shutdown: main sends `None` sentinel → worker returns cleanly

---

## 11. Configuration Reference

All parameters are read from `.env` at startup:

| Variable | Default | Effect |
|----------|---------|--------|
| `GROQ_API_KEY` | — | Required for risk assessment |
| `RTSP_CAM_0/1/2` | — | Camera sources; falls back to accident0.mp4 |
| `BASE_CONF` | 0.4 | YOLO minimum detection confidence |
| `IOU_THRESHOLD` | 0.4 | Near-miss IoU threshold |
| `IOU_MAX_THRESHOLD` | 0.85 | Above this = duplicate detection (not a crash) |
| `PROXIMITY_THRESHOLD` | 0.15 | Gap ratio below this = collision |
| `MIN_PAIR_CONF` | 0.45 | Minimum confidence for each vehicle in a collision pair |
| `SPEED_DROP_THRESHOLD` | 15 | Speed (px/frame) below which a vehicle is "stopped" |
| `MIN_BOX_AREA` | 3500 | Minimum bounding box area to consider (noise filter) |
| `MIN_BOX_SIZE_RATIO` | 0.20 | Minimum size ratio between paired vehicles |
| `SPEED_HIGH_THRESHOLD` | 10.0 | Minimum peak speed to have been "actually moving" |
| `CONFIRMATION_FRAMES` | 3 | Consecutive collision frames to confirm an incident |
| `COOLDOWN_FRAMES` | 400 | Frames between incidents on same camera (~13s at 30fps) |
| `MIN_GROQ_INTERVAL_S` | 15.0 | Minimum seconds between Groq calls per collision |
| `ENABLE_RISK_ASSESSMENT` | true | Set to false for YOLO-only mode |
| `SHOW_DISPLAY` | false | Open OpenCV preview windows (dev only) |
| `MAX_RECONNECT_ATTEMPTS` | 10 | RTSP reconnect retries before marking camera offline |

---

## 12. Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE DATA FLOW                                    │
│                                                                          │
│  VIDEO SOURCE                                                            │
│  ┌─────────────┐                                                         │
│  │ RTSP / .mp4 │ → cv2.VideoCapture.read() → raw BGR frame (1080p)      │
│  └─────────────┘                                                         │
│         │                                                                │
│         ▼  [per frame, per camera]                                       │
│  ┌─────────────────────────────────────────────────┐                    │
│  │ YOLO v8 Track                                   │                    │
│  │   Input:  BGR frame                             │                    │
│  │   Output: [(id, [x1,y1,x2,y2], conf), ...]      │                    │
│  └─────────────────────────────────────────────────┘                    │
│         │                                                                │
│         ▼                                                                │
│  ┌─────────────────────────────────────────────────┐                    │
│  │ Feature Extraction                              │                    │
│  │   • Dedup  → clean box list                     │                    │
│  │   • Speed  → {vid: px/frame}                    │                    │
│  │   • Peak   → {vid: decayed_peak}                │                    │
│  │   • IoU    → float per pair                     │                    │
│  │   • Gap    → proximity ratio per pair           │                    │
│  │   • Filter → area, ratio, speed_peak            │                    │
│  │   Output:  FrameFeatures                        │                    │
│  └─────────────────────────────────────────────────┘                    │
│         │                                                                │
│         ▼  [collision_detected = True]                                   │
│  ┌──────────────────┐    streak < 3         ┌──────────────┐            │
│  │ streak++         │ ─────────────────────►│ wait for     │            │
│  │                  │                        │ more frames  │            │
│  │ streak >= 3 AND  │                        └──────────────┘            │
│  │ cooldown == 0    │                                                    │
│  └────────┬─────────┘                                                    │
│           │  CONFIRMED                                                   │
│           ▼                                                              │
│  ┌──────────────────────────────────────┐                               │
│  │ save_incident()                      │                               │
│  │   → snapshot JPEG (annotated frame)  │                               │
│  │   → incidents.jsonl (JSON record)    │                               │
│  │   → display_collision_ttl = 400      │                               │
│  │   → cooldown = 400                   │                               │
│  └──────────────────────────────────────┘                               │
│           │                                                              │
│           ▼  [any_collision = True]                                      │
│  ┌──────────────────────────────────────┐                               │
│  │ Immediate heuristic: CRITICAL 0.95   │ ← shown while Groq is loading │
│  └──────────────────────────────────────┘                               │
│           │                                                              │
│           ▼  [_force_groq on transition]                                 │
│  ┌──────────────────────────────────────┐                               │
│  │ Groq Thread (async, ~3s)             │                               │
│  │   • Composite image (all cameras)    │                               │
│  │   • Telemetry + collision_confirmed  │                               │
│  │   • llama-3.2-11b-vision-preview     │                               │
│  │   → JSON: score, level, reasoning    │                               │
│  └──────────────────────────────────────┘                               │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────────────────────────┐                               │
│  │ _push_event()                        │                               │
│  │   → risk_event      (Socket.io)      │ ──► NestJS ──► React Dashboard│
│  │   → incident_confirmed (Socket.io)   │ ──► NestJS ──► MongoDB        │
│  └──────────────────────────────────────┘                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*Report generated for TRAFIQ AI Engine v2 — backend/ai-engine/detect_video.py*
