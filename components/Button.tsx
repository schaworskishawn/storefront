import { ButtonHTMLAttributes } from "react";

type Variant = "outline-cyan" | "outline-cyan-strong" | "outline-pink-strong" | "solid-cyan";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  "outline-cyan":
    "border-[1.5px] border-border-accent text-border-accent bg-transparent hover:bg-border-accent/10",
  "outline-cyan-strong":
    "border-[1.5px] border-border-accent text-border-accent bg-transparent hover:bg-border-accent/10",
  "outline-pink-strong":
    "border-[1.5px] border-border-highlight text-border-highlight bg-transparent hover:bg-border-highlight/10",
  "solid-cyan": "bg-text-accent-bright text-control-bg-default hover:opacity-90",
};

export default function Button({
  variant = "outline-cyan",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`font-comic text-[14px] tracking-[1px] rounded-[12px] h-[45px] px-[24px] py-[12px] flex items-center justify-center whitespace-nowrap transition-colors ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
