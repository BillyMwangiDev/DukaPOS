const DEFAULT_API_BASE = "http://localhost:8000";

/** Connection mode: "host" = this PC runs backend; "client" = connect to another PC. */
export const CONNECTION_MODE_KEY = "DUKAPOS_CONNECTION_MODE";

export function getConnectionMode(): "host" | "client" {
  if (typeof window === "undefined") return "host";
  return (localStorage.getItem(CONNECTION_MODE_KEY) as "host" | "client") || "host";
}

export function setConnectionMode(mode: "host" | "client"): void {
  localStorage.setItem(CONNECTION_MODE_KEY, mode);
}

/** API base URL: Host mode uses injected port; Client uses saved API_BASE_URL. */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return DEFAULT_API_BASE;
  const mode = getConnectionMode();
  if (mode === "client") {
    const url = localStorage.getItem("API_BASE_URL")?.trim();
    if (url) return url;
  }
  const port = (window as unknown as { __DUKAPOS_BACKEND_PORT__?: number }).__DUKAPOS_BACKEND_PORT__ ?? 8000;
  return `http://localhost:${port}`;
}

/** @deprecated Use getApiBaseUrl() for reactive base; this is initial load only. */
export const API_BASE_URL = DEFAULT_API_BASE;

export function apiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export const ETIMS_ENABLED_KEY = "ETIMS_ENABLED";

export function getEtimsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ETIMS_ENABLED_KEY) === "true";
}

export function setEtimsEnabled(enabled: boolean): void {
  localStorage.setItem(ETIMS_ENABLED_KEY, enabled ? "true" : "false");
}
