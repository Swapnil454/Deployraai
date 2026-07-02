import React from 'react';
export const Switch = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { checked?: boolean, onCheckedChange?: (checked: boolean) => void }>(({ className, checked, onCheckedChange, ...props }, ref) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      ref={ref}
      className={`peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-indigo-500' : 'bg-zinc-800'} ${className || ''}`}
      {...props}
    >
      <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
});
Switch.displayName = "Switch";