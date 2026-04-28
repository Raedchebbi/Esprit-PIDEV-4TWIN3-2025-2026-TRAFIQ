const browserConfig =
  typeof window !== 'undefined' ? window.__TRAFIQ_CONFIG__ || {} : {};

const env = import.meta.env || {};

function resolveSpecialValue(value) {
  if (value === '__CURRENT_ORIGIN__') {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  return value;
}

function readConfig(key, fallback) {
  const configuredValue = browserConfig[key] || env[key];

  if (configuredValue) {
    return resolveSpecialValue(configuredValue);
  }

  return fallback;
}

export const API_BASE_URL = readConfig('VITE_API_URL', readConfig('VITE_BACKEND_URL', 'http://localhost:3000'));
export const WS_BASE_URL = readConfig('VITE_WS_URL', API_BASE_URL);
export const SOCKET_IO_PATH = readConfig('VITE_SOCKET_IO_PATH', '/socket.io');
export const MAP_DEFAULT_LAT = Number(readConfig('VITE_MAP_DEFAULT_LAT', '36.8068'));
export const MAP_DEFAULT_LNG = Number(readConfig('VITE_MAP_DEFAULT_LNG', '10.1816'));
export const MAP_DEFAULT_ZOOM = Number(readConfig('VITE_MAP_DEFAULT_ZOOM', '14'));
