# TRAFIQ – AI-Powered Traffic Accident Detection System

## Overview

This project was developed as part of the PIDEV – 4th Year Engineering Program at **Esprit School of Engineering** (Academic Year 2025–2026).

TRAFIQ is an AI-powered traffic monitoring system that automatically detects vehicle collisions from video footage using computer vision and deep learning. It captures accident snapshots, generates structured JSON reports in real time, and displays them on an admin dashboard.

---

## Features

- Vehicle detection using YOLO
- Collision detection using bounding-box overlap (IoU)
- Accident classification with a trained crash model
- Multi-frame stability check to reduce false positives
- Automatic accident snapshot capture
- JSON accident report generation
- REST API with NestJS serving accident logs and snapshots
- MongoDB storage for accident records
- Admin dashboard displaying live incidents with snapshots and confidence scores

---

## Tech Stack

### Frontend
- React.js (Vite)

### Backend
- NestJS
- Python (AI Engine – YOLOv8 via Ultralytics)

### Database
- MongoDB

### AI / ML
- YOLOv8 (Ultralytics)
- OpenCV
- NumPy

---

## Architecture

```
TRAFIQ/
├── backend/
│   ├── ai-engine/
│   │   ├── detect_video.py           # Main detection script
│   │   ├── incidents_log.json        # Generated accident reports
│   │   ├── snapshots/                # Captured accident frames
│   │   ├── dataset/                  # YOLO training dataset (local only)
│   │   └── models/
│   │       ├── best_vehicle.pt       # Vehicle detection model
│   │       └── best_crash.pt         # Crash classification model
│   └── server/                       # NestJS REST API
│       └── src/
│           ├── accidents/            # Accidents module (controller, service, schema)
│           ├── app.module.ts
│           └── main.ts
└── frontend/                         # React admin dashboard (Vite)
    └── src/
        ├── App.css
        ├── App.jsx
        ├── index.css
        ├── main.jsx
        ├── assets/
        ├── apps/
        │   ├── admin/
        │   │   ├── AdminApp.jsx
        │   │   ├── components/
        │   │   │   ├── AdminMap.jsx
        │   │   │   ├── EventLogRow.jsx
        │   │   │   ├── IncidentCard.jsx
        │   │   │   ├── SnapshotViewer.jsx
        │   │   │   ├── StatCard.jsx
        │   │   │   └── layout/
        │   │   │       ├── AdminSidebar.jsx
        │   │   │       └── AdminTopBar.jsx
        │   │   └── pages/
        │   │       ├── AIAgent.jsx
        │   │       ├── Analytics.jsx
        │   │       ├── Dashboard.jsx
        │   │       ├── Incidents.jsx
        │   │       ├── LiveMonitoring.jsx
        │   │       ├── Login.jsx
        │   │       ├── Settings.jsx
        │   │       └── Snapshots.jsx
        │   └── public/
        │       ├── PublicApp.jsx
        │       ├── components/
        │       │   ├── ProximityAlert.jsx
        │       │   ├── PublicMap.jsx
        │       │   └── RouteCard.jsx
        │       └── pages/
        │           ├── Home.jsx
        │           ├── RoutePlanner.jsx
        │           └── RouteStatus.jsx
        └── shared/
            ├── context/
            │   ├── AuthContext.jsx
            │   └── TrafikContext.jsx
            ├── hooks/
            │   ├── useGeolocation.js
            │   ├── useNotifications.js
            │   ├── useProximity.js
            │   ├── useRoutes.js
            │   └── useTrafikData.js
            └── services/
                └── trafiqApi.js
```

---

## 🧠 AI Models

**Vehicle Detection Model** — `best_vehicle.pt`  
Detects: Cars, Trucks, Buses, Motorcycles

**Crash Detection Model** — `best_crash.pt`  
Classes: `0`, `1`, `2` — only class `2` is considered a valid accident

---

## 🧪 Detection Logic

An accident is confirmed when all 3 conditions are met:

1. Two vehicles overlap (IoU ≥ threshold)
2. Speed drop detected on one or both vehicles
3. Detection is stable across multiple frames

Each confirmed incident saves a snapshot and logs vehicle IDs, IoU score, and YOLO confidence to `incidents_log.json`, which is then synced to MongoDB via the NestJS API.

---

## Getting Started

### 1. AI Engine

```bash
pip install ultralytics opencv-python numpy
cd backend/ai-engine
python detect_video.py
```

> 🎥 Place your video file inside `backend/ai-engine/` (e.g. `accident0.mp4`). Recommended resolution: 1280x720.

### 2. Backend (NestJS)

> Make sure MongoDB is running locally on port 27017 before starting the server.

```bash
cd backend/server
npm install
npm run start:dev
```

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

> Open `http://localhost:5173/admin/login` and sign in with the admin credentials below.

### 4. Admin Login

| Field | Value |
|-------|-------|
| Email | `admin@trafiq.ai` |
| Password | `trafiq2025` |

After logging in, navigate to **Incidents** to view live accident detections with snapshots and confidence scores.

---

## 📸 Output

**Snapshot** — saved automatically on accident detection:
```
snapshots/snapshot_YYYYMMDD_HHMMSS.jpg
```

**JSON Report** — appended to `incidents_log.json`:
```json
{
  "incident_id": "20260304_032254",
  "incident_type": "vehicle_collision",
  "timestamp": "2026-03-04 03:22:54",
  "snapshot": "snapshots/snapshot_20260304_032254.jpg",
  "vehicle_a": 3,
  "vehicle_b": 7,
  "iou": 0.47,
  "confidence": 0.91
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
- Esprit School of Engineering for academic support