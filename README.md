# TRAFIQ – AI-Powered Traffic Accident Detection System

## Overview

Developed as part of **PIDEV – 4th Year Engineering Program** at **Esprit School of Engineering** (2025–2026).

TRAFIQ is a real-time, multi-camera traffic monitoring system that detects vehicle collisions using computer vision (YOLOv8) and assesses risk severity via a vision-language model (Groq / Llama 4 Scout). It processes local dashcam footage and live HLS streams simultaneously, generates annotated snapshots and structured incident reports, pushes events over WebSocket in real time, and displays everything on an interactive admin dashboard with Leaflet maps and per-camera live feeds.

TRAFIQ has also been upgraded into a **pre-production MVP architecture**: MongoDB can act as the primary data source with JSON fallback, Redis supports Socket.IO scale-out and centralized navigation sessions, AI producer WebSocket events are authenticated, and the Python AI engine now has Docker/Kubernetes deployment support.

---

## Features

- **Hierarchical access control** – strict RBAC system with `SUPER_ADMIN` (global access) and `ADMIN` roles (country-scoped data isolation enforced via JWT on the backend)
- **Admin management portal** – graphical interface for `SUPER_ADMIN` to create, assign, and manage country-level admin users
- **Dynamic camera registry** – single `cameras.json` config file drives AI engine, backend, and frontend — add new cameras without code changes
- **Multi-camera YOLO detection** – concurrent sources (local MP4 + live HLS streams); iframe-only cameras auto-skipped by the AI engine
- **Collision detection** – proximity-based + IoU overlap with multi-frame confirmation
- **Low-confidence early dismissal** – collisions below `MIN_INCIDENT_CONF` (default 0.55) are dismissed before reaching the frontend
- **Groq Vision risk assessment** – LLM analyses composite camera image + telemetry, returns structured risk score
- **Refined risk scoring** – blends incident severity (70%) with live vehicle density (30%) for dynamic risk levels
- **Real-time vehicle counts** – AI engine writes `vehicle_counts.json` every 15 frames → NestJS serves via REST → frontend polls every 2s
- **Congestion-based map visualization** – circle radius colors and badges driven by live vehicle density (Fluide / Modéré / Dense / Saturé)
- **Real-time WebSocket pipeline** – Python engine → NestJS gateway → React dashboard (Socket.io)
- **Annotated snapshot capture** – collision bounding boxes + metadata banner saved as JPEG
- **MongoDB primary + JSONL fallback** – MongoDB can be authoritative for incidents while JSONL remains available for local/demo fallback and migration
- **False positive management** – flag, unflag (restore), or permanently delete false positives; flagged incidents excluded from dashboard, map, congestion, sidebar, and AI agent views
- **Interactive admin dashboard** – Leaflet map with dynamic congestion-colored zone circles, media popups, auto-focus navigation
- **Live monitoring** – embedded dashcam video and Windy webcam livestream iframes grouped by city
- **Congestion analysis page** – real-time traffic density per zone with live vehicle counts, congestion levels, and active incident stats
- **Public citizen app** – proximity alerts, route planner, live route status
- **Algorithmic risk fallback** – instant heuristic scoring when Groq is unavailable or between API calls
- **MongoDB primary storage with fallback** – incidents, cameras, users, and vehicle counts can use MongoDB as source of truth while keeping JSON/JSONL fallback for local/demo mode
- **Redis-backed horizontal scaling** – Socket.IO Redis adapter and centralized navigation sessions support multiple backend replicas
- **Strict navigation session tokens** – public navigation sessions return and require `sessionToken` when centralized sessions are enabled
- **Authenticated AI producer channel** – Python AI engine sends `AI_WS_TOKEN` in Socket.IO handshake; backend rejects unauthorized producer events
- **Production security hardening** – no hardcoded production users, HTTP/WebSocket rate limiting, configurable secrets, non-root containers, and Kubernetes security contexts

---

## Tech Stack

| Layer | Technology | Role in TRAFIQ |
|-------|------------|----------------|
| **Frontend / Experience** | React 19 (Vite), React Router 7, React-Leaflet 5, Recharts 3, Socket.io Client | Admin supervision dashboard and citizen-facing traffic/navigation application |
| **Backend / Application Core** | NestJS 11, TypeScript, Passport JWT, Socket.io 4, class-validator | REST API, RBAC, event gateway, public mobility APIs, centralized navigation sessions, metrics exposure |
| **AI / Perception** | Python 3.11, Ultralytics YOLOv8, OpenCV, PIL, python-socketio | Multi-camera acquisition, vehicle detection, collision confirmation, snapshot generation |
| **Risk Intelligence** | Groq SDK, `meta-llama/llama-4-scout-17b-16e-instruct` | Vision-language risk assessment with algorithmic fallback |
| **Persistence** | MongoDB, Redis, JSONL/JSON fallback, local file artifacts | Primary data storage, Socket.IO/session scale-out, local demo fallback, snapshot evidence |
| **Edge / Delivery** | Nginx, ingress-nginx | SPA serving, runtime config injection, ingress routing, Socket.io path exposure |
| **Platform / DevOps** | GitHub Actions, Docker, Docker Hub, Kubernetes, Helm | CI/CD for frontend/backend/AI, image delivery, orchestration, rollout automation |
| **Observability / Quality** | Prometheus, Grafana, Alertmanager, SonarQube | Metrics scraping, dashboards, alerting, static quality analysis |
| **External Data Sources** | Flussonic HLS streams, local MP4 files, Windy embeds | Traffic video ingestion and live feed visualization |

