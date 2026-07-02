import React, { ReactNode } from 'react';

export const SelectContext = React.createContext<any>(null);

export const Select = ({ value, onValueChange, children, disabled }: { value?: any, onValueChange?: any, children?: ReactNode, disabled?: boolean }) => {
  return <SelectContext.Provider value={{ value, onValueChange, disabled }}>
    <div className={`relative inline-block w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>{children}</div>
  </SelectContext.Provider>;
};

export const SelectTrigger = ({ children, className }: { children?: ReactNode, className?: string }) => {
  return <div className={`flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none ${className || ''}`}>{children}</div>;
};

export const SelectValue = ({ placeholder }: { placeholder?: string }) => {
  const { value } = React.useContext(SelectContext) || {};
  return <span>{value || placeholder || 'Select...'}</span>;
};

export const SelectContent = ({ children, className }: { children?: ReactNode, className?: string }) => {
  const { value, onValueChange, disabled } = React.useContext(SelectContext) || {};
  return (
    <select 
      value={value} 
      onChange={e => onValueChange && onValueChange(e.target.value)}
      disabled={disabled}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
    >
      {React.Children.map(children, child => child)}
    </select>
  );
};

export const SelectItem = ({ value, children }: { value: any, children: ReactNode }) => {
  return <option value={value}>{children}</option>;
};