# TRAFIQ – AI-Powered Traffic Accident Detection System

## Overview

Developed as part of **PIDEV – 4th Year Engineering Program** at **Esprit School of Engineering** (2025–2026).

TRAFIQ is a real-time, multi-camera traffic monitoring system that detects vehicle collisions using computer vision (YOLOv8) and assesses risk severity via a vision-language model (Groq / Llama 4 Scout). It processes local dashcam footage and live HLS streams simultaneously, generates annotated snapshots and structured incident reports, pushes events over WebSocket in real time, and displays everything on an interactive admin dashboard with Leaflet maps and per-camera live feeds.

---

## Features

- **Multi-camera YOLO detection** – 5 concurrent sources (local MP4 + live HLS streams)
- **Collision detection** – proximity-based + IoU overlap with multi-frame confirmation
- **Groq Vision risk assessment** – LLM analyses composite camera image + telemetry, returns structured risk score
- **Real-time WebSocket pipeline** – Python engine → NestJS gateway → React dashboard (Socket.io)
- **Annotated snapshot capture** – collision bounding boxes + metadata banner saved as JPEG
- **JSONL incident persistence** – append-only incident log with false-positive flagging and removal
- **Interactive admin dashboard** – Leaflet map with dynamic risk-colored zone markers, media popups, auto-focus navigation
- **Live monitoring** – embedded dashcam video and Windy webcam livestream iframes grouped by country
- **False positive management** – multi-select UI to flag or permanently delete false positives
- **Public citizen app** – proximity alerts, route planner, live route status
- **Algorithmic risk fallback** – instant heuristic scoring when Groq is unavailable or between API calls

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 (Vite), React Router 7, React-Leaflet 5, Recharts 3 |
| **Backend API** | NestJS 11 (TypeScript), Socket.io 4 |
| **AI Engine** | Python 3.11, Ultralytics YOLOv8, OpenCV, Groq SDK, python-socketio |
| **LLM** | Groq Cloud – `meta-llama/llama-4-scout-17b-16e-instruct` |
| **Storage** | File-based JSONL (`incidents.jsonl`) + static snapshot images |
| **Live Streams** | Flussonic HLS (dvr5.astrakhan.ru), Windy public embed player |

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │            React Frontend (Vite)            │
                    │  Admin Dashboard  │  Public Citizen App     │
                    │  - Map (Leaflet)  │  - Proximity Alerts     │
                    │  - Incidents      │  - Route Planner        │
                    │  - Live Feeds     │  - Route Status         │
                    │  - AI Agent       │                         │
                    │  - Congestion     │                         │
                    │  - Analytics      │                         │
                    └────────┬──────────┬─────────────────────────┘
                             │ HTTP     │ WebSocket
                    ┌────────▼──────────▼─────────────────────────┐
                    │           NestJS Server (port 3000)         │
                    │  REST: /accidents  /accidents/flag  /remove │
                    │  WS Gateway: risk_update, new_incident,     │
                    │              camera_update                   │
                    │  Static: /accidents/snapshot/:filename       │
                    └────────┬────────────────────────────────────┘
                             │ Socket.io + File I/O
                    ┌────────▼────────────────────────────────────┐
                    │       Python AI Engine (detect_video.py)     │
                    │  YOLO predict() × 5 cameras (sequential)    │
                    │  → Proximity/IoU collision check             │
                    │  → Multi-frame confirmation (3 frames)       │
                    │  → Groq Vision risk assessment (background)  │
                    │  → Snapshot + incidents.jsonl + WS emit      │
                    └────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────────────┐
              ▼              ▼                       ▼
         accident.mp4   accident0.mp4    HLS live streams × 3
         (France)       (Spain)          (Astrakhan, Russia)
