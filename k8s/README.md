# Kubernetes and Monitoring Setup

## Prerequisites

- Repository: `https://github.com/Raedchebbi/Esprit-PIDEV-4TWIN3-2025-2026-TRAFIQ.git`
- Kubernetes `1.29.x` cluster created with `kubeadm`
- An ingress controller such as `ingress-nginx`
- `kubectl`, `helm`, and access to a Docker Hub account
- GitHub repository secrets:
  - `DOCKERHUB_TOKEN`
  - `KUBE_CONFIG_DATA` (base64-encoded kubeconfig)
  - `JWT_SECRET`
  - `AI_WS_TOKEN`
  - `GROQ_API_KEY`
  - `MONGODB_URI`
  - `REDIS_PASSWORD` (can be blank when using the included unauthenticated Redis manifest)
  - `INITIAL_SUPER_ADMIN_EMAIL`
  - `INITIAL_SUPER_ADMIN_PASSWORD`
  - `SONAR_TOKEN`
- GitHub repository variables:
  - `SONAR_HOST_URL`
  - `DOCKERHUB_EMAIL` (optional)

The committed configuration already targets Docker Hub user `mohamedkhalil26` and
SonarQube project keys:

- `raedchebbi-esprit-pidev-4twin3-2025-2026-trafiq-backend`
- `raedchebbi-esprit-pidev-4twin3-2025-2026-trafiq-frontend`

The CI workflows now expect repository variable `SONAR_HOST_URL` to point at a
publicly reachable SonarQube URL. GitHub-hosted runners cannot reach your local
machine's `http://localhost:9000` directly.

## SonarQube with GitHub-hosted runners

Because your SonarQube server is local, you must expose it through a tunnel before
GitHub-hosted runners can scan against it.

Example with `cloudflared`:

```bash
cloudflared tunnel --url http://localhost:9000
```

Example with `ngrok`:

```bash
ngrok http 9000
```

Then copy the generated HTTPS URL into GitHub repository variable `SONAR_HOST_URL`.
Do not use `http://localhost:9000` in GitHub Actions when the runner is hosted by GitHub.

## Application deployment

The GitHub CD workflows automatically:

1. Build the backend, frontend, and AI engine Docker images
2. Push them to Docker Hub with both `latest` and commit-SHA tags
3. Create or update the Kubernetes namespace, Docker registry secret, backend secret, and AI secret
4. Apply the manifests in `k8s/`
5. Update the deployment image and wait for a successful rollout

For a manual deployment outside GitHub Actions:

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

Recommended deployment order:

1. Namespace, ConfigMaps, and Secrets
2. MongoDB and Redis
3. Backend API
4. AI engine worker
5. Frontend and ingress

Production feature flags in `trafiq-backend-config` expect MongoDB and Redis to be available:

- `USE_MONGO_AS_PRIMARY=true`
- `USE_REDIS=true`
- `USE_CENTRAL_SESSIONS=true`

If you scale the backend above one replica, keep Redis enabled. Otherwise Socket.IO rooms and centralized navigation sessions will fall back to node-local behavior.

## AI engine container

Build the AI engine image locally from its own context:

```bash
docker build -t trafiq-ai-engine:local -f backend/ai-engine/Dockerfile backend/ai-engine
```

Run locally against a backend instance:

```bash
docker run --rm \
  -e NESTJS_URL=http://host.docker.internal:3000 \
  -e AI_WS_TOKEN=replace-with-shared-token \
  -e GROQ_API_KEY=replace-with-groq-key \
  -e CAMERAS_CONFIG=/app/cameras.json \
  trafiq-ai-engine:local
```

Required AI environment variables:

