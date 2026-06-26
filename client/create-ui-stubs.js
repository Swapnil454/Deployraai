const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, 'components', 'ui');
if (!fs.existsSync(uiDir)) {
  fs.mkdirSync(uiDir, { recursive: true });
}

const files = {
  'button.tsx': `
    import React from 'react';
    export const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
      let base = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none ring-offset-background";
      let variants = {
        default: "bg-white text-black hover:bg-zinc-200",
        destructive: "bg-red-500 text-white hover:bg-red-600",
        outline: "border border-zinc-800 hover:bg-zinc-800 text-zinc-300",
        secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-800/80",
        ghost: "hover:bg-zinc-800 hover:text-zinc-100 text-zinc-400",
        link: "underline-offset-4 hover:underline text-primary",
      };
      let sizes = {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      };
      const v = variants[variant] || variants.default;
      const s = sizes[size] || sizes.default;
      return <button ref={ref} className={\`\${base} \${v} \${s} \${className || ''}\`} {...props} />;
    });
    Button.displayName = "Button";
  `,
  'Badge.tsx': `
    import React from 'react';
    export function Badge({ className, variant, ...props }) {
      let base = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
      let variants = {
        default: "border-transparent bg-white text-black hover:bg-zinc-200",
        secondary: "border-transparent bg-zinc-800 text-zinc-100 hover:bg-zinc-800/80",
        destructive: "border-transparent bg-red-500 text-white hover:bg-red-600",
        outline: "text-zinc-300 border-zinc-800",
      };
      const v = variants[variant] || variants.default;
      return <div className={\`\${base} \${v} \${className || ''}\`} {...props} />;
    }
  `,
  'card.tsx': `
    import React from 'react';
    export const Card = ({ className, ...props }) => <div className={\`rounded-xl border border-zinc-800 bg-[#0a0a0a] text-zinc-100 shadow-sm \${className || ''}\`} {...props} />;
    export const CardHeader = ({ className, ...props }) => <div className={\`flex flex-col space-y-1.5 p-6 border-b border-zinc-800/60 \${className || ''}\`} {...props} />;
    export const CardTitle = ({ className, ...props }) => <h3 className={\`text-lg font-semibold leading-none tracking-tight text-white \${className || ''}\`} {...props} />;
    export const CardDescription = ({ className, ...props }) => <p className={\`text-sm text-zinc-400 \${className || ''}\`} {...props} />;
    export const CardContent = ({ className, ...props }) => <div className={\`p-6 pt-0 \${className || ''}\`} {...props} />;
    export const CardFooter = ({ className, ...props }) => <div className={\`flex items-center p-6 pt-0 bg-zinc-900/20 \${className || ''}\`} {...props} />;
  `,
  'input.tsx': `
    import React from 'react';
    export const Input = React.forwardRef(({ className, type, ...props }, ref) => {
      return <input type={type} className={\`flex h-10 w-full rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 \${className || ''}\`} ref={ref} {...props} />;
    });
    Input.displayName = "Input";
  `,
  'label.tsx': `
    import React from 'react';
    export const Label = React.forwardRef(({ className, ...props }, ref) => {
      return <label ref={ref} className={\`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-200 \${className || ''}\`} {...props} />;
    });
    Label.displayName = "Label";
  `,
  'textarea.tsx': `
    import React from 'react';
    export const Textarea = React.forwardRef(({ className, ...props }, ref) => {
      return <textarea className={\`flex min-h-[80px] w-full rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 \${className || ''}\`} ref={ref} {...props} />;
    });
    Textarea.displayName = "Textarea";
  `,
  'progress.tsx': `
    import React from 'react';
    export const Progress = React.forwardRef(({ className, value, ...props }, ref) => {
      return (
        <div ref={ref} className={\`relative h-4 w-full overflow-hidden rounded-full bg-zinc-800 \${className || ''}\`} {...props}>
          <div className="h-full w-full flex-1 bg-white transition-all" style={{ transform: \`translateX(-\${100 - (value || 0)}%)\` }} />
        </div>
      );
    });
    Progress.displayName = "Progress";
  `,
  'switch.tsx': `
    import React from 'react';
    export const Switch = React.forwardRef(({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
      return (
        <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange?.(!checked)} ref={ref}
          className={\`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 \${checked ? 'bg-white' : 'bg-zinc-800'} \${className || ''}\`} {...props}>
          <span className={\`pointer-events-none block h-4 w-4 rounded-full bg-black shadow-lg ring-0 transition-transform \${checked ? 'translate-x-4' : 'translate-x-0'}\`} />
        </button>
      );
    });
    Switch.displayName = "Switch";
  `,
  'dialog.tsx': `
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
      <div className={\`bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl p-6 \${className || ''}\`}>
        {children}
      </div>
    );
    export const DialogHeader = ({ children, className }) => <div className={\`flex flex-col space-y-1.5 text-center sm:text-left mb-4 \${className || ''}\`}>{children}</div>;
    export const DialogTitle = ({ children, className }) => <h2 className={\`text-lg font-semibold leading-none tracking-tight text-white \${className || ''}\`}>{children}</h2>;
  `,
  'select.tsx': `
import React from 'react';

export const SelectContext = React.createContext(null);

export const Select = ({ value, onValueChange, children }) => {
  return <SelectContext.Provider value={{ value, onValueChange }}>
    <div className="relative inline-block w-full">{children}</div>
  </SelectContext.Provider>;
};

export const SelectTrigger = ({ children, className }) => {
  return <div className={\`flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none \${className || ''}\`}>{children}</div>;
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
  `
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(uiDir, name), content.trim());
}

console.log("UI Stubs Created!");