```

### Project Structure

```
TRAFIQ/
├── backend/
│   ├── ai-engine/
│   │   ├── detect_video.py           # Multi-camera detection + risk engine
│   │   ├── prompts.py                # Groq LLM prompt templates
│   │   ├── run_demo_videos.ps1       # Demo launcher (5 cameras)
│   │   ├── requirements.txt          # Python dependencies
│   │   ├── incidents.jsonl           # Append-only incident log (generated)
│   │   ├── .env                      # GROQ_API_KEY + camera URLs
│   │   ├── models/
│   │   │   └── vehicule-model.pt     # Custom YOLO vehicle detection weights
│   │   ├── snapshots/                # Annotated collision JPEGs (generated)
│   │   └── dataset/yolo/             # Training dataset (train/valid/test)
│   └── server/                       # NestJS REST + WebSocket API
│       └── src/
│           ├── accidents/            # CRUD + flag/remove + snapshot serving
│           ├── risk/                 # Socket.io gateway (Python → React)
│           ├── app.module.ts
│           └── main.ts
└── frontend/                         # React 19 + Vite
    └── src/
        ├── App.jsx                   # Router: /admin/* (protected) + / (public)
        ├── apps/
        │   ├── admin/
        │   │   ├── components/
        │   │   │   ├── AdminMap.jsx          # Leaflet map + 5 zone markers + media popups
        │   │   │   ├── IncidentCard.jsx      # Selectable card with snapshot/localise
        │   │   │   ├── StatCard.jsx
        │   │   │   └── layout/
        │   │   │       └── AdminSidebar.jsx  # Live incident badge from /accidents
        │   │   └── pages/
        │   │       ├── Dashboard.jsx         # Stats + map + events (real-time /accidents)
        │   │       ├── Incidents.jsx         # Multi-select + flag FP + delete
        │   │       ├── LiveMonitoring.jsx    # Video/iframe feeds by country
        │   │       ├── Congestion.jsx        # Per-camera risk analysis
        │   │       ├── AIAgent.jsx           # Engine metrics from /accidents
        │   │       ├── Analytics.jsx         # Charts
        │   │       ├── Settings.jsx
        │   │       └── Login.jsx
        │   └── public/
        │       ├── components/
        │       │   ├── PublicMap.jsx          # Citizen accident markers
        │       │   └── ProximityAlert.jsx
        │       └── pages/
        │           ├── Home.jsx
        │           ├── RoutePlanner.jsx
        │           └── RouteStatus.jsx
        └── shared/
            ├── context/
            │   ├── AuthContext.jsx
            │   └── TrafikContext.jsx
            ├── hooks/
            │   ├── useTrafikData.js
            │   ├── useGeolocation.js
            │   ├── useProximity.js
            │   └── useNotifications.js
            └── services/
                └── trafiqApi.js
```

---

## AI Detection Pipeline

### Models

| Model | File | Purpose |
|-------|------|---------|
| Vehicle Detection | `vehicule-model.pt` | Detects cars, trucks, buses, motorcycles |
| Crash Classification | `crash-model.pt` | Supplementary crash/no-crash classifier |

### Collision Detection Logic

An incident is confirmed when **all** conditions are met across **3 consecutive frames**:

1. **Vehicle pair proximity** – bounding-box gap ratio < 18% of average vehicle diagonal
2. **Speed history** – at least one vehicle had peak speed > 8 px/frame recently (was actually moving)
3. **Both vehicles slow** – current speed < 12 px/frame (post-crash stop)
4. **Confidence filter** – both detections ≥ 50% YOLO confidence
5. **Size filter** – box area ≥ 3000 px², size ratio ≥ 0.25 (rejects noise/ghosts)
6. **IoU guard** – IoU < 0.85 (rejects duplicate detections of same vehicle)

### Detection Thresholds

| Parameter | Default | Description |
|-----------|---------|-------------|
| `BASE_CONF` | 0.35 | Minimum YOLO detection confidence |
| `PROXIMITY_THRESHOLD` | 0.18 | Max gap ratio for collision (fraction of vehicle diagonal) |
| `MIN_PAIR_CONF` | 0.50 | Both vehicles must exceed this confidence |
| `MIN_BOX_AREA` | 3000 | Minimum bounding box area in px² |
| `SPEED_HIGH_THRESHOLD` | 8.0 | Peak speed required to have "been moving" |
| `SPEED_DROP_THRESHOLD` | 12.0 | Both must be below this (post-crash) |
| `CONFIRMATION_FRAMES` | 3 | Consecutive collision frames required |
| `COOLDOWN_FRAMES` | 500 | Frames before same camera can fire again |

All thresholds are configurable via environment variables.

### Groq Vision Risk Assessment

When a collision is confirmed, the engine:
1. Composites camera frames into a grid JPEG
2. Sends to `meta-llama/llama-4-scout-17b-16e-instruct` via Groq API
3. Receives structured JSON: `{ risk_score, risk_level, primary_factors, reasoning, recommended_action }`
4. Falls back to algorithmic heuristic if Groq is unavailable

---

## Camera Sources

| Camera | Source | Location |
|--------|--------|----------|
| cam0 | `accident.mp4` (local) | France 🇫🇷 |
| cam1 | `accident0.mp4` (local) | Spain 🇪🇸 |
| cam2 | HLS `dvr5.astrakhan.ru/cam26hd` | Astrakhan, Russia 🇷🇺 |
| cam3 | HLS `dvr5.astrakhan.ru/boev-36-hd-1` | Astrakhan, Russia 🇷🇺 |
| cam4 | HLS `dvr5.astrakhan.ru/bogh-17-hd-1` | Astrakhan, Russia 🇷🇺 |

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/accidents` | List all incidents (last 100, newest first) |
| `PATCH` | `/accidents/flag` | Flag incidents as false positives `{ ids: string[] }` |
| `DELETE` | `/accidents/remove` | Permanently remove incidents `{ ids: string[] }` |
| `GET` | `/accidents/snapshot/:filename` | Serve snapshot JPEG image |

