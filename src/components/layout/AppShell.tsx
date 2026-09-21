"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderTree, Menu, Plus, X } from "lucide-react";
import Sidebar, {
  type SidebarNavItem,
  type SidebarProfile,
} from "./Sidebar";

interface AppShellProps {
  children: React.ReactNode;
  brandLabel?: string;
  items?: SidebarNavItem[];
  footerItems?: SidebarNavItem[];
  cta?: SidebarNavItem;
  ctaMobile?: SidebarNavItem;
  profile?: SidebarProfile;
  activeHref?: string;
}

export default function AppShell({
  children,
  brandLabel,
  items = [],
  footerItems = [],
  cta,
  ctaMobile,
  profile,
  activeHref,
}: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = activeHref ?? pathname;

  const closeMenu = () => setMenuOpen(false);

  const runAction = (item: SidebarNavItem, close = true) => {
    if (item.onClick) item.onClick();
    if (close) closeMenu();
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <Sidebar
        brandLabel={brandLabel}
        items={items}
        footerItems={footerItems}
        cta={cta}
        profile={profile}
        activeHref={active}
      />

      {/* Mobile Top Nav */}
      <nav className="fixed top-0 z-50 flex h-14 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin shadow-sm md:hidden">
        <Link
          href="/"
          className="flex items-center gap-3"
          onClick={closeMenu}
        >
          <FolderTree className="text-2xl text-primary" data-weight="fill" />
          <span className="text-headline-md font-bold text-on-surface">
            Diagramador
          </span>
        </Link>
        <button
          className="text-on-surface-variant transition-colors hover:text-primary"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menú"
        >
          {menuOpen ? (
            <X className="text-2xl" />
          ) : (
            <Menu className="text-2xl" />
          )}
        </button>
      </nav>

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 md:hidden ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
          onClick={closeMenu}
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-72 flex-col border-r border-outline-variant bg-surface-container-low py-margin transition-transform duration-300 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {profile && (
            <div className="mb-6 flex items-center gap-3 px-margin">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container font-class-name text-class-name text-on-primary-container">
                {profile.initials}
              </div>
              <div className="flex flex-col">
                <span className="font-class-name text-class-name text-on-surface">
                  {profile.name}
                </span>
                <span className="font-code-sm text-code-sm text-on-surface-variant">
                  {profile.role}
                </span>
              </div>
            </div>
          )}

          <nav className="flex flex-1 flex-col gap-2 px-4">
            {items.map((item, i) => {
              const isActive = item.href === active;
              const Icon = item.icon;
              return (
                <div key={item.label + i}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      className={`flex items-center gap-4 rounded-lg py-3 px-4 transition-all duration-200 ${
                        isActive
                          ? "bg-surface-variant font-bold text-primary"
                          : "text-on-surface-variant hover:bg-surface-variant hover:text-primary"
                      }`}
                    >
                      {Icon && <Icon className="h-5 w-5" />}
                      <span className="font-class-name text-class-name">
                        {item.label}
                      </span>
                    </Link>
                  ) : (
                    <span
                      onClick={() => runAction(item)}
                      className={`flex cursor-pointer items-center gap-4 rounded-lg py-3 px-4 transition-all duration-200 ${
                        item.danger
                          ? "text-on-surface-variant hover:bg-surface-variant hover:text-error"
                          : "text-on-surface-variant hover:bg-surface-variant hover:text-primary"
                      }`}
                    >
                      {Icon && <Icon className="h-5 w-5" />}
                      <span className="font-class-name text-class-name">
                        {item.label}
                      </span>
                    </span>
                  )}
                </div>
              );
            })}

            {footerItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={item.label + i} className="mt-2">
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      className={`flex items-center gap-4 rounded-lg py-3 px-4 transition-all duration-200 ${
                        item.danger
                          ? "text-on-surface-variant hover:bg-surface-variant hover:text-error"
                          : "text-on-surface-variant hover:bg-surface-variant hover:text-primary"
                      }`}
                    >
                      {Icon && <Icon className="h-5 w-5" />}
                      <span className="font-class-name text-class-name">
                        {item.label}
                      </span>
                    </Link>
                  ) : (
                    <span
                      onClick={() => runAction(item)}
                      className={`flex cursor-pointer items-center gap-4 rounded-lg py-3 px-4 transition-all duration-200 ${
                        item.danger
                          ? "text-on-surface-variant hover:bg-surface-variant hover:text-error"
                          : "text-on-surface-variant hover:bg-surface-variant hover:text-primary"
                      }`}
                    >
                      {Icon && <Icon className="h-5 w-5" />}
                      <span className="font-class-name text-class-name">
                        {item.label}
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </nav>

          {cta && (
            <div className="mt-6 px-margin" onClick={() => runAction(cta)}>
              <div className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-3 font-class-name text-class-name text-on-primary shadow-sm transition-all hover:shadow-md active:scale-95">
                {cta.icon && <cta.icon className="h-[18px] w-[18px]" />}
                {cta.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main */}
      <main className="flex h-full flex-1 flex-col overflow-y-auto bg-surface pt-14 md:pt-0 no-scrollbar">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 z-50 flex h-16 w-full items-stretch justify-around border-t border-outline-variant bg-surface-container-lowest md:hidden">
        {items.map((item, i) => {
          const isActive = item.href === active;
          const Icon = item.icon;
          if (!item.href) return null;
          return (
            <Link
              key={item.label + i}
              href={item.href}
              className={`flex w-full flex-col items-center justify-center ${
                isActive ? "text-primary" : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {Icon && <Icon className="mb-0.5 h-5 w-5" />}
              <span className="font-class-name text-[10px] font-bold">
                {item.label}
              </span>
            </Link>
          );
        })}

        {ctaMobile && (
          <div className="relative -top-4 flex w-full flex-col items-center justify-center">
            <button
              onClick={() => runAction(ctaMobile, true)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-md transition-all hover:scale-105 active:scale-95"
              aria-label={ctaMobile.label}
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>
        )}

        {profile && (
          <Link
            href="/proyectos"
            onClick={closeMenu}
            className="flex w-full flex-col items-center justify-center text-on-surface-variant hover:text-primary"
            title={profile.name}
          >
            <span className="mb-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-container text-[9px] font-bold text-on-primary-container">
              {profile.initials}
            </span>
            <span className="font-class-name text-[10px]">Perfil</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
