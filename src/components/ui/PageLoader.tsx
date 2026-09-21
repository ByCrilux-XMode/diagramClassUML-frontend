interface PageLoaderProps {
  variant?: "light" | "dark";
}

export default function PageLoader({ variant = "dark" }: PageLoaderProps) {
  const dark = variant === "dark";
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-6 min-h-screen ${
        dark ? "bg-[#2b2a28] text-on-primary" : "bg-background text-on-surface"
      }`}
    >
      <div
        className={`flex items-center gap-2 font-semibold tracking-tight ${
          dark ? "text-primary-fixed" : "text-primary"
        }`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 rounded-[2px] ${
            dark ? "bg-primary-fixed" : "bg-primary-container"
          }`}
        />
        DIAGRAM-CTS
      </div>
      <div
        className={`h-8 w-8 animate-spin rounded-full border-2 ${
          dark
            ? "border-on-primary/25 border-t-primary-fixed"
            : "border-outline-variant border-t-primary"
        }`}
        role="status"
        aria-label="Cargando"
      />
    </div>
  );
}
