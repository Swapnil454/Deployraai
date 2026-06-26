"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, ChevronDown, MessageSquare, Loader2, Clock, AlertCircle, ChevronsUpDown, SlidersHorizontal, Check } from "lucide-react";

interface SupportCase {
  _id: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
  updatedAt: string;
  userId?: any;
  description?: string;
}

export function CustomSelect({ value, onChange, options }: { value: string, onChange: (val: string) => void, options: {value: string, label: string}[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find(o => o.value === value) || options[0];
  
  return (
    <div className="relative">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-[#000] border ${isOpen ? 'border-white/20 ring-1 ring-white/10' : 'border-white/10'} rounded-md p-3 text-[13px] text-zinc-300 flex items-center justify-between cursor-pointer hover:border-white/20 transition-all shadow-sm`}
      >
        <span>{selected.label}</span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-full bg-[#050505] border border-white/10 rounded-md shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
            {options.map((opt, index) => (
              <div 
                key={opt.value}
                className={`px-3 py-3 text-[13px] text-zinc-300 hover:bg-[#1a1a1a] hover:text-white cursor-pointer transition-colors flex items-center ${
                  index !== options.length - 1 ? 'border-b border-white/5' : ''
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TableFilterDropdown({ value, onChange, options, placeholder }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o:any) => o.value === value) || { label: placeholder };
  
  return (
    <div className="relative">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 bg-transparent border ${isOpen ? 'border-white/20 ring-1 ring-white/10 text-white' : 'border-white/10 text-zinc-300'} px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:text-white hover:bg-white/5 transition-all shadow-sm cursor-pointer select-none`}
      >
        <span>{selected.label}</span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-48 bg-[#0a0a0a] border border-white/10 rounded-md shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
            {options.map((opt:any, index:number) => (
              <div 
                key={opt.value}
                className={`px-4 py-2.5 text-[13px] text-zinc-300 hover:bg-[#1a1a1a] hover:text-white cursor-pointer transition-colors flex items-center justify-between ${index !== options.length - 1 ? 'border-b border-white/5' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
                {value === opt.value && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SortDropdown({ value, onChange }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const options = [
    { value: "updatedAt", label: "Last Updated" },
    { value: "createdAt", label: "Date Created" },
    { value: "severity", label: "Severity" }
  ];
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center w-10 h-10 bg-transparent border ${isOpen ? 'border-white/20 bg-white/5 text-white' : 'border-white/10 text-zinc-400'} rounded-[6px] hover:bg-white/5 transition-colors shrink-0 shadow-sm`}
      >
        <SlidersHorizontal className="w-[18px] h-[18px]" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-48 bg-[#0a0a0a] border border-white/10 rounded-md shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
            {options.map((opt:any, index:number) => (
              <div 
                key={opt.value}
                className={`px-4 py-2.5 text-[13px] text-zinc-300 hover:bg-[#1a1a1a] hover:text-white cursor-pointer transition-colors flex items-center justify-between ${index !== options.length - 1 ? 'border-b border-white/5' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
                {value === opt.value && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const getTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
};

const highlightMatch = (text: string, query: string) => {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-[#e3ff00] text-black px-0.5 rounded-[2px] bg-opacity-90">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
};

export default function SupportCasesPage() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    issueType: 'general',
    severity: 'medium',
    title: '',
    description: ''
  });
  const router = useRouter();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    fetchCases();
  }, [debouncedQuery, statusFilter, severityFilter, sortBy]);

  const fetchCases = async () => {
    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const queryParams = new URLSearchParams();
      if (debouncedQuery) queryParams.append("search", debouncedQuery);
      if (statusFilter) queryParams.append("status", statusFilter);
      if (severityFilter) queryParams.append("severity", severityFilter);
      if (sortBy) queryParams.append("sort", sortBy);
      
      const res = await fetch(`${apiUrl}/api/support?${queryParams.toString()}`, { credentials: "include" });
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

  const handleCreateHumanCase = async () => {
    if (isCreating || !formData.title || !formData.description) return;
    setIsCreating(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          caseType: 'human',
          issueType: formData.issueType,
          severity: formData.severity,
          title: formData.title,
          description: formData.description
        })
      });
      if (res.ok) {
        const newCase = await res.json();
        setIsModalOpen(false);
        router.push(`/dashboard/support/${newCase._id}`);
      }
    } catch (err) {
      console.error(err);
      setIsCreating(false);
    }
  };

  const createAiCase = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          caseType: 'ai',
          title: "AI Support Session"
        })
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
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cases..."
              className="w-full bg-[#050505] border border-white/10 rounded-[6px] py-2.5 pl-10 pr-4 text-[14px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/20 transition-all shadow-sm"
            />
          </div>
          
          {/* Sort Button */}
          <SortDropdown value={sortBy} onChange={setSortBy} />

          {/* Help / AI Case Button */}
          <button
            onClick={createAiCase}
            disabled={isCreating}
            className="flex items-center gap-2 bg-transparent border border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 px-3 py-2 rounded-[6px] text-[14px] font-medium transition-colors shrink-0 shadow-sm disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <MessageSquare className="w-[18px] h-[18px]" />}
            Help
          </button>

          {/* New Case Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-black border border-white/10 text-zinc-100 hover:bg-zinc-900 hover:border-white/20 px-3 py-2 rounded-[6px] text-[14px] font-medium transition-colors shrink-0 shadow-sm"
          >
            <Plus className="w-[18px] h-[18px]" />
            New Case
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-1">
          <TableFilterDropdown 
            options={[
              { value: "", label: "All Statuses" },
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
              { value: "transferred", label: "Transferred" },
              { value: "merged", label: "Merged" }
            ]} 
            value={statusFilter} 
            onChange={setStatusFilter} 
            placeholder="All Statuses" 
          />
          <TableFilterDropdown 
            options={[
              { value: "", label: "All Severities" },
              { value: "high", label: "Severity 1" },
              { value: "medium", label: "Severity 2" },
              { value: "low", label: "Severity 3" },
            ]} 
            value={severityFilter} 
            onChange={setSeverityFilter} 
            placeholder="All Severities" 
          />
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
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-transparent border border-white/10 hover:border-white/20 hover:bg-[#141414] text-white px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Case
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {cases.map((c, index) => (
              <div 
                key={c._id} 
                className="flex items-center justify-between p-[20px] bg-[#000000] border border-white/10 rounded-xl hover:bg-[#141414] transition-colors cursor-pointer shadow-sm"
                onClick={() => router.push(`/dashboard/support/${c._id}`)}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-white">
                      {highlightMatch(c.title, debouncedQuery)}
                    </span>
                    <span className="text-[14px] text-zinc-500 font-mono tracking-tight">#{c._id}</span>
                  </div>
                  <div className="text-[14px] text-zinc-400">
                    Opened by swapnil822 {getTimeAgo(c.createdAt)} - Last updated {getTimeAgo(c.updatedAt)}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* GitHub Avatar */}
                  <img 
                    src={c.userId?.avatar || "https://github.com/swapnil822.png"} 
                    alt="avatar"
                    className="w-[22px] h-[22px] rounded-full shrink-0"
                  />
                  {/* Severity Pill */}
                  <span className="px-2.5 py-1 bg-[#1a1a1a] border border-white/10 rounded-full text-[12px] text-zinc-300 font-medium tracking-wide">
                    Severity {c.severity === 'high' ? '1' : c.severity === 'medium' ? '2' : '3'}
                  </span>
                  {/* Status Pill */}
                  <span className={`px-2.5 py-1 border rounded-full text-[12px] font-medium tracking-wide ${
                    c.status === 'open' ? 'bg-[#0070F3] border-[#0070F3] text-white' :
                    c.status === 'closed' ? 'bg-transparent border-white/10 text-zinc-400' :
                    'bg-transparent border-white/10 text-zinc-400'
                  }`}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Case Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-[640px] h-full shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
              <h2 className="text-[24px] font-bold text-white tracking-tight">Support Case</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-[8px] border border-white/10 hover:bg-white/5 shadow-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            {/* Body */}
            <div className="px-8 pb-8 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              <div className="space-y-4">
                <p className="text-[14px] text-zinc-400">
                  The more detail you can provide, the better we can help you.
                </p>
                {/* Vercel-like Project badges */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-transparent w-fit">
                    <img src="https://github.com/swapnil822.png" className="w-4 h-4 rounded-full" alt="avatar" />
                    <span className="text-[13px] text-zinc-200 font-medium">swapnil822's projects</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-full border border-white/10 bg-[#111] text-[13px] text-zinc-300 font-medium w-fit">
                    Hobby
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-zinc-400">Problem Area</label>
                  <CustomSelect 
                    value={formData.issueType}
                    onChange={(val) => setFormData({...formData, issueType: val})}
                    options={[
                      {value: "general", label: "General Enquiry"},
                      {value: "deployment", label: "Deployment Issue"},
                      {value: "billing", label: "Invoice Enquiry"},
                      {value: "account", label: "Account Access"}
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-zinc-400">Severity Level</label>
                  <CustomSelect 
                    value={formData.severity}
                    onChange={(val) => setFormData({...formData, severity: val})}
                    options={[
                      {value: "low", label: "Severity 3 - General question"},
                      {value: "medium", label: "Severity 2 - Production impact"},
                      {value: "high", label: "Severity 1 - Critical outage"}
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-zinc-400">Subject</label>
                <div>
                  <input 
                    type="text" 
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    maxLength={100}
                    className={`w-full bg-[#000] border ${formData.title.length >= 100 ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : 'border-white/10 focus:border-white/20 focus:ring-white/20'} rounded-md p-3 text-[14px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 shadow-sm`}
                    placeholder="Summarize your issue..."
                  />
                  <div className={`text-[11px] text-right mt-1 ${formData.title.length >= 100 ? 'text-red-500 font-medium' : 'text-zinc-600'}`}>
                    {formData.title.length} / 100
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-zinc-400">Description</label>
                <div>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    maxLength={250}
                    className={`w-full bg-[#000] border ${formData.description.length >= 250 ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : 'border-white/10 focus:border-white/20 focus:ring-white/20'} rounded-md p-3 text-[14px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 min-h-[180px] resize-y shadow-sm`}
                    placeholder="Provide as much detail as possible..."
                  />
                  <div className={`text-[11px] text-right mt-1 ${formData.description.length >= 250 ? 'text-red-500 font-medium' : 'text-zinc-600'}`}>
                    {formData.description.length} / 250
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/5 flex gap-3 shrink-0 bg-[#0a0a0a] justify-end">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2.5 bg-transparent text-white border border-white/10 rounded-md text-[14px] font-medium hover:bg-[#141414] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateHumanCase}
                disabled={isCreating || !formData.title || !formData.description}
                className="px-6 py-2.5 bg-white text-black rounded-md text-[14px] font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
