import React, { ReactElement, ReactNode, createContext, useContext } from 'react';

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export const Dialog = ({ open = false, onOpenChange, children }: { open?: boolean, onOpenChange?: (open: boolean) => void, children?: ReactNode }) => (
  <DialogContext.Provider value={{ open, setOpen: (nextOpen) => onOpenChange?.(nextOpen) }}>
    {children}
  </DialogContext.Provider>
);

export const DialogTrigger = ({ children }: { children?: ReactNode, asChild?: boolean }) => {
  const dialog = useContext(DialogContext);

  if (!React.isValidElement(children)) return <>{children}</>;

  const child = children as ReactElement<{ onClick?: React.MouseEventHandler }>;
  return React.cloneElement(child, {
    onClick: (event) => {
      child.props.onClick?.(event);
      if (!event.defaultPrevented) dialog?.setOpen(true);
    },
  });
};

export const DialogContent = ({ children, className }: { children?: ReactNode, className?: string }) => {
  const dialog = useContext(DialogContext);

  if (!dialog?.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onMouseDown={() => dialog.setOpen(false)}
    >
      <div
        className={`relative z-50 w-full max-w-lg bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl p-6 ${className || ''}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
export const DialogHeader = ({ children, className }: { children?: ReactNode, className?: string }) => <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className || ''}`}>{children}</div>;
export const DialogTitle = ({ children, className }: { children?: ReactNode, className?: string }) => <h2 className={`text-lg font-semibold leading-none tracking-tight text-white ${className || ''}`}>{children}</h2>;