---

## Architecture

### Current Architecture at a Glance

- **React/Vite frontend** serves the admin dashboard and public citizen navigation app through one SPA, with runtime API/WebSocket configuration injected by Nginx.
- **NestJS backend** exposes REST APIs, JWT/RBAC, public mobility services, Socket.IO gateways, Prometheus metrics, MongoDB repositories, Redis adapter wiring, and security/rate-limit controls.
- **Python AI engine** uses OpenCV, YOLO, Groq, and `python-socketio` to detect collisions, assess risk, generate evidence, and emit authenticated producer events.
- **MongoDB** stores primary runtime data when `USE_MONGO_AS_PRIMARY=true`: incidents, cameras, users, vehicle counts, AI events, telemetry, notifications, and user sessions.
- **Redis** enables Socket.IO adapter fan-out and centralized navigation session storage when `USE_REDIS=true` and `USE_CENTRAL_SESSIONS=true`.
- **Socket.IO** carries AI producer events to NestJS and real-time admin/public events to browsers without changing event names.
- **Kubernetes** deploys MongoDB, Redis, backend, frontend, and AI engine workloads in the `trafiq` namespace with probes, resources, secrets, and security contexts.

---

### 1. Logical System View

```text
+----------------------------------------------------------------------------------+
|                              EXPERIENCE CLUSTER                                  |
|----------------------------------------------------------------------------------|
| React Frontend (Vite)                                                            |
| - Admin app: dashboard, incidents, live monitoring, congestion, snapshots        |
| - Public app: map, route planner, route status, proximity + navigation alerts    |
| - Shared client layer: auth context, runtime config, REST services, WS hooks     |
+-----------------------------+------------------------------------+---------------+
                              | HTTPS / REST                       | WebSocket
                              v                                    v
+----------------------------------------------------------------------------------+
|                         APPLICATION CORE CLUSTER                                 |
|----------------------------------------------------------------------------------|
| NestJS Server                                                                    |
| - Auth cluster: JWT login, RBAC, admin lifecycle, country scoping                |
| - Incident cluster: MongoDB primary + JSON fallback, snapshot serving            |
| - Registry cluster: MongoDB camera registry + cameras.json fallback              |
| - Public mobility cluster: public incidents, congestion, route suggestions       |
| - Navigation cluster: tokenized sessions, scoped alerts, /public websocket       |
| - Real-time cluster: authenticated AI producer gateway + Redis-capable broadcast |
| - Observability cluster: /health, /metrics, Prometheus middleware                |
+-----------------------------+------------------------------------+---------------+
                              | MongoDB / Redis                    | Socket.io
                              v                                    v
+----------------------------------------------------------------------------------+
|                        PERCEPTION AND RISK CLUSTER                               |
|----------------------------------------------------------------------------------|
| Python AI Engine (`detect_video.py`)                                             |
| - Camera bootstrap from `cameras.json`                                           |
| - OpenCV video acquisition + reconnect/backoff                                   |
| - YOLOv8 vehicle detection                                                       |
| - Collision scoring using proximity, IoU, size, confidence, and speed history    |
| - 3-frame confirmation + cooldown                                                |
| - Background Groq worker + heuristic fallback                                    |
| - Authenticated Socket.IO producer using AI_WS_TOKEN                             |
| - Evidence generation: snapshots, JSONL fallback, MongoDB projection via backend |
+-----------------------------+------------------------------------+---------------+
                              |                                    |
                              v                                    v
                    DATA SOURCES CLUSTER                 STATE / PERSISTENCE CLUSTER
                    - Local MP4 demo cameras            - `backend/ai-engine/incidents.jsonl`
                    - HLS traffic streams               - `backend/ai-engine/vehicle_counts.json`
                    - Windy embed feeds for UI          - `backend/ai-engine/snapshots/`
                                                        - MongoDB primary collections
                                                        - Redis Socket.IO/session store
                                                        - JSON fallback for local/dev mode
```

### 2. Functional Clusters

