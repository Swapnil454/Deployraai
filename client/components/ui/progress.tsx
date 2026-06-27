import React from 'react';
export const Progress = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value?: number, indicatorClassName?: string }>(({ className, indicatorClassName, value, ...props }, ref) => {
  return (
    <div ref={ref} className={`relative h-2 w-full overflow-hidden rounded-full bg-zinc-800 ${className || ''}`} {...props}>
      <div className={`h-full w-full flex-1 bg-white transition-all ${indicatorClassName || ''}`} style={{ transform: `translateX(-${100 - (value || 0)}%)` }} />
    </div>
  );
});
Progress.displayName = "Progress";