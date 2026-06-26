import React from 'react';
    export const Textarea = React.forwardRef(({ className, ...props }, ref) => {
      return <textarea className={`flex min-h-[80px] w-full rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 ${className || ''}`} ref={ref} {...props} />;
    });
    Textarea.displayName = "Textarea";