- `NESTJS_URL`: backend Socket.IO base URL, for example `http://trafiq-backend:3000` in Kubernetes.
- `AI_WS_TOKEN`: shared producer token. Must match backend `AI_WS_TOKEN` so `risk_event`, `incident_confirmed`, `camera_status`, and `vehicle_counts` are accepted.
- `GROQ_API_KEY`: Groq API key when `ENABLE_RISK_ASSESSMENT=true`.
- `CAMERAS_CONFIG`: path to the camera registry JSON. Defaults to `/app/cameras.json` in Kubernetes.
- `AI_HEALTH_FILE`: readiness marker path. The container writes this after model and camera startup.

Kubernetes deployment notes:

- `k8s/ai-engine-deployment.yaml` runs the AI engine as a non-root worker.
- Readiness and liveness probes check `AI_HEALTH_FILE`.
- `AI_WS_TOKEN` and `GROQ_API_KEY` are read from `trafiq-ai-secrets`.
- The AI engine connects securely to the backend using the Socket.IO auth handshake; event names remain unchanged.

## Local access

The ingress is hostless and path-based, so you can access the stack with either
`localhost` or a node IP.

- Frontend: `http://localhost/` or `http://<NODE_IP>/`
- Backend API through ingress: `http://localhost/api/` or `http://<NODE_IP>/api/`

## Smoke test checklist

After deployment:

```bash
kubectl rollout status deployment/trafiq-mongodb -n trafiq
kubectl rollout status deployment/trafiq-redis -n trafiq
kubectl rollout status deployment/trafiq-backend -n trafiq
kubectl rollout status deployment/trafiq-ai-engine -n trafiq
kubectl rollout status deployment/trafiq-frontend -n trafiq

kubectl get pods -n trafiq
curl -sf http://localhost/api/health
curl -sf http://localhost/
```

Expected runtime wiring:

- Backend reaches MongoDB through `MONGODB_URI`.
- Backend reaches Redis through `REDIS_HOST=trafiq-redis` and `REDIS_PORT=6379`.
- AI engine reaches backend through `NESTJS_URL=http://trafiq-backend:3000`.
- Frontend reaches backend through same-origin `/api` and Socket.IO path `/api/socket.io`.

## Rollback notes

Use Kubernetes rollout undo for application workloads:

```bash
kubectl rollout undo deployment/trafiq-backend -n trafiq
kubectl rollout undo deployment/trafiq-ai-engine -n trafiq
kubectl rollout undo deployment/trafiq-frontend -n trafiq
```

Avoid rolling back MongoDB/Redis manifests unless the datastore deployment itself is broken. Application rollback should preserve stateful services.

If your ingress controller is exposed on a VM or bare-metal node instead of your
local machine, replace `localhost` with that node's reachable IP address.

## Monitoring stack

The monitoring setup uses the `kube-prometheus-stack` Helm chart because it includes
Prometheus Operator, which is required for `ServiceMonitor` and `PrometheusRule` CRDs.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

kubectl create namespace monitoring
kubectl apply -f k8s/monitoring/alertmanager-config.yaml
kubectl apply -f k8s/monitoring/grafana-admin-secret.yaml
kubectl apply -f k8s/monitoring/service-monitors.yaml
kubectl apply -f k8s/monitoring/prometheus-rules.yaml
kubectl apply -f k8s/monitoring/grafana-dashboards.yaml

helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  -f k8s/monitoring/prometheus-values.yaml \
  -f k8s/monitoring/grafana-values.yaml

kubectl -n monitoring port-forward svc/monitoring-grafana 3001:80
```

## Notes

- The backend exposes Prometheus metrics at `/metrics`.
- The frontend is served by Nginx and exports web-server metrics through an `nginx-prometheus-exporter` sidecar.
- Grafana is exposed locally with port-forward on `http://localhost:3001`.
- `k8s/secret.yaml` and `k8s/monitoring/grafana-admin-secret.yaml` are safe templates only. Replace the placeholder values for manual installs.
- The included MongoDB and Redis manifests use `emptyDir` for simple cluster demos. Use managed services or persistent volumes for real production.
