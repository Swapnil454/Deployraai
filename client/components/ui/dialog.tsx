import React, { ReactNode } from 'react';

export const Dialog = ({ open, onOpenChange, children }: { open?: boolean, onOpenChange?: any, children?: ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="relative z-50 w-full max-w-lg">
        {children}
      </div>
    </div>
  );
};
export const DialogTrigger = ({ children, asChild }: { children?: ReactNode, asChild?: boolean }) => <>{children}</>;
export const DialogContent = ({ children, className }: { children?: ReactNode, className?: string }) => (
  <div className={`bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl p-6 ${className || ''}`}>
    {children}
  </div>
);
export const DialogHeader = ({ children, className }: { children?: ReactNode, className?: string }) => <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className || ''}`}>{children}</div>;
export const DialogTitle = ({ children, className }: { children?: ReactNode, className?: string }) => <h2 className={`text-lg font-semibold leading-none tracking-tight text-white ${className || ''}`}>{children}</h2>;