import axios from "axios";
import { getToken, removeToken } from "@/utils/auth-storage";

// Determine base API URL, defaulting to local FastAPI dev server
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to inject JWT token into requests
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to handle 401 (expired/invalid token) responses globally.
// Clears the stale token and bounces to /login so individual callers
// don't each have to handle "session expired" — and so a stale token
// detected on load doesn't spam the console with an AxiosError.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      removeToken();

      // Avoid redirecting on the auth endpoints themselves (login/register/me)
      // so a bad login attempt doesn't loop, and so callers like loadUser can
      // still react to the rejection without us hijacking navigation.
      const url = error.config?.url || "";
      const isAuthEndpoint =
        url.startsWith("/auth/token") ||
        url.startsWith("/auth/register") ||
        url === "/auth/me";

      if (typeof window !== "undefined" && !isAuthEndpoint) {
        // Defer the redirect to escape the current promise chain.
        setTimeout(() => {
          if (window.location.pathname !== "/login") {
            window.location.assign("/login");
          }
        }, 0);
      }
    }

    return Promise.reject(error);
  }
);
