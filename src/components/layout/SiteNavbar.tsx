import Link from "next/link";
import { FolderTree } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
}

interface SiteNavbarProps {
  items?: NavItem[];
  showLogin?: boolean;
}

export default function SiteNavbar({
  items = [{ label: "Login", href: "/login" }],
}: SiteNavbarProps) {
  return (
    <header className="sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin">
      <Link
        href="/"
        className="flex items-center gap-2 font-semibold tracking-tight text-on-surface"
      >
        <FolderTree className="h-5 w-5 text-primary-container" />
        DIAGRAM-CTS
      </Link>

      <nav className="flex items-center gap-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="border border-primary-container px-5 py-2 font-medium text-primary-container transition-colors duration-200 hover:bg-primary-container/10"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
