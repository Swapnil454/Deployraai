"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";

const SIDEBAR_ITEMS = [
  { name: "Projects", path: "/dashboard/projects" },
  { name: "Deployments", path: "" }, // Folder
  { name: "Logs", path: "/dashboard/logs" },
  { name: "Analytics", path: "/dashboard/analytics" },
  { name: "Domains", path: "/dashboard/domains" },
  { name: "Usages", path: "/dashboard/usages" },
  { name: "Workflows", path: "/dashboard/workflows" },
  { name: "Support", path: "/dashboard/support" },
  { name: "Settings", path: "/dashboard/settings" }
];

const DEPLOYMENT_SUBPAGES = [
  { name: "Frontend", path: "/dashboard/deployments/frontend" },
  { name: "Backend", path: "/dashboard/deployments/backend" },
  { name: "Fullstack", path: "/dashboard/deployments/fullstack" }
];

export const Sidebar = ({ user }: { user: any }) => {
  const pathname = usePathname() || "";
  const router = useRouter();
  
  // Keep accordion open if we are inside a deployment subpage
  const isDeploymentsActive = pathname.startsWith("/dashboard/deployments");
  const [isDeploymentsExpanded, setIsDeploymentsExpanded] = useState(isDeploymentsActive);

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
      router.push("/");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <aside className="w-64 border-r border-zinc-800 bg-black flex flex-col pt-6 pb-6 hidden md:flex shrink-0 h-screen sticky top-0 z-30">
      <div className="px-4 mb-8">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-900 cursor-pointer transition-colors">
          {user?.avatar ? (
            <Image src={user.avatar} alt="Avatar" width={24} height={24} className="rounded-full" />
          ) : (
            <div className="h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
          )}
          <span className="text-sm font-medium">{user?.githubUsername || user?.name}&apos;s projects</span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-0.5">
        {SIDEBAR_ITEMS.map((item) => {
          if (item.name === "Deployments") {
            return (
              <div key={item.name}>
                <button
                  onClick={() => setIsDeploymentsExpanded(!isDeploymentsExpanded)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-md transition-colors ${
                    isDeploymentsActive
                      ? 'bg-zinc-800/50 text-white font-medium' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                  }`}
                >
                  <span>{item.name}</span>
                  <ChevronsUpDown className={`h-3 w-3 text-zinc-500 transition-transform ${isDeploymentsExpanded ? 'rotate-180' : ''}`} />
                </button>
                
                {isDeploymentsExpanded && (
                  <div className="flex flex-col ml-3 pl-3 border-l border-zinc-800/60 mt-1 mb-2 space-y-0.5">
                    {DEPLOYMENT_SUBPAGES.map(sub => {
                      const isActive = pathname === sub.path;
                      return (
                        <Link
                          key={sub.name}
                          href={sub.path}
                          className={`w-full flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${
                            isActive 
                              ? 'bg-zinc-800/80 text-white font-medium' 
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                          }`}
                        >
                          {sub.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = pathname.startsWith(item.path);
          return (
            <Link
              key={item.name}
              href={item.path}
              className={`w-full flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${
                isActive 
                  ? 'bg-zinc-800/50 text-white font-medium' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Profile at Bottom */}
      <div className="px-4 mt-auto border-t border-zinc-800 pt-4">
        <div className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-zinc-900 cursor-pointer transition-colors">
          <div className="flex items-center gap-2 truncate">
            {user?.avatar ? (
              <Image src={user.avatar} alt="Avatar" width={32} height={32} className="rounded-full shrink-0" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-indigo-500 shrink-0 flex items-center justify-center text-sm font-bold">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-white truncate">{user?.name}</span>
              <span className="text-xs text-zinc-500 truncate">{user?.email}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="p-1.5 text-zinc-500 hover:text-white shrink-0">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
