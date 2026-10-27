import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const TOKEN_KEY = "nf_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

let cachedToken: string | null = null;
let broadcastChannel: BroadcastChannel | null = null;

// Helper to read cookie by name
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Helper to write cookie
function writeCookie(name: string, value: string | null, maxAgeSeconds = COOKIE_MAX_AGE) {
  if (typeof document === "undefined") return;
  if (value) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  } else {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  }
}

// Initialize broadcast channel and storage listeners for cross-tab sync
if (typeof window !== "undefined") {
  try {
    cachedToken = window.localStorage.getItem(TOKEN_KEY) || readCookie(TOKEN_KEY);
    if (cachedToken && !readCookie(TOKEN_KEY)) {
      writeCookie(TOKEN_KEY, cachedToken);
    }
  } catch {
    cachedToken = readCookie(TOKEN_KEY);
  }

  // Cross-tab broadcast channel
  try {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannel = new BroadcastChannel("nf_auth_channel");
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === "AUTH_CHANGE") {
          const newToken = event.data.token ?? null;
          if (cachedToken !== newToken) {
            cachedToken = newToken;
            window.dispatchEvent(new CustomEvent("nf_auth_change", { detail: { token: newToken } }));
          }
        }
      };
    }
  } catch {
    /* fallback to storage event */
  }

  // Native storage event listener (fires in all other tabs when localStorage changes)
  window.addEventListener("storage", (e) => {
    if (e.key === TOKEN_KEY) {
      const newToken = e.newValue || null;
      if (cachedToken !== newToken) {
        cachedToken = newToken;
        writeCookie(TOKEN_KEY, newToken);
        window.dispatchEvent(new CustomEvent("nf_auth_change", { detail: { token: newToken } }));
      }
    }
  });

  // When tab gains focus, resync with storage in case user logged in/out on another tab
  window.addEventListener("focus", () => {
    try {
      const stored = window.localStorage.getItem(TOKEN_KEY) || readCookie(TOKEN_KEY);
      if (stored !== cachedToken) {
        cachedToken = stored;
        window.dispatchEvent(new CustomEvent("nf_auth_change", { detail: { token: stored } }));
      }
    } catch {
      /* ignore */
    }
  });
}

/**
 * Returns current auth token, always checking storage and cookies dynamically.
 */
export function getToken(): string | null {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(TOKEN_KEY);
      if (stored) {
        cachedToken = stored;
        return stored;
      }
      const cookie = readCookie(TOKEN_KEY);
      if (cookie) {
        cachedToken = cookie;
        try {
          window.localStorage.setItem(TOKEN_KEY, cookie);
        } catch {
          /* ignore */
        }
        return cookie;
      }
      cachedToken = null;
      return null;
    } catch {
      return cachedToken;
    }
  }
  return cachedToken;
}

/**
 * Sets or removes the auth token across memory, localStorage, cookies, and broadcasts to other tabs.
 */
export function setToken(t: string | null) {
  cachedToken = t;
  if (typeof window !== "undefined") {
    try {
      if (t) {
        window.localStorage.setItem(TOKEN_KEY, t);
        writeCookie(TOKEN_KEY, t);
      } else {
        window.localStorage.removeItem(TOKEN_KEY);
        writeCookie(TOKEN_KEY, null);
      }
    } catch {
      writeCookie(TOKEN_KEY, t);
    }

    // Notify other tabs via BroadcastChannel
    try {
      broadcastChannel?.postMessage({ type: "AUTH_CHANGE", token: t });
    } catch {
      /* ignore */
    }

    // Notify current tab listeners
    window.dispatchEvent(new CustomEvent("nf_auth_change", { detail: { token: t } }));
  }
}

/**
 * Subscribe to auth token changes (login, logout, token refresh across tabs).
 */
export function onAuthChange(callback: (token: string | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<{ token: string | null }>;
    callback(custom.detail?.token ?? getToken());
  };
  window.addEventListener("nf_auth_change", handler);
  return () => window.removeEventListener("nf_auth_change", handler);
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const currentToken = getToken();
  const res = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.message ?? data.error ?? message;
      if (Array.isArray(message)) message = message.join(", ");
    } catch {
      /* not json */
    }

    // If 401 Unauthorized, automatically clear stale credentials
    if (res.status === 401 && currentToken) {
      setToken(null);
    }

    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);

  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  // Automatically reload on cross-tab auth change
  useEffect(() => {
    const unsub = onAuthChange((token) => {
      if (token && path) {
        reload();
      } else if (!token) {
        setData(null);
      }
    });
    return unsub;
  }, [path, reload]);

  return { data, error, loading, reload, setData };
}
