import React from 'react';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  return (
    <input ref={ref} className={`flex h-10 w-full rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 ${className || ''}`} {...props} />
  );
});
Input.displayName = "Input";