| Cluster | Main implementation | Architectural role | Main contracts |
|--------|----------------------|--------------------|----------------|
| **Experience Cluster** | `frontend/src/apps/admin`, `frontend/src/apps/public`, `frontend/src/shared` | Presents supervision and citizen workflows through two applications in one React codebase | REST fetches, Socket.io subscriptions, browser geolocation, runtime config |
| **Access and Security Cluster** | `backend/server/src/auth` | Authenticates admins, seeds default users, issues JWTs, enforces role and country scope | `/auth/login`, `/auth/me`, `/auth/admins/*`, JWT payload `{ sub, email, role, country }` |
| **Incident Operations Cluster** | `backend/server/src/accidents` | Reads and mutates incident evidence, serves snapshots, supports false-positive governance | `/accidents`, `/accidents/active`, `/accidents/flag`, `/accidents/unflag`, `/accidents/remove`, `/accidents/snapshot/:filename` |
| **Registry and Configuration Cluster** | `backend/ai-engine/cameras.json`, `backend/server/src/cameras`, `frontend/src/shared/config` | Keeps camera topology config-driven and reloadable without code changes | `/cameras`, runtime `runtime-config.js`, environment-backed Nest config |
| **Perception Cluster** | `backend/ai-engine/detect_video.py`, `models/`, `prompts.py` | Performs video ingestion, YOLO inference, motion reasoning, collision confirmation, and risk preparation | Camera frame loop, `incident_confirmed`, `risk_event`, `camera_status`, `vehicle_counts` |
| **Risk and Real-Time Cluster** | `backend/server/src/risk` | Bridges Python engine and web clients through Socket.io and cached telemetry | Root namespace Socket.io, `/vehicle-counts`, `risk_update`, `new_incident`, `camera_update` |
| **Public Mobility Cluster** | `backend/server/src/public-api`, `backend/server/src/navigation`, `frontend/src/shared/hooks/usePublicSocket.js` | Provides open citizen services: incidents map, congestion, route scoring, session-based alerting | `/public/incidents`, `/public/congestion`, `/public/routes/suggest`, `/public/navigation/*`, `/public` namespace |
| **Persistence Cluster** | `incidents.jsonl`, `vehicle_counts.json`, `snapshots/`, `data/users.json` | Stores durable evidence and configuration while keeping the platform lightweight and demo-friendly | Append-only JSONL, JSON snapshots, generated media artifacts |
| **Observability Cluster** | `backend/server/src/metrics`, `k8s/monitoring/` | Exposes application and platform metrics, dashboards, and alerts | `/health`, `/metrics`, ServiceMonitors, Prometheus rules, Grafana dashboards |
| **DevOps Cluster** | `.github/workflows`, `frontend/Dockerfile`, `backend/server/Dockerfile`, `k8s/` | Automates build, scan, packaging, deployment, scaling, ingress, and runtime configuration | GitHub Actions CI/CD, Docker Hub tags, Kubernetes manifests, HPA, ingress |

### 3. Runtime Flow A - Collision Detection to Admin Dashboard

1. The AI engine loads enabled cameras from `backend/ai-engine/cameras.json` and resolves each source to a local video file, HLS stream, or raw stream URL.
2. For every camera loop, OpenCV grabs a frame and YOLO predicts vehicle bounding boxes.
3. The engine deduplicates overlapping detections, assigns stable IDs by nearest-center matching, and computes per-vehicle speed peaks across frames.
4. Vehicle pairs are evaluated using proximity gap ratio, IoU duplicate guard, minimum box area, size ratio, per-box confidence, recent movement, and post-impact slowdown.
5. A collision is only confirmed after `CONFIRMATION_FRAMES` consecutive detections and is then filtered again by `MIN_INCIDENT_CONF` to dismiss weak false positives before publication.
6. When confirmed, the engine writes an annotated snapshot to `snapshots/`, appends a structured record to `incidents.jsonl`, updates `vehicle_counts.json`, and emits `incident_confirmed` plus periodic `vehicle_counts` events through Socket.io.
7. A background Groq worker independently receives fused multi-camera context and a composite image, returns a structured risk score, and emits `risk_event` without blocking the detection loop.
8. `RiskGateway` in NestJS rebroadcasts `risk_update`, `new_incident`, `camera_update`, and `vehicle_counts` to browser clients.
9. The admin React application consumes both REST and WebSocket data to refresh maps, incident cards, congestion widgets, and live system status.

### 4. Runtime Flow B - Citizen Navigation and Route Alerts

1. The public frontend requests `/public/routes/suggest` with origin and destination coordinates.
2. `PublicApiService` combines active incidents, live vehicle counts, and predefined route templates to calculate risk-aware route suggestions.
3. Once a citizen selects a route, the frontend creates a session through `POST /public/navigation/start` and subscribes to the `/public` Socket.io namespace.
4. `NavigationService` stores the session in memory, tracks user position updates, and applies a 2-hour inactivity TTL.
5. When a new incident arrives through the main risk gateway, `PublicGateway` checks route relevance and proximity for every subscribed session.
6. Only impacted users receive `navigation_alert` or `route_congestion_update`, which keeps the citizen channel scoped instead of broadcasting all incidents to all users.

### 5. Runtime Flow C - Admin Security and Country Isolation

1. Admin users authenticate through `/auth/login` and receive a JWT carrying role and country scope.
2. `JwtAuthGuard` and `RolesGuard` protect admin routes such as `/accidents`, `/cameras`, and `/vehicle-counts`.
3. `SUPER_ADMIN` can read all cameras/incidents and manage other admins through `/auth/admins/*`.
4. `ADMIN` users are automatically restricted to cameras whose `area` matches their assigned country.
5. This country scoping is enforced in controllers by filtering camera IDs before the request reaches the service layer, which keeps isolation explicit and easy to audit.

### 6. State and Persistence Model

