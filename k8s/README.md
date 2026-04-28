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

1. Build the backend and frontend Docker images
2. Push them to Docker Hub with both `latest` and commit-SHA tags
3. Create or update the Kubernetes namespace, Docker registry secret, and backend secret
4. Apply the manifests in `k8s/`
5. Update the deployment image and wait for a successful rollout

For a manual deployment outside GitHub Actions:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

## Local access

The ingress is hostless and path-based, so you can access the stack with either
`localhost` or a node IP.

- Frontend: `http://localhost/` or `http://<NODE_IP>/`
- Backend API through ingress: `http://localhost/api/` or `http://<NODE_IP>/api/`

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
