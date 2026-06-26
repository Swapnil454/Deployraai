import React from 'react';
    export const Switch = React.forwardRef(({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
      return (
        <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange?.(!checked)} ref={ref}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-white' : 'bg-zinc-800'} ${className || ''}`} {...props}>
          <span className={`pointer-events-none block h-4 w-4 rounded-full bg-black shadow-lg ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      );
    });
    Switch.displayName = "Switch";