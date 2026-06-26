import React from 'react';
    export const Progress = React.forwardRef(({ className, value, ...props }, ref) => {
      return (
        <div ref={ref} className={`relative h-4 w-full overflow-hidden rounded-full bg-zinc-800 ${className || ''}`} {...props}>
          <div className="h-full w-full flex-1 bg-white transition-all" style={{ transform: `translateX(-${100 - (value || 0)}%)` }} />
        </div>
      );
    });
    Progress.displayName = "Progress";