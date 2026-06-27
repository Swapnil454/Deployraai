import React from 'react';
    export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>(({ className, variant = 'default', size = 'default', ...props }, ref) => {
      let base = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none ring-offset-background";
      let variants: Record<string, string> = {
        default: "bg-white text-black hover:bg-zinc-200",
        destructive: "bg-red-500 text-white hover:bg-red-600",
        outline: "border border-zinc-800 hover:bg-zinc-800 text-zinc-300",
        secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-800/80",
        ghost: "hover:bg-zinc-800 hover:text-zinc-100 text-zinc-400",
        link: "underline-offset-4 hover:underline text-primary",
      };
      let sizes: Record<string, string> = {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      };
      const v = variants[variant] || variants.default;
      const s = sizes[size] || sizes.default;
      return <button ref={ref} className={`${base} ${v} ${s} ${className || ''}`} {...props} />;
    });
    Button.displayName = "Button";