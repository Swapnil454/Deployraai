"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Loader2, LayoutDashboard, Users, Rocket, Bug, Activity, Server, ArrowLeft, Headset } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || '${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}'}`}/api/auth/me`, { credentials: "include" });
        if (res.ok) {
          const user = await res.json();
          if (user.role === 'admin') {
            setIsAdmin(true);
          } else {
            router.push("/dashboard");
          }
        } else {
          router.push("/login");
        }
      } catch (err) {
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    };
    checkAdmin();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const links = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/deployments", label: "Deployments", icon: Rocket },
    { href: "/admin/bug-reports", label: "Bug Reports", icon: Bug },
    { href: "/admin/monitors", label: "Monitors", icon: Activity },
    { href: "/admin/providers", label: "Providers", icon: Server },
    { href: "/admin/support", label: "Support", icon: Headset },
  ];

  return (
    <div className="flex min-h-screen bg-black">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800 bg-zinc-950 p-4 hidden md:block">
        <div className="mb-8 px-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-500">
            <Rocket className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">DeployAdmin</span>
        </div>
        
        <nav className="space-y-1">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.href} 
                href={link.href}
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 pt-8 border-t border-zinc-800">
          <Link 
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
