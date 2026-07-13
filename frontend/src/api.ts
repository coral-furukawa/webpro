export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const AUTH_TOKEN_KEY = "authToken";

export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

export function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(apiUrl(path), { ...init, headers, credentials: "include" });
}

export function assetUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return apiUrl(path);
}
