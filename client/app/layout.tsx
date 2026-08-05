import type { Metadata } from "next";
import "./globals.css";
import 'rrweb-player/dist/style.css';
import Header from "./components/Header";
import { Toaster } from 'sonner';

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
      className="h-full antialiased dark"
    >
      <body className="min-h-full flex flex-col bg-black text-white selection:bg-indigo-500 selection:text-white">
        <Header />
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