| State / Store | Type | Owner | Purpose |
|--------------|------|-------|---------|
| `backend/ai-engine/cameras.json` | Versioned JSON config | AI engine + CamerasService | Single source of truth for enabled cameras, labels, locations, and stream URLs |
| MongoDB `incidents` | Primary collection | NestJS Mongo repository | Authoritative incident store when `USE_MONGO_AS_PRIMARY=true` |
| MongoDB `cameras` | Primary collection | NestJS Mongo repository | Authoritative camera registry after migration |
| MongoDB `users` | Primary collection | AuthService | Admin account store in pre-production mode |
| MongoDB `vehicle_counts` | Primary collection | VehicleCountsStore | Latest and historical vehicle-count snapshots |
| MongoDB `ai_events`, `traffic_incidents`, `telemetry_logs`, `notifications`, `user_sessions` | Operational collections | MongoDB intelligence layer | AI event history, telemetry, notification delivery, session analytics |
| Redis | In-memory network service | Socket.IO adapter + CentralSessionService | Cross-replica Socket.IO broadcasts and centralized navigation sessions |
| `backend/ai-engine/incidents.jsonl` | Append-only fallback file | AI engine writes, NestJS reads when Mongo primary is disabled | Local/demo incident history and migration source |
| `backend/ai-engine/vehicle_counts.json` | Mutable fallback JSON snapshot | AI engine writes, NestJS reads when Mongo primary is disabled | Local/demo congestion telemetry |
| `backend/ai-engine/snapshots/` | File-system media artifacts | AI engine writes, NestJS serves | Visual evidence for confirmed incidents |
| `backend/server/data/users.json` | JSON fallback file | AuthService | Local/dev admin account fallback |
| `NavigationService.sessions` | In-memory fallback map | NestJS navigation module | Legacy route sessions when centralized sessions are disabled |
| `window.__TRAFIQ_CONFIG__` | Browser runtime config | Nginx entrypoint | Late-bound frontend API, WebSocket, and map configuration |

### 7. Deployment and DevOps Architecture

```text
Developer push / pull request
            |
            v
GitHub Actions CI
- `ci-frontend.yml`: npm ci -> lint -> vitest -> build -> SonarQube
- `ci-backend.yml` : npm ci -> lint -> jest coverage -> build -> SonarQube
- `ci-ai-engine.yml`: Python compile -> camera JSON validation -> Docker image build
            |
            v
GitHub Actions CD (on successful CI run on `master`)
- Build Docker images with Buildx
- Tag images with commit SHA and compatibility `latest` tags in the registry
- Push images to Docker Hub
- Apply / update Kubernetes manifests with kubectl
- Annotate deployments with CI run id and commit SHA
            |
            v
Kubernetes namespace: `trafiq`
- `trafiq-mongodb` Deployment + Service
- `trafiq-redis` Deployment + Service
- `trafiq-frontend` Deployment: 2 replicas
- `trafiq-backend` Deployment: 2 replicas
- `trafiq-ai-engine` Deployment: 1 AI worker replica
- Backend HPA: min 2, max 6 replicas
- ConfigMaps + Secrets + Docker registry pull secret
- Ingress: `/` -> frontend, `/api` -> backend, Socket.io timeout tuning
            |
            v
Monitoring namespace: `monitoring`
- kube-prometheus-stack via Helm
- ServiceMonitors for backend `/metrics` and frontend Nginx exporter
- PrometheusRule alerts for downtime, crash loops, 5xx error rate
- Grafana dashboards for HTTP traffic, pod resources, rollout health
- Alertmanager routing layer

External runtime dependencies
- Groq API for VLM risk assessment
- Local MP4 + HLS traffic streams for AI ingestion
- Optional managed MongoDB/Redis for durable production deployments
```

### Jenkins Evaluation Pipeline

GitHub Actions is the active CI/CD implementation in this repository. A root-level `Jenkinsfile` is also provided for Jenkins-based evaluation and can run equivalent CI/CD stages.

Create a Jenkins Pipeline job from SCM and point it to `Jenkinsfile`. The pipeline is parameterized:

| Parameter | Values | Purpose |
|-----------|--------|---------|
| `COMPONENT` | `backend`, `frontend`, `ai-engine`, `all` | Select which component(s) to process |
| `RUN_TESTS` | `true` / `false` | Enable unit tests |
| `RUN_SONAR` | `true` / `false` | Enable SonarQube scan placeholders |
| `BUILD_DOCKER` | `true` / `false` | Build Docker images |
| `PUSH_DOCKER` | `true` / `false` | Push Docker images to Docker Hub |
| `DEPLOY_K8S` | `true` / `false` | Apply Kubernetes manifests and roll out workloads |

Safe demo run for the jury:

- `COMPONENT=all`
- `RUN_TESTS=true`
- `RUN_SONAR=false`
- `BUILD_DOCKER=false`
- `PUSH_DOCKER=false`
- `DEPLOY_K8S=false`

Required Jenkins credentials when optional stages are enabled:

- `dockerhub-username`
- `dockerhub-token`
- `sonar-token`
- `kubeconfig`
- `jwt-secret`
- `ai-ws-token`
- `mongodb-uri`
- `redis-password`
- `initial-super-admin-email`
- `initial-super-admin-password`
- `groq-api-key`

The Jenkinsfile does not replace GitHub Actions; it exists so the same project can be demonstrated in a Jenkins-based DevOps evaluation grid.

### 8. Operational Modes

| Mode | Components | What it enables |
|------|------------|-----------------|
| **Local integrated mode** | Python AI engine + NestJS server + Vite frontend in the same workspace | Full end-to-end demo with shared local files (`incidents.jsonl`, snapshots, vehicle counts) |
| **Platform delivery mode** | MongoDB + Redis + backend + frontend + AI engine deployed to Kubernetes with monitoring and ingress | Automated CI/CD, containerized delivery, replicas, HPA, dashboards, and alerting |

