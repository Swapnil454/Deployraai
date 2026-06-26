import React from 'react';
    export const Input = React.forwardRef(({ className, type, ...props }, ref) => {
      return <input type={type} className={`flex h-10 w-full rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 ${className || ''}`} ref={ref} {...props} />;
    });
    Input.displayName = "Input";