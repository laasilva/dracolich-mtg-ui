// HTTP client wrapper for the dracolich backend.
// - Auto-attaches JWT from secure storage
// - Auto-includes credentials (anon cookie for OWNED endpoints)
// - Unwraps DmdResponse<T> envelope → T
// - Throws ApiError with the response error envelope for non-2xx
// - Silently refreshes the access token on 401 (single-flight, retries
//   the original request once on success); clears tokens + notifies the
//   AuthProvider on refresh failure so the UI reflects a logged-out state

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import { env } from "./env";
import { StorageKeys, storage } from "./storage";

export interface DmdResponse<T> {
  success: boolean;
  httpStatus: string;
  message: string;
  payload: T | null;
  errors: Array<{ error: string; severity?: string; field?: string }> | null;
}

export class ApiError extends Error {
  status: number;
  errors: DmdResponse<unknown>["errors"];

  constructor(status: number, message: string, errors: DmdResponse<unknown>["errors"]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// ---------- Session-expired hook ----------
//
// The AuthProvider registers a callback here on mount; the response
// interceptor invokes it when the refresh attempt fails. Keeps the api
// module React-free while still letting auth state react to expiry.

let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(cb: (() => void) | null) {
  onSessionExpired = cb;
}

// ---------- Client setup ----------

const client: AxiosInstance = axios.create({
  baseURL: env.apiBase,
  withCredentials: true, // anon cookie passthrough
  timeout: 15000,
});

client.interceptors.request.use(async (config) => {
  const token = await storage.get(StorageKeys.accessToken);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------- Silent token refresh ----------
//
// Single-flight: concurrent 401s all await the same refresh promise.
// Once it resolves they each retry with the new access token attached.
// On refresh failure, every waiter sees the same rejection.

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await storage.get(StorageKeys.refreshToken);
  if (!refreshToken) {
    throw new Error("No refresh token");
  }
  // Use a bare axios call here (not `client`) so this request itself
  // doesn't go through the response interceptor — otherwise a failing
  // refresh would re-enter the same logic recursively.
  const response = await axios.post<
    DmdResponse<{
      accessToken: string;
      refreshToken: string;
      expiresIn?: number;
    }>
  >(
    `${env.apiBase}${env.paths.user}/auth/refresh`,
    { refreshToken },
    { timeout: 15000 }
  );
  const body = response.data;
  if (!body.success || !body.payload) {
    throw new Error(body.message ?? "Refresh failed");
  }
  await storage.set(StorageKeys.accessToken, body.payload.accessToken);
  await storage.set(StorageKeys.refreshToken, body.payload.refreshToken);
  return body.payload.accessToken;
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<DmdResponse<unknown>>) => {
    const status = error.response?.status ?? 0;
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;

    // Conditions for attempting silent refresh:
    //   - 401 specifically
    //   - we have a request to retry
    //   - we haven't already retried this same request
    //   - the failing request isn't an /auth/* endpoint itself
    //     (login/register/refresh — those errors are real, not stale-token)
    const shouldTryRefresh =
      status === 401 &&
      originalRequest &&
      !originalRequest._retried &&
      !(originalRequest.url ?? "").includes("/auth/");

    if (shouldTryRefresh) {
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccessToken = await refreshPromise;
        originalRequest._retried = true;
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return client.request(originalRequest);
      } catch {
        // Refresh failed — purge stored tokens and signal the AuthProvider
        // so React state matches reality. Then fall through to the normal
        // rejection so the caller sees a proper ApiError.
        await storage.remove(StorageKeys.accessToken);
        await storage.remove(StorageKeys.refreshToken);
        onSessionExpired?.();
      }
    }

    const body = error.response?.data;
    const message = body?.message ?? error.message ?? "Request failed";
    return Promise.reject(new ApiError(status, message, body?.errors ?? null));
  }
);

// Generic request that unwraps DmdResponse<T>.payload.
//
// Throws only on `success: false`. A null payload is legitimate — DELETE
// and other no-content endpoints come back as
//   { success: true, payload: null, message: "..." }
// and an earlier "null payload also throws" rule was rejecting those
// (and incidentally any optimistic-but-null body field) as if they were
// errors. Callers expecting a non-null T should defend in their own
// code; the success flag is the canonical signal from the backend.
async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await client.request<DmdResponse<T>>(config);
  const body = response.data;
  if (!body.success) {
    throw new ApiError(response.status, body.message, body.errors);
  }
  return body.payload as T;
}

// Per-service helpers — prepend the service's base-path
export const api = {
  user: <T>(path: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, url: `${env.paths.user}${path}` }),
  mtgLibrary: <T>(path: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, url: `${env.paths.mtgLibrary}${path}` }),
  deckBuilder: <T>(path: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, url: `${env.paths.deckBuilder}${path}` }),
};
