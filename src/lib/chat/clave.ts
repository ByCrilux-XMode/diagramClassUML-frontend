/** Clave de idempotencia de un envío. Un reintento con la misma clave no duplica. */
export function nuevaClave(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
