"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, MessageSquare, Loader2, Clock, AlertCircle, ShieldAlert } from "lucide-react";
import { io } from "socket.io-client";

interface SupportCase {
  _id: string;
  title: string;
  status: string;
  severity: string;
  issueType: string;
  createdAt: string;
  updatedAt: string;
  userId: {
    _id: string;
    name: string;
    email: string;
  };
}

export default function AdminSupportCasesPage() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const router = useRouter();

  // Socket connection
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const socket = io(apiUrl, { withCredentials: true });

    socket.on("admin_new_case", (newCase) => {
      // Re-fetch to ensure search/filter constraints are respected
      fetchCases();
    });

    socket.on("admin_case_updated", (updatedCase) => {
      setCases((prev) => prev.map(c => c._id === updatedCase._id ? { ...c, ...updatedCase } : c));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchCases();
    }, 400); // debounce search
    return () => clearTimeout(handler);
  }, [searchQuery, statusFilter]);

  const fetchCases = async () => {
    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (searchQuery) params.append("search", searchQuery);

      const res = await fetch(`${apiUrl}/api/support/admin/cases?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCases(data);
      } else {
        console.error("Failed to fetch admin cases, are you an admin?");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#000000] text-zinc-200">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-purple-500" />
          <span className="text-zinc-200 font-medium tracking-tight">Admin Support Portal</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-6 flex flex-col gap-4 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between gap-4">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search user tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-md py-1.5 pl-9 pr-4 text-[14px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/20 transition-all"
            />
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-2 bg-[#0a0a0a] p-1 rounded-lg border border-white/5">
            {['all', 'open', 'in-progress', 'resolved', 'closed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded-md text-[13px] capitalize font-medium transition-colors ${
                  statusFilter === status 
                    ? 'bg-zinc-800 text-white' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
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
            <h2 className="text-[15px] font-semibold text-white mb-1.5 tracking-tight">No Tickets Found</h2>
            <p className="text-[14px] text-zinc-500 mb-6 text-center">
              Try adjusting your search or filters.
            </p>
          </div>
        ) : (
          <div className="mt-4 border border-white/5 bg-[#050505] rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-[#0a0a0a]">
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">User</th>
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Case</th>
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Type</th>
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Status</th>
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Severity</th>
                  <th className="px-6 py-4 text-[13px] font-medium text-zinc-400">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {cases.map((c) => (
                  <tr 
                    key={c._id} 
                    onClick={() => router.push(`/admin/support/${c._id}`)}
                    className="hover:bg-[#0a0a0a] transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[14px] font-medium text-zinc-200">{c.userId?.name || 'Unknown'}</span>
                        <span className="text-[12px] text-zinc-500">{c.userId?.email || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[14px] text-zinc-200 group-hover:text-blue-400 transition-colors truncate max-w-[300px] block">{c.title}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[13px] text-zinc-400 capitalize">{c.issueType || 'General'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${
                          c.status === 'open' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                          c.status === 'in-progress' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          c.status === 'resolved' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          c.severity === 'critical' ? 'bg-red-500' :
                          c.severity === 'high' ? 'bg-orange-500' :
                          c.severity === 'medium' ? 'bg-yellow-500' : 'bg-zinc-500'
                        }`} />
                        <span className="text-[13px] text-zinc-400 capitalize">{c.severity}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[13px] text-zinc-400">
                        {new Date(c.updatedAt).toLocaleDateString()}
                      </span>
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
