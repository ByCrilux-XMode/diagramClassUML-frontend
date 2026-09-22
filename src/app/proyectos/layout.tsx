"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderTree, LogOut, Plus, Settings, Users } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import CreateProjectModal from "@/components/projects/CreateProjectModal";
import ExportBackendModal from "@/components/backend/ExportBackendModal";
import PageLoader from "@/components/ui/PageLoader";
import { useAuth } from "@/hooks/useAuth";
import { useHelpActions } from "@/lib/helpActions";

export default function ProyectosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const createOpen = useHelpActions((s) => s.createOpen);
  const openCreateModal = useHelpActions((s) => s.openCreateModal);
  const closeCreateModal = useHelpActions((s) => s.closeCreateModal);
  const exportTarget = useHelpActions((s) => s.exportTarget);
  const closeExportModal = useHelpActions((s) => s.closeExportModal);
  const [isExiting, setIsExiting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isLoaderFading, setIsLoaderFading] = useState(false);
  const router = useRouter();
  const { usuario, verificando, logout, cargarSesion, bumpRefresh } =
    useAuth();

  useEffect(() => {
    cargarSesion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!verificando && !usuario) {
      router.replace("/login");
    }
  }, [verificando, usuario, router]);

  if (verificando || !usuario) {
    return <PageLoader variant="dark" />;
  }

  const cerrarSesion = async () => {
    await logout();
    router.replace("/login");
  };

  const nombreCompleto = usuario?.persona?.nombre
    ? `${usuario.persona.nombre} ${usuario.persona.apellido ?? ""}`.trim()
    : usuario?.username ?? "System Architect";

  const initials = nombreCompleto
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleCloseModal = () => {
    if (isExiting || isNavigating) return;
    closeCreateModal();
  };

  const handleCreated = (proyecto: { proyectoId: number }) => {
    setIsExiting(true);
    // 1) modal se desvanece (250ms)
    setTimeout(() => {
      closeCreateModal();
      setIsExiting(false);
      setIsNavigating(true);
      bumpRefresh();
      // 2) loading visible, luego desvanece su opacidad
      setTimeout(() => {
        setIsLoaderFading(true);
        setTimeout(() => {
          router.push(`/editor/${proyecto.proyectoId}`);
        }, 250);
      }, 700);
    }, 250);
  };

  return (
    <AppShell
      profile={{
        initials: initials || "SA",
        name: nombreCompleto,
        role: "Bienvenido",
      }}
      items={[
        {
          label: "Projects",
          icon: FolderTree,
          href: "/proyectos",
        },
        /*{
          label: "En colaboración",
          icon: Users,
          href: "/proyectos/collab",
        },*/
        {
          label: "Configuration",
          icon: Settings,
          href: "/proyectos/configuracion",
        },
      ]}
      footerItems={[
        { label: "Logout", icon: LogOut, onClick: cerrarSesion, danger: true },
      ]}
      cta={{
        label: "New Project",
        icon: Plus,
        onClick: () => openCreateModal(),
      }}
      ctaMobile={{
        label: "Nuevo",
        onClick: () => openCreateModal(),
      }}
    >
      {children}
      <CreateProjectModal
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        isExiting={isExiting}
        onClose={handleCloseModal}
        onCreated={handleCreated}
      />
      <ExportBackendModal
        key={exportTarget ? `${exportTarget.proyectoId}-open` : "export-closed"}
        open={exportTarget !== null}
        onClose={closeExportModal}
        proyectoId={exportTarget?.proyectoId ?? -1}
        nombreProyecto={exportTarget?.nombre ?? ""}
      />
      {isNavigating && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-[#2b2a28] ${isLoaderFading ? "animate-fade-out" : "animate-fade-in"}`}
        >
          <div className="flex items-center gap-2 font-semibold tracking-tight text-primary-fixed">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-primary-fixed" />
            DIAGRAM-CTS
          </div>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-on-primary/25 border-t-primary-fixed" role="status" aria-label="Cargando" />
          <p className="font-code-sm text-code-sm text-on-primary">Abriendo editor...</p>
        </div>
      )}
    </AppShell>
  );
}