### WebSocket Events (Socket.io)

| Direction | Event | Payload |
|-----------|-------|---------|
| Engine → NestJS | `risk_event` | `{ risk_score, risk_level, reasoning, scene_summary }` |
| Engine → NestJS | `incident_confirmed` | `{ cam_id, snapshot, vehicle_a, vehicle_b, iou, confidence, risk_score }` |
| Engine → NestJS | `camera_status` | `{ cam_id, status: "online" \| "offline" \| "reconnecting" }` |
| NestJS → Frontend | `risk_update` | Re-broadcast of `risk_event` |
| NestJS → Frontend | `new_incident` | Re-broadcast of `incident_confirmed` |
| NestJS → Frontend | `camera_update` | Re-broadcast of `camera_status` |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- npm 10+
- Groq API key ([console.groq.com](https://console.groq.com))

### 1. AI Engine

```bash
cd backend/ai-engine
pip install -r requirements.txt
```

Create a `.env` file:
```env
GROQ_API_KEY=gsk_your_key_here
RTSP_CAM_0=accident.mp4
RTSP_CAM_1=accident0.mp4
SHOW_DISPLAY=true
```

Run with demo videos (all 5 cameras):
```powershell
cd backend/ai-engine
./run_demo_videos.ps1
```

Or run directly:
```bash
python detect_video.py
```

> Place video files (`accident.mp4`, `accident0.mp4`) inside `backend/ai-engine/`.

To start fresh (clear previous incidents):
```powershell
$env:CLEAR_INCIDENTS_ON_START='true'
./run_demo_videos.ps1
```

### 2. Backend (NestJS)

```bash
cd backend/server
npm install
npm run start:dev
```

Server starts on `http://localhost:3000`.

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### 4. Admin Login

| Field | Value |
|-------|-------|
| Email | `admin@trafiq.ai` |
| Password | `trafiq2025` |

---

## Admin Dashboard Pages

| Page | Description |
|------|-------------|
| **Vue d'ensemble** | Stats overview + interactive map with risk-colored zone markers |
| **Live Monitoring** | Video/iframe feeds grouped by country with per-feed map navigation |
| **Incidents** | Multi-select incident management: flag false positives, delete, view snapshots |
| **Congestion** | Per-camera risk analysis with real-time stats |
| **Agent IA** | AI engine metrics: avg confidence, risk distribution, pipeline status |
| **Analytics** | Charts and historical data visualization |
| **Settings** | System configuration |

---

## Output

**Annotated Snapshot** – saved on collision confirmation:
```
snapshots/snapshot_20260408_063925_cam0.jpg
```

**Incident Record** – appended to `incidents.jsonl`:
```json
{
  "incident_id": "20260408_063925_cam0",
  "incident_type": "vehicle_collision",
  "timestamp": "2026-04-08 06:39:25",
  "snapshot": "snapshot_20260408_063925_cam0.jpg",
  "vehicle_a": 3,
  "vehicle_b": 7,
  "iou": 0.47,
  "confidence": 0.68,
  "camera_id": "cam0",
  "risk_score": 0.82,
  "risk_level": "CRITICAL",
  "risk_reason": "Two vehicles in direct contact with significant overlap.",
  "false_positive": false
}
```

---

## Contributors

| Name | GitHub |
|------|--------|
| Malek Hayouni | [@Malekhayouni](https://github.com/Malekhayouni) |
| Mohamed Khalil | [@mohamedkhalil26](https://github.com/mohamedkhalil26) |
| Amal Romdhani | [@Amal-Romdhani](https://github.com/Amal-Romdhani) |
| Raed Chebbi | [@Raedchebbi](https://github.com/Raedchebbi) |

---

## Academic Context

Developed at **Esprit School of Engineering – Tunisia**
PIDEV – 4TWIN3 | 2025–2026

---

## Acknowledgments

- [Ultralytics YOLOv8](https://github.com/ultralytics/ultralytics)
- [OpenCV](https://opencv.org/)
- [Groq](https://groq.com/) – LLM inference API
- [Leaflet](https://leafletjs.com/) / [React-Leaflet](https://react-leaflet.js.org/)
- [Windy Webcams](https://www.windy.com/webcams) – live stream embeds
- Esprit School of Engineering for academic support