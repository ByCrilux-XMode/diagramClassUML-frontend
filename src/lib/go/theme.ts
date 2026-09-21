/* Token de color (espejo de @theme en globals.css) y fuentes reales del documento.
   GoJS pinta su propio <canvas>, así que las familias deben resolverse en runtime
   desde las CSS variables que expone next/font (nombre de familia generado). */

export const INK = "#1c1b1a";
export const SURFACE = "#fdf9f5";
export const SURFACE_DIM = "#ddd9d6";
export const SURFACE_CONTAINER = "#f1edea";
export const SURFACE_CONTAINER_LOW = "#f7f3ef";
export const SURFACE_CONTAINER_LOWEST = "#ffffff";
export const SURFACE_VARIANT_BG = "#e6e2de";
export const SURFACE_VARIANT_TEXT = "#3c494c";
export const PRIMARY = "#006877";
export const OUTLINE = "#6c797d";
export const OUTLINE_VARIANT = "#bbc9cd";
export const SHADOW = "rgba(28, 27, 26, 0.12)";

interface Fonts {
  sans: string;
  mono: string;
}

let cachedFonts: Fonts | null = null;

function resolveFamilies(): Fonts {
  if (cachedFonts) return cachedFonts;
  if (typeof document === "undefined") {
    cachedFonts = { sans: '"IBM Plex Sans"', mono: '"IBM Plex Mono"' };
    return cachedFonts;
  }
  const styles = getComputedStyle(document.documentElement);
  const firstFamily = (raw: string, fallback: string) => {
    const trimmed = raw
      .split(",")[0]
      .trim()
      .replace(/^['"]+|['"]+$/g, "");
    return trimmed ? `"${trimmed}"` : fallback;
  };
  cachedFonts = {
    sans: firstFamily(
      styles.getPropertyValue("--font-plex-sans"),
      '"IBM Plex Sans"'
    ),
    mono: firstFamily(
      styles.getPropertyValue("--font-plex-mono"),
      '"IBM Plex Mono"'
    ),
  };
  return cachedFonts;
}

export function fontSans(
  size: string,
  weight = "400",
  style?: string
): string {
  const parts = [style, weight, size].filter(Boolean).join(" ");
  return `${parts} ${resolveFamilies().sans}`;
}

export function fontMono(
  size: string,
  weight = "400",
  style?: string
): string {
  const parts = [style, weight, size].filter(Boolean).join(" ");
  return `${parts} ${resolveFamilies().mono}`;
}