> Current repository note: Kubernetes manifests now package MongoDB, Redis, backend, frontend, and the Python AI engine. The included MongoDB/Redis manifests are demo/staging defaults using `emptyDir`; use managed services or persistent volumes for real production.

### 9. DevOps Structure by Folder

```text
TRAFIQ/
├── .github/
│   └── workflows/                     # CI/CD cluster
│       ├── ci-backend.yml             # Backend lint, test, build, SonarQube
│       ├── ci-frontend.yml            # Frontend lint, test, build, SonarQube
│       ├── ci-ai-engine.yml           # AI syntax/config validation and Docker build
│       ├── cd-backend.yml             # Backend image build and Kubernetes rollout
│       ├── cd-frontend.yml            # Frontend image build and Kubernetes rollout
│       └── cd-ai-engine.yml           # AI image build and Kubernetes rollout
├── k8s/                               # Platform deployment cluster
│   ├── configmap.yaml                 # Runtime config for backend and frontend
│   ├── secret.yaml                    # Backend secret template
│   ├── ingress.yaml                   # Path-based ingress (`/` and `/api`)
│   ├── backend-deployment.yaml        # Backend Deployment + Service + HPA
│   ├── frontend-deployment.yaml       # Frontend Deployment + Service + Nginx exporter
│   ├── ai-engine-deployment.yaml      # Python AI worker Deployment
│   ├── mongodb-deployment.yaml        # Demo/staging MongoDB Deployment + Service
│   ├── redis-deployment.yaml          # Demo/staging Redis Deployment + Service
│   ├── README.md                      # Kubernetes operating guide
│   └── monitoring/                    # Observability cluster
│       ├── service-monitors.yaml      # Prometheus scrape definitions
│       ├── prometheus-rules.yaml      # Alert definitions
│       ├── prometheus-values.yaml     # kube-prometheus-stack values
│       ├── grafana-values.yaml        # Grafana provisioning options
│       ├── grafana-dashboards.yaml    # Application and rollout dashboards
│       ├── grafana-admin-secret.yaml  # Grafana admin secret template
│       └── alertmanager-config.yaml   # Alertmanager routing template
├── backend/
│   ├── ai-engine/                     # Perception and risk cluster
│   │   ├── detect_video.py            # Multi-camera detection, confirmation, risk worker
│   │   ├── cameras.json               # Camera registry (single source of truth)
│   │   ├── cameras.schema.json        # Schema validation for registry structure
│   │   ├── prompts.py                 # Groq prompt construction
│   │   ├── models/                    # YOLO weights
│   │   ├── snapshots/                 # Generated incident evidence
│   │   ├── incidents.jsonl            # Generated append-only incident log
│   │   ├── vehicle_counts.json        # Generated live telemetry snapshot
│   │   ├── requirements.txt           # Python dependency set
│   │   └── run_demo_videos.ps1        # Local demo launcher
│   └── server/                        # Application core cluster
│       ├── Dockerfile                 # Backend container build
│       └── src/
│           ├── auth/                  # Identity, JWT, roles, admin CRUD
│           ├── accidents/             # Incident access and evidence serving
│           ├── cameras/               # Dynamic camera registry service
│           ├── risk/                  # Socket.io bridge and vehicle counts cache
│           ├── public-api/            # Citizen REST endpoints
│           ├── navigation/            # Session-based route alert engine
│           ├── metrics/               # Prometheus instrumentation and `/metrics`
│           ├── app.module.ts          # Top-level module wiring
│           └── main.ts                # Nest bootstrap, CORS, validation pipe
├── frontend/
│   ├── Dockerfile                     # Frontend container build
│   ├── nginx.conf                     # SPA serving + stub_status for exporter
│   ├── docker/
│   │   └── 40-runtime-config.sh       # Runtime config injection into `runtime-config.js`
│   ├── public/
│   │   └── runtime-config.js          # Browser runtime config bootstrap
│   └── src/
│       ├── App.jsx                    # Application-level routing
│       ├── apps/
│       │   ├── admin/                 # Admin experience cluster
│       │   │   ├── components/        # Sidebar, topbar, map, cards, widgets
│       │   │   └── pages/             # Dashboard, incidents, congestion, snapshots, settings
│       │   └── public/                # Citizen experience cluster
│       │       ├── components/        # Public map, overlays, alerts, route cards
│       │       └── pages/             # Home, route planner, route status
│       └── shared/
│           ├── config/                # Runtime API and WebSocket resolution
│           ├── context/               # Auth, traffic data, route session state
│           ├── hooks/                 # Data, geolocation, notifications, public socket
│           └── services/              # Admin and public REST clients
├── sonar-project.properties           # Shared SonarQube configuration
├── package.json                       # Workspace orchestration scripts
└── proof-env/                         # Deployment / environment proof artifacts
```

### 10. Architecture Summary

