import React from 'react';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => {
  return (
    <textarea ref={ref} className={`flex min-h-[80px] w-full rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 ${className || ''}`} {...props} />
  );
});
Textarea.displayName = "Textarea";