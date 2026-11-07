import axios from "axios";

/**
 * Base de las llamadas del navegador al backend.
 *
 * Por defecto es el proxy same-origin de Next (`/backend`), de modo que la
 * cookie de sesión que emite Nest quede en el dominio del frontend
 * (first-party). Esto es lo que permite que funcione en Brave/incógnito y que
 * las rutas `/api/ia/*` puedan leer `tokenAcceso`.
 *
 * En servidor (SSR) una URL relativa no sirve para `fetch`, así que se usa el
 * backend absoluto.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/backend";
const SSR_BASE = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export const BASE_URL = typeof window === "undefined" ? SSR_BASE : API_BASE;

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
