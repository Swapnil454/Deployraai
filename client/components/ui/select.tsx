import React from 'react';

export const SelectContext = React.createContext(null);

export const Select = ({ value, onValueChange, children }) => {
  return <SelectContext.Provider value={{ value, onValueChange }}>
    <div className="relative inline-block w-full">{children}</div>
  </SelectContext.Provider>;
};

export const SelectTrigger = ({ children, className }) => {
  return <div className={`flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none ${className || ''}`}>{children}</div>;
};

export const SelectValue = ({ placeholder }) => {
  const { value } = React.useContext(SelectContext) || {};
  return <span>{value || placeholder || 'Select...'}</span>;
};

export const SelectContent = ({ children, className }) => {
  const { value, onValueChange } = React.useContext(SelectContext) || {};
  return (
    <select 
      value={value} 
      onChange={e => onValueChange(e.target.value)}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    >
      {React.Children.map(children, child => child)}
    </select>
  );
};

export const SelectItem = ({ value, children }) => {
  return <option value={value}>{children}</option>;
};