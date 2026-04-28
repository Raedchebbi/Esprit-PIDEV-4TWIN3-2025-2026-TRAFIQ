#!/usr/bin/env sh
set -eu

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__TRAFIQ_CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-http://localhost:3000}",
  VITE_BACKEND_URL: "${VITE_BACKEND_URL:-http://localhost:3000}",
  VITE_WS_URL: "${VITE_WS_URL:-http://localhost:3000}",
  VITE_SOCKET_IO_PATH: "${VITE_SOCKET_IO_PATH:-/socket.io}",
  VITE_MAP_DEFAULT_LAT: "${VITE_MAP_DEFAULT_LAT:-36.8068}",
  VITE_MAP_DEFAULT_LNG: "${VITE_MAP_DEFAULT_LNG:-10.1816}",
  VITE_MAP_DEFAULT_ZOOM: "${VITE_MAP_DEFAULT_ZOOM:-14}"
};
EOF
