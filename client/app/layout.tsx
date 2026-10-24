import type { Metadata } from "next";
import "./globals.css";
import 'rrweb-player/dist/style.css';
import Header from "./components/Header";
import { Toaster } from 'sonner';
import { DM_Sans, Outfit, Plus_Jakarta_Sans, Newsreader } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-dm-sans',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-outfit',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-jakarta',
});

const serifDisplay = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif-display',
});

export const metadata: Metadata = {
  title: "DeployAI - Automate Your Deployments",
  description: "AI agent that automates your deployment process.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased dark ${dmSans.variable} ${outfit.variable} ${jakarta.variable} ${serifDisplay.variable} font-sans`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[#111111] text-white selection:bg-indigo-500 selection:text-white">
        <Header />
        {children}
        <Toaster 
          theme="dark" 
          position="top-right" 
          duration={3000} 
          toastOptions={{
            classNames: {
              error: '!bg-red-500 !text-white !border-red-600',
              success: '!bg-green-500 !text-white !border-green-600',
            }
          }}
        />
      </body>
    </html>
  );
}
