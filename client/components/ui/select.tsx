// import React, { ReactNode } from 'react';

// export const SelectContext = React.createContext<any>(null);

// export const Select = ({ value, onValueChange, children, disabled }: { value?: any, onValueChange?: any, children?: ReactNode, disabled?: boolean }) => {
//   return <SelectContext.Provider value={{ value, onValueChange, disabled }}>
//     <div className={`relative inline-block w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>{children}</div>
//   </SelectContext.Provider>;
// };

// export const SelectTrigger = ({ children, className }: { children?: ReactNode, className?: string }) => {
//   return <div className={`flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none ${className || ''}`}>{children}</div>;
// };

// export const SelectValue = ({ placeholder }: { placeholder?: string }) => {
//   const { value } = React.useContext(SelectContext) || {};
//   return <span>{value || placeholder || 'Select...'}</span>;
// };

// export const SelectContent = ({ children, className }: { children?: ReactNode, className?: string }) => {
//   const { value, onValueChange, disabled } = React.useContext(SelectContext) || {};
//   return (
//     <select 
//       value={value} 
//       onChange={e => onValueChange && onValueChange(e.target.value)}
//       disabled={disabled}
//       className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
//     >
//       {React.Children.map(children, child => child)}
//     </select>
//   );
// };

// export const SelectItem = ({ value, children }: { value: any, children: ReactNode }) => {
//   return <option value={value}>{children}</option>;
// };



import React, { ReactNode, useEffect, useRef, useState } from 'react';

type SelectContextValue = {
  value?: any;
  onValueChange?: (value: any) => void;
  disabled?: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<any>;
};

export const SelectContext = React.createContext<SelectContextValue | null>(null);

export const Select = ({
  value,
  onValueChange,
  children,
  disabled,
}: {
  value?: any;
  onValueChange?: any;
  children?: ReactNode;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <SelectContext.Provider value={{ value, onValueChange, disabled, open, setOpen, triggerRef }}>
      <div
        ref={containerRef}
        className={`relative inline-block w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        {children}
      </div>
    </SelectContext.Provider>
  );
};

export const SelectTrigger = ({ children, className }: { children?: ReactNode; className?: string }) => {
  const ctx = React.useContext(SelectContext);
  return (
    <div
      ref={ctx?.triggerRef}
      role="button"
      tabIndex={0}
      onClick={() => ctx?.setOpen(!ctx.open)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ctx?.setOpen(!ctx.open);
        }
      }}
      className={`flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-600 ${className || ''}`}
    >
      {children}
      <svg
        className={`ml-2 h-4 w-4 shrink-0 text-zinc-500 transition-transform ${ctx?.open ? 'rotate-180' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const SelectValue = ({ placeholder }: { placeholder?: string }) => {
  const ctx = React.useContext(SelectContext);
  const label = ctx?.value ?? placeholder ?? 'Select...';
  return <span className="truncate">{label}</span>;
};

export const SelectContent = ({ children, className }: { children?: ReactNode; className?: string }) => {
  const ctx = React.useContext(SelectContext);
  if (!ctx?.open) return null;

  return (
    <div
      className={`absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-1 shadow-lg shadow-black/40 ${className || ''}`}
    >
      {React.Children.map(children, (child) => child)}
    </div>
  );
};

export const SelectItem = ({
  value,
  children,
  className,
}: {
  value: any;
  children: ReactNode;
  className?: string;
}) => {
  const ctx = React.useContext(SelectContext);
  const selected = ctx?.value === value;

  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={() => {
        ctx?.onValueChange?.(value);
        ctx?.setOpen(false);
      }}
      className={`flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 ${
        selected ? 'bg-zinc-800' : ''
      } ${className || ''}`}
    >
      {children}
    </div>
  );
};