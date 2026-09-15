"use client";

import Link from "next/link";
import { Bot, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function Header() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/auth/me`, {
          credentials: "include"
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        // Silently fail if not logged in
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
      setUser(null);
      router.push("/");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-black/50 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">DeployAI</span>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-zinc-800 hover:border-zinc-500"
              >
                <LogOut className="h-4 w-4 text-zinc-400" />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Login
              </Link>
              <Link
                href="/login"
                className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition-all hover:bg-zinc-200 hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
