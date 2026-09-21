"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { FolderTree } from "lucide-react";

export interface SidebarNavItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
  badge?: number | string;
  onClick?: () => void;
  danger?: boolean;
}

export interface SidebarProfile {
  initials: string;
  name: string;
  role: string;
}

interface SidebarProps {
  brandLabel?: string;
  items?: SidebarNavItem[];
  footerItems?: SidebarNavItem[];
  cta?: SidebarNavItem;
  profile?: SidebarProfile;
  activeHref?: string;
}

export default function Sidebar({
  brandLabel = "Project Workspace",
  items = [],
  footerItems = [],
  cta,
  profile,
  activeHref,
}: SidebarProps) {
  const pathname = usePathname();
  const active = activeHref ?? pathname;

  return (
    <aside className="hidden md:flex h-full w-80 shrink-0 flex-col border-r border-outline-variant bg-surface-container-low py-margin transition-all z-40">
      {/* Brand */}
      <div className="mb-8 flex flex-col gap-2 px-margin">
        <div className="mb-2 flex cursor-pointer items-center gap-3 text-primary transition-colors hover:text-primary-container">
          <FolderTree className="h-8 w-8" data-weight="fill" />
          <span className="text-headline-md font-bold tracking-tight">
            {brandLabel}
          </span>
        </div>

        {profile && (
          <div className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant/30 bg-surface p-3 transition-colors hover:bg-surface-variant">
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
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-2 px-4">
        {items.map((item, i) => {
          const isActive = item.href === active;
          const Icon = item.icon;
          return (
            <div key={item.label + i} onClick={item.onClick}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={`flex items-center ${
                    item.badge !== undefined ? "justify-between" : "gap-4"
                  } ${
                    isActive
                      ? "translate-x-1 border-l-4 border-primary bg-surface-variant font-bold text-primary shadow-sm transition-all duration-200"
                      : "border-l-4 border-transparent pl-4 text-on-surface-variant transition-all duration-200 hover:bg-surface-variant hover:text-primary"
                  } rounded-lg py-3 px-4`}
                >
                  <div className="flex items-center gap-4">
                    {Icon && <Icon className="h-5 w-5" />}
                    <span className="font-class-name text-class-name">
                      {item.label}
                    </span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="rounded-full border border-outline-variant/50 bg-surface-variant px-2 py-0.5 font-badge-label text-badge-label text-on-surface-variant">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ) : (
                <span
                  className={`flex cursor-pointer items-center gap-4 rounded-lg border-l-4 py-3 px-4 transition-all duration-200 ${
                    item.danger
                      ? "border-transparent text-on-surface-variant hover:bg-surface-variant hover:text-error"
                      : "border-transparent text-on-surface-variant hover:bg-surface-variant hover:text-primary"
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

        {footerItems.length > 0 && (
          <div className="my-4 border-t border-outline-variant/50" />
        )}

        {footerItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={item.label + i} onClick={item.onClick}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={`flex items-center gap-4 rounded-lg border-l-4 border-transparent py-3 px-4 transition-all duration-200 ${
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
                  className={`flex cursor-pointer items-center gap-4 rounded-lg border-l-4 border-transparent py-3 px-4 transition-all duration-200 ${
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

      {/* CTA */}
      {cta && (
        <div className="mt-6 px-margin" onClick={cta.onClick}>
          <div
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent py-3 font-class-name text-class-name shadow-sm transition-all hover:shadow-md active:scale-95 ${
              cta.danger
                ? "bg-on-surface-variant text-on-primary hover:bg-error"
                : "bg-primary text-on-primary hover:bg-on-primary-container"
            }`}
          >
            {cta.icon && <cta.icon className="h-[18px] w-[18px]" />}
            {cta.label}
          </div>
        </div>
      )}
    </aside>
  );
}
