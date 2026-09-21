import type { InputHTMLAttributes } from "react";

type InputFlatProps = InputHTMLAttributes<HTMLInputElement>;

export default function InputFlat({ className = "", ...props }: InputFlatProps) {
  return (
    <input
      className={`w-full bg-transparent border-0 border-b border-outline hover:border-primary focus:border-primary focus:ring-0 px-0 py-2 font-sans text-on-surface placeholder:text-on-surface-variant transition-colors duration-200 outline-none ${className}`}
      {...props}
    />
  );
}
