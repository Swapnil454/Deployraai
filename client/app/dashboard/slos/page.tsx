"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Target } from 'lucide-react';

export default function SLODashboardRoot() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasProjects, setHasProjects] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/projects`, { credentials: "include" });
        if (res.ok) {
          const projects = await res.json();
          if (projects.length > 0) {
            router.push(`/dashboard/slos/${projects[0]._id}`);
            return;
          } else {
            setHasProjects(false);
          }
        }
      } catch (err) {
        console.error("Failed to load projects", err);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto text-white flex flex-col items-center justify-center h-[60vh]">
      <Target className="w-16 h-16 text-zinc-700 mb-6" />
      <h1 className="text-2xl font-bold mb-2">No Projects Found</h1>
      <p className="text-zinc-400 max-w-md text-center">
        You need to create a project before you can define Service Level Objectives (SLOs).
      </p>
    </div>
  );
}
