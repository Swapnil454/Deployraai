import React from 'react';
    export function Badge({ className, variant, ...props }) {
      let base = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
      let variants = {
        default: "border-transparent bg-white text-black hover:bg-zinc-200",
        secondary: "border-transparent bg-zinc-800 text-zinc-100 hover:bg-zinc-800/80",
        destructive: "border-transparent bg-red-500 text-white hover:bg-red-600",
        outline: "text-zinc-300 border-zinc-800",
      };
      const v = variants[variant] || variants.default;
      return <div className={`${base} ${v} ${className || ''}`} {...props} />;
    }