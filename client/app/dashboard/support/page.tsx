"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, ChevronDown, MessageSquare, Loader2, Clock, AlertCircle, ChevronsUpDown, SlidersHorizontal } from "lucide-react";

interface SupportCase {
  _id: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
  updatedAt: string;
}

export default function SupportCasesPage() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/support`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCases(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewCase = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "New Support Case", severity: "medium" })
      });
      if (res.ok) {
        const newCase = await res.json();
        router.push(`/dashboard/support/${newCase._id}`);
      }
    } catch (err) {
      console.error(err);
      setIsCreating(false);
    }
  };
  return (
    <div className="flex flex-col h-full w-full bg-[#000000] text-zinc-200">
      {/* Toolbar */}
      <div className="px-8 py-6 flex flex-col gap-4 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search cases..."
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-md py-1.5 pl-9 pr-4 text-[14px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/20 transition-all"
            />
          </div>
          
          {/* Sort Button */}
          <button className="flex items-center justify-center w-[34px] h-[34px] bg-[#0a0a0a] border border-white/10 rounded-md hover:bg-[#141414] transition-colors shrink-0">
             <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
          </button>

          {/* New Case Button */}
          <button
            onClick={createNewCase}
            disabled={isCreating}
            className="flex items-center gap-2 bg-[#0a0a0a] border border-white/10 hover:border-white/20 hover:bg-[#141414] text-white px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors shrink-0 disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            New Case
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-1">
          <button className="flex items-center gap-2 bg-[#0a0a0a] border border-white/10 px-3 py-1 rounded-full text-[13px] text-zinc-400 hover:text-zinc-200 hover:bg-[#141414] transition-colors">
            All Statuses
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button className="flex items-center gap-2 bg-[#0a0a0a] border border-white/10 px-3 py-1 rounded-full text-[13px] text-zinc-400 hover:text-zinc-200 hover:bg-[#141414] transition-colors">
            All Severities
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Area */}
        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
          </div>
        ) : cases.length === 0 ? (
          <div className="mt-4 border border-white/10 bg-transparent rounded-xl flex flex-col items-center justify-center py-40 px-4">
            <div className="w-10 h-10 border border-white/10 rounded-xl flex items-center justify-center mb-5">
              <MessageSquare className="w-4 h-4 text-zinc-400" />
            </div>
            <h2 className="text-[15px] font-semibold text-white mb-1.5 tracking-tight">No Cases</h2>
            <p className="text-[14px] text-zinc-500 mb-6 text-center">
              Create a new case to get assistance.
            </p>
            <button
              onClick={createNewCase}
              disabled={isCreating}
              className="flex items-center gap-2 bg-transparent border border-white/10 hover:border-white/20 hover:bg-[#141414] text-white px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              New Case
            </button>
          </div>
        ) : (
          <div className="mt-4 border border-white/5 bg-[#050505] rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-[#0a0a0a]">
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Case</th>
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Status</th>
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Severity</th>
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {cases.map((c) => (
                  <tr key={c._id} className="hover:bg-[#0a0a0a] transition-colors group cursor-pointer" onClick={() => router.push(`/dashboard/support/${c._id}`)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                        <span className="text-[14px] font-medium text-zinc-200">{c.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-300 capitalize border border-zinc-700">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 capitalize">
                        {c.severity === 'high' || c.severity === 'critical' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-zinc-500" />
                        )}
                        {c.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-[13px] text-zinc-500">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(c.updatedAt).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