TRAFIQ is architected as a **hybrid intelligent traffic platform** with a clear separation between perception, application orchestration, user experience, and platform operations. The Python layer performs heavy computer-vision and risk inference work, NestJS centralizes security and event distribution, React provides two role-specific user experiences, and the DevOps layer packages the web platform into a monitored Kubernetes deployment. This separation makes the project understandable for academic presentation, extensible for new cameras and countries, and operationally traceable through CI/CD and observability tooling.

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
| `MIN_INCIDENT_CONF` | 0.55 | Minimum confidence to emit incident to frontend |
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

Cameras are defined in `backend/ai-engine/cameras.json`. Add or remove entries without code changes.

| Camera | Source | AI Processing | Location |
|--------|--------|---------------|----------|
| cam0 | `accident.mp4` (local) | ✅ YOLO | France 🇫🇷 |
| cam1 | `accident0.mp4` (local) | ✅ YOLO | Spain 🇪🇸 |
| cam2 | HLS `dvr5.astrakhan.ru/cam26hd` | ✅ YOLO | Astrakhan, Russia 🇷🇺 |
| cam3 | HLS `dvr5.astrakhan.ru/boev-36-hd-1` | ✅ YOLO | Astrakhan, Russia 🇷🇺 |
| cam4 | HLS `dvr5.astrakhan.ru/bogh-17-hd-1` | ✅ YOLO | Astrakhan, Russia 🇷🇺 |
| cam5 | HLS`dvr.astrakhan.ru/kamz-molo-6-hd-2` | ✅ YOLO  | Astrakhan, Russia 🇷🇺 |

> `stream_url` is optional. If absent, the engine falls back to `media_url`. Iframe-only cameras (no raw video stream) are automatically skipped by the AI engine but still appear on the frontend.

---

## Recent Production Readiness Upgrades

The following upgrades were added to move TRAFIQ from a local demo architecture toward a scalable pre-production deployment model:

- **MongoDB primary-source migration** – `backend/server/src/mongodb/mongo-primary.repository.ts` supports primary collections for `incidents`, `cameras`, `users`, and `vehicle_counts`; JSON/JSONL remains as fallback when MongoDB primary is disabled or unavailable.
- **Idempotent migration script** – `npm run migrate:json-to-mongo` imports `incidents.jsonl`, `cameras.json`, `users.json`, and `vehicle_counts.json` into MongoDB using upserts.
- **Active MongoDB intelligence layer** – `ai_events`, `traffic_incidents`, `telemetry_logs`, `notifications`, and `user_sessions` are used for historical risk context, analytics, geo-notification matching, and session mirroring.
- **Redis Socket.IO adapter** – backend can attach `@socket.io/redis-adapter` when `USE_REDIS=true`, allowing broadcasts and rooms to work across backend replicas.
- **Centralized navigation sessions** – `CentralSessionService` stores route sessions centrally, using Redis when enabled and local memory fallback otherwise.
- **Strict `sessionToken` enforcement** – when `USE_CENTRAL_SESSIONS=true`, navigation update/end and WebSocket subscribe/update flows require the private session token returned at session creation.
- **AI WebSocket producer authentication** – the Python engine sends `AI_WS_TOKEN` during Socket.IO connection; backend rejects unauthorized producer events before persistence or rebroadcast.
- **AI event payload validation** – producer payloads are validated for `risk_event`, `incident_confirmed`, `camera_status`, and `vehicle_counts`; malformed events are rejected and camera IDs are normalized.
- **Python AI Docker/Kubernetes support** – `backend/ai-engine/Dockerfile`, `k8s/ai-engine-deployment.yaml`, `ci-ai-engine.yml`, and `cd-ai-engine.yml` package and deploy the AI worker.
- **Production security hardening** – production no longer seeds hardcoded users; initial admin creation is env-based; HTTP and WebSocket rate limits protect login, public navigation, public route suggestions, AI producer events, and public socket events.
- **Kubernetes runtime wiring** – manifests now include MongoDB, Redis, backend, frontend, and AI engine workloads, plus ConfigMaps/Secrets for MongoDB, Redis, JWT, `AI_WS_TOKEN`, Groq, and runtime feature flags.
- **CI/CD expansion** – GitHub Actions now cover backend, frontend, and AI engine validation/build/deploy paths.

---

## API Endpoints

### System and Observability

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | Basic service greeting / bootstrap endpoint |
| `GET` | `/health` | Health probe used by Kubernetes liveness/readiness checks |
| `GET` | `/metrics` | Prometheus metrics endpoint for backend HTTP and process telemetry |

