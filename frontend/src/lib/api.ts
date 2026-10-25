const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002").replace(/\/$/, "");

const ACCESS_TOKEN_KEY = "youstream.accessToken";
const REFRESH_TOKEN_KEY = "youstream.refreshToken";
export const SESSION_CHANGE_EVENT = "youstream:session-changed";
export const PROFILE_CHANGE_EVENT = "youstream:profile-changed";

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type ApiErrorBody = {
  error?: string;
  message?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function saveTokens(tokens: AuthTokens) {
  const storage = isRememberedSession() ? localStorage : sessionStorage;
  const otherStorage = storage === localStorage ? sessionStorage : localStorage;
  storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  otherStorage.removeItem(ACCESS_TOKEN_KEY);
  otherStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

export function saveLoginTokens(tokens: AuthTokens, rememberMe: boolean) {
  const storage = rememberMe ? localStorage : sessionStorage;
  const otherStorage = rememberMe ? sessionStorage : localStorage;
  storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  otherStorage.removeItem(ACCESS_TOKEN_KEY);
  otherStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

export function clearTokens() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

function getStoredToken(key: string) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function isRememberedSession() {
  return Boolean(localStorage.getItem(REFRESH_TOKEN_KEY));
}

export function getAccessToken() {
  return getStoredToken(ACCESS_TOKEN_KEY);
}

export function hasSession() {
  return Boolean(getAccessToken());
}

async function parseError(response: Response) {
  let body: ApiErrorBody = {};

  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Use the HTTP status text when the server does not return JSON.
  }

  return new ApiError(body.error || body.message || response.statusText || "Request failed", response.status);
}

async function send<T>(path: string, init: RequestInit, accessToken?: string) {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function refreshAccessToken() {
  const refreshToken = getStoredToken(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const tokens = await send<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });

    saveTokens(tokens);
    return tokens.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const accessToken = getAccessToken() || undefined;

  try {
    return await send<T>(path, init, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !accessToken) {
      throw error;
    }

    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) throw error;
    return send<T>(path, init, refreshedToken);
  }
}

export function getSocketUrl() {
  return API_BASE_URL;
}
