import React, { ReactNode } from 'react';
export function Badge({ className, variant = "default", children, ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: string, children?: ReactNode }) {
  let base = "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  let variants: Record<string, string> = {
    default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-red-500 text-white shadow hover:bg-red-500/80",
    outline: "text-foreground",
    success: "border-transparent bg-green-500 text-white shadow hover:bg-green-500/80",
    warning: "border-transparent bg-yellow-500 text-white shadow hover:bg-yellow-500/80"
  };
  const v = variants[variant] || variants.default;
  return (
    <div className={`${base} ${v} ${className || ''}`} {...props}>
      {children}
    </div>
  );
}