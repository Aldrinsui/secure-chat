/**
 * apiClient
 * Centralized HTTP client for SecureChat's RESTful Django API.
 *
 * Features:
 *  - Bearer JWT injection on every request
 *  - Automatic 401 → token refresh → retry (single-flight, queued)
 *  - Request timeout (10s default)
 *  - JSON serialisation / deserialisation
 *  - Network error detection for offline UX
 */

const BASE_URL =
  process.env.API_URL ?? 'https://api.securechat.example.com/api/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

class APIClient {
  #token = null;
  #refreshPromise = null; // Single-flight refresh lock

  setToken(token) {
    this.#token = token;
  }

  clearToken() {
    this.#token = null;
  }

  // ─── Core request method

  async request(method, path, body = undefined, retried = false) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.#token) {
      headers['Authorization'] = `Bearer ${this.#token}`;
    }

    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new APIError('Request timed out', 408);
      throw new APIError('Network unavailable', 0);
    } finally {
      clearTimeout(timeoutId);
    }

    // ── Token refresh flow
    if (response.status === 401 && !retried) {
      const newToken = await this.#refreshToken();
      if (newToken) {
        this.setToken(newToken);
        return this.request(method, path, body, true);
      }
      throw new APIError('Session expired', 401);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        detail = errBody.detail ?? errBody.error ?? detail;
      } catch {}
      throw new APIError(detail, response.status);
    }

    if (response.status === 204) return null;

    return response.json();
  }

  // ─── Single-flight token refresh

  async #refreshToken() {
    if (this.#refreshPromise) return this.#refreshPromise;

    this.#refreshPromise = (async () => {
      try {
        const { NativeModules } = require('react-native');
        const raw = await NativeModules.SecureTokenStorage.getTokens();
        if (!raw) return null;

        const { refreshToken } = JSON.parse(raw);
        const data = await this.post('/auth/token/refresh/', { refresh: refreshToken });
        return data?.access ?? null;
      } catch {
        return null;
      } finally {
        this.#refreshPromise = null;
      }
    })();

    return this.#refreshPromise;
  }

  // ─── Convenience methods

  get(path)              { return this.request('GET', path); }
  post(path, body)       { return this.request('POST', path, body); }
  put(path, body)        { return this.request('PUT', path, body); }
  patch(path, body)      { return this.request('PATCH', path, body); }
  delete(path)           { return this.request('DELETE', path); }
}

export class APIError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }

  get isNetworkError()  { return this.statusCode === 0; }
  get isUnauthorized()  { return this.statusCode === 401; }
  get isNotFound()      { return this.statusCode === 404; }
  get isServerError()   { return this.statusCode >= 500; }
}

// Singleton — shared across the app
export const apiClient = new APIClient();
