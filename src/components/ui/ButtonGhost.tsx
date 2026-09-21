import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonGhostProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export default function ButtonGhost({
  children,
  className = "",
  ...props
}: ButtonGhostProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 border border-primary-container text-primary-container font-semibold transition-colors duration-200 hover:bg-primary-container/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-container cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
