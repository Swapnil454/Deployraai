import React from 'react';
export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={`rounded-xl border border-zinc-800 bg-[#0a0a0a] text-zinc-100 shadow-sm ${className || ''}`} {...props} />;
export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={`flex flex-col space-y-1.5 p-6 border-b border-zinc-800/60 ${className || ''}`} {...props} />;
export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={`text-lg font-semibold leading-none tracking-tight text-white ${className || ''}`} {...props} />;
export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={`text-sm text-zinc-400 ${className || ''}`} {...props} />;
export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={`p-6 pt-0 ${className || ''}`} {...props} />;
export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={`flex items-center p-6 pt-0 bg-zinc-900/20 ${className || ''}`} {...props} />;