import React from 'react';
    export const Dialog = ({ open, onOpenChange, children }) => {
      if (!open) return null;
      return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="relative z-50 w-full max-w-lg">
            {children}
          </div>
        </div>
      );
    };
    export const DialogTrigger = ({ children, asChild }) => <>{children}</>;
    export const DialogContent = ({ children, className }) => (
      <div className={`bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl p-6 ${className || ''}`}>
        {children}
      </div>
    );
    export const DialogHeader = ({ children, className }) => <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className || ''}`}>{children}</div>;
    export const DialogTitle = ({ children, className }) => <h2 className={`text-lg font-semibold leading-none tracking-tight text-white ${className || ''}`}>{children}</h2>;