### Admin and Protected API

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/login` | Authenticate admin and return JWT + user profile |
| `GET` | `/auth/me` | Return current authenticated admin profile |
| `GET` | `/auth/admins` | List all admin users (`SUPER_ADMIN` only) |
| `POST` | `/auth/admins` | Create a new country-scoped admin (`SUPER_ADMIN` only) |
| `PATCH` | `/auth/admins/:id` | Update an admin's name, country, or password (`SUPER_ADMIN` only) |
| `DELETE` | `/auth/admins/:id` | Delete an admin account (`SUPER_ADMIN` only) |
| `GET` | `/cameras` | List enabled cameras; `ADMIN` users are automatically country-filtered |
| `GET` | `/vehicle-counts` | Return latest live counts, filtered by role/country scope |
| `GET` | `/accidents` | List all incidents, including false positives, within the caller's scope |
| `GET` | `/accidents/active` | List the authoritative active incidents in the caller's scope (false positives excluded; local JSON fallback also applies the 15-minute activity window) |
| `PATCH` | `/accidents/flag` | Flag incidents as false positives `{ ids: string[] }` |
| `PATCH` | `/accidents/unflag` | Restore flagged incidents `{ ids: string[] }` |
| `DELETE` | `/accidents/remove` | Permanently remove incidents `{ ids: string[] }` |
| `GET` | `/accidents/snapshot/:filename` | Serve an incident snapshot with path-traversal protection |

### Public Mobility API

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/public/incidents` | Return active incidents enriched with camera GPS coordinates |
| `GET` | `/public/congestion` | Return per-zone congestion levels derived from live vehicle counts |
| `POST` | `/public/routes/suggest` | Return risk-aware, road-aligned route suggestions between origin and destination, including route-specific camera incident markers in `activeIncidents` |
| `POST` | `/public/navigation/start` | Start a citizen navigation session |
| `PATCH` | `/public/navigation/:id/position` | Update the live user position for a session |
| `GET` | `/public/navigation/:id/alerts` | Return route-scoped and geo-scoped alerts for the session; route distances are measured from the itinerary start and geo distances from the live user position |
| `DELETE` | `/public/navigation/:id` | End a navigation session |

### WebSocket Events - Admin / Core Namespace

| Direction | Event | Payload |
|-----------|-------|---------|
| Engine → NestJS | `risk_event` | Authenticated with `AI_WS_TOKEN`; `{ risk_score, risk_level, reasoning, scene_summary, frame_count, timestamp }` |
| Engine → NestJS | `incident_confirmed` | Authenticated with `AI_WS_TOKEN`; `{ cam_id/camera_id, incident_id?, snapshot, vehicle_a, vehicle_b, iou, confidence, risk_score, risk_level }` |
| Engine → NestJS | `camera_status` | Authenticated with `AI_WS_TOKEN`; `{ cam_id/camera_id, status: "online" \| "offline" \| "reconnecting" }` |
| Engine → NestJS | `vehicle_counts` | Authenticated with `AI_WS_TOKEN`; `{ total, per_camera: [{ cam_id, count }], timestamp }` |
| NestJS → Frontend | `risk_update` | Re-broadcast of `risk_event` |
| NestJS → Frontend | `new_incident` | Re-broadcast of `incident_confirmed` |
| NestJS → Frontend | `camera_update` | Re-broadcast of `camera_status` |
| NestJS → Frontend | `vehicle_counts` | Re-broadcast of live vehicle telemetry |

### WebSocket Events - Public Namespace (`/public`)

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → NestJS | `subscribe_route` | `{ sessionId, sessionToken }` when centralized sessions are enabled |
| Client → NestJS | `update_position` | `{ sessionId, sessionToken, lat, lng, heading?, speed? }` when centralized sessions are enabled |
| Client → NestJS | `unsubscribe_route` | `{ sessionId }` |
| NestJS → Client | `navigation_alert` | Route-relevant incident alert enriched with scope and distance semantics (`route` = from itinerary start, `geo` = from live user position) |
| NestJS → Client | `route_congestion_update` | Congestion alerts for zones affecting the subscribed route |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- npm 10+
- Groq API key ([console.groq.com](https://console.groq.com))
- Optional for pre-production stack: Docker, Kubernetes, MongoDB, Redis

### Environment Variables

Backend (`backend/server/.env`):

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `development`, `test`, or `production`; production disables hardcoded demo user seeding |
| `JWT_SECRET` | JWT signing secret; required in production |
| `INITIAL_SUPER_ADMIN_EMAIL` | Initial production super admin email when no users exist |
| `INITIAL_SUPER_ADMIN_PASSWORD` | Initial production super admin password when no users exist |
| `INITIAL_SUPER_ADMIN_NAME` | Optional initial super admin display name |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB_NAME` | MongoDB database name, default `trafiq` |
| `USE_MONGO_AS_PRIMARY` | `true` makes MongoDB authoritative for incidents/cameras/users/vehicle counts |
| `USE_REDIS` | `true` enables Redis Socket.IO adapter and Redis session storage |
| `REDIS_HOST` / `REDIS_PORT` | Redis service connection settings |
| `REDIS_PASSWORD` | Optional Redis password |
| `USE_CENTRAL_SESSIONS` | `true` enables tokenized centralized navigation sessions |
| `AI_WS_TOKEN` | Shared secret for authenticated AI producer WebSocket events |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins |
| `RATE_LIMIT_*` | HTTP and WebSocket rate-limit thresholds and TTLs; see `backend/server/.env.example` |

AI engine (`backend/ai-engine/.env`):

| Variable | Purpose |
|----------|---------|
| `NESTJS_URL` | Backend Socket.IO URL, e.g. `http://localhost:3000` locally or `http://trafiq-backend:3000` in Kubernetes |
| `AI_WS_TOKEN` | Shared producer token matching backend `AI_WS_TOKEN` |
| `GROQ_API_KEY` | Groq API key when `ENABLE_RISK_ASSESSMENT=true` |
| `CAMERAS_CONFIG` | Path to camera registry JSON |
| `AI_HEALTH_FILE` | Readiness marker used by Docker/Kubernetes probes |

Frontend runtime config:

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | REST API base URL, usually `/api` in Kubernetes ingress mode |
| `VITE_BACKEND_URL` | Backend base URL used by shared config helpers |
| `VITE_WS_URL` | Socket.IO origin, often `__CURRENT_ORIGIN__` in Kubernetes |
| `VITE_SOCKET_IO_PATH` | Socket.IO path, `/api/socket.io` behind ingress |

---

### 1. AI Engine

```bash
cd backend/ai-engine
pip install -r requirements.txt
```

Create a `.env` file:
```env
GROQ_API_KEY=replace_with_groq_api_key
NESTJS_URL=http://localhost:3000
AI_WS_TOKEN=replace_with_long_random_ai_ws_token
CAMERAS_CONFIG=./cameras.json
SHOW_DISPLAY=true
```

Cameras are configured in `cameras.json` (no more env vars for camera URLs).

Run with demo videos (all 6 configured cameras):
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

To migrate local JSON/JSONL data into MongoDB after configuring `MONGODB_URI`:

```bash
cd backend/server
npm run migrate:json-to-mongo
```

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### 4. Admin Login

Production does not seed hardcoded users. Configure `INITIAL_SUPER_ADMIN_EMAIL` and `INITIAL_SUPER_ADMIN_PASSWORD` before first production boot.

Local development can still seed demo users when `NODE_ENV !== production` and `SEED_DEMO_USERS` is not `false`. These credentials are for local demos only and must not be used in production:

| Role | Email | Password | Scope |
|------|-------|----------|-------|
| **SUPER_ADMIN** | `super@trafiq.ai` | `SuperAdmin2025!` | Global |
| **ADMIN** | `admin@trafiq.ai` | `trafiq2025` | France |
| **ADMIN** | `astrakhan@trafiq.ai` | `trafiq2025` | Astrakhan |
| **ADMIN** | `spain@trafiq.ai` | `trafiq2025` | Spain |

### 5. Docker Builds

```bash
docker build -t trafiq-backend:local -f backend/server/Dockerfile backend
docker build -t trafiq-frontend:local -f frontend/Dockerfile frontend
docker build -t trafiq-ai-engine:local -f backend/ai-engine/Dockerfile backend/ai-engine
```

### 6. Kubernetes Deployment Order

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/mongodb-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/ai-engine-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

See `k8s/README.md` for required GitHub/Kubernetes secrets, smoke tests, and rollback commands.

---

## Validation Commands

Backend:

```bash
cd backend/server
npm run build
npm run lint
npm run test -- --runInBand
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
npm run test
```

AI engine:

```bash
cd backend/ai-engine
python -m py_compile detect_video.py prompts.py
python -m json.tool cameras.json
cd ../..
docker build -t trafiq-ai-engine:local -f backend/ai-engine/Dockerfile backend/ai-engine
```

---

## Admin Dashboard Pages

| Page | Description |
|------|-------------|
| **Overview** | Stats overview + interactive map with congestion-colored zones + live vehicle counts |
| **Live Monitoring** | Video/iframe feeds grouped by city with per-feed map navigation |
| **Incidents** | Multi-select incident management: flag/unflag false positives, delete, view snapshots |
| **Congestion** | Real-time traffic density per zone with live vehicle counts and congestion levels |
| **AI Agent** | AI engine metrics: average confidence, risk distribution, and pipeline health |
| **Snapshots** | Evidence gallery for saved annotated captures generated by confirmed incidents |
| **Analytics** | Charts and historical data visualization |
| **Admin Management** | (SUPER_ADMIN only) Create, assign, and manage country admins |
| **Settings** | System configuration and personal account info with scope |

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
  "camera_label": "Dashcam 1 — accident.mp4",
  "area": "France",
  "location": {
    "latitude": 47.79524,
    "longitude": 2.19883
  },
  "risk_score": 0.82,
  "risk_level": "CRITICAL",
  "risk_reason": "Two vehicles in direct contact with significant overlap."
}
```

---

## Production Notes / Limitations

- TRAFIQ is now an **advanced prototype / pre-production MVP**, not a fully production-certified platform.
- The included MongoDB and Redis Kubernetes manifests use `emptyDir`; they are suitable for demo/staging, not durable production. Use managed MongoDB/Redis or persistent volumes for real deployments.
- `CORS_ORIGIN` in `k8s/configmap.yaml` includes localhost defaults for lab/demo access. Replace it with real production domains before internet exposure.
- Secrets such as `JWT_SECRET`, `AI_WS_TOKEN`, `GROQ_API_KEY`, `MONGODB_URI`, Redis credentials, and initial admin credentials must be supplied through Kubernetes/GitHub secrets and never committed.
- The frontend production build currently emits a large chunk warning. The build passes; code splitting remains a performance optimization, not a deployment blocker.
- Final production readiness still requires TLS hardening, CORS/domain finalization, NetworkPolicies, durable backup/restore procedures, dependency vulnerability review, and managed persistent services.

## Project Status

TRAFIQ currently stands as an **advanced prototype / pre-production MVP** with real AI detection, secure WebSocket producer authentication, tokenized navigation sessions, MongoDB/Redis-backed scaling paths, Dockerized services, Kubernetes manifests, and CI/CD workflows.

It should be considered production-ready only after durable managed data services, TLS/CORS/network policies, backup/restore, and dependency audits are completed.

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
