"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Search, Download, Loader2, RefreshCw,
  ChevronDown, CheckCircle2, XCircle, AlertCircle,
  Circle, Pause, Play, Copy, Check, GitBranch, Clock, Terminal,
  MoreHorizontal, Info, ExternalLink, Crosshair, Settings,
  ArrowUp, ArrowDown, AlignLeft, ChevronRight
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface LogEntry {
  level: "info" | "warning" | "error" | "success";
  step: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

type MenuPosition = { top: number; left: number };

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getStepLabel(step: string) {
  const map: Record<string, string> = {
    validation: "validate",
    provider_connection: "connect",
    env_setup: "env",
    project_create: "create",
    project_update: "update",
    deploy_trigger: "deploy",
    health_check: "health",
    system: "system",
    init: "init",
    rollback: "rollback",
  };
  return map[step] || step;
}

// Highlight known patterns in log messages
function highlightMessage(msg: string) {
  let highlighted = msg.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-blue-400 underline-offset-2 hover:underline cursor-pointer">$1</a>');
  
  highlighted = highlighted.replace(/<[^>]+>|\b(ERROR|FAILED|SUCCESS|READY|WARNING|WARN)\b|\b(\d{3})\b/gi, (match, keyword, codeStr) => {
    if (keyword) {
      const kw = keyword.toUpperCase();
      if (kw === 'ERROR' || kw === 'FAILED') return `<span class="text-red-400 font-semibold">${match}</span>`;
      if (kw === 'SUCCESS' || kw === 'READY') return `<span class="text-emerald-400 font-semibold">${match}</span>`;
      if (kw === 'WARNING' || kw === 'WARN') return `<span class="text-yellow-400 font-semibold">${match}</span>`;
      return match;
    }
    if (codeStr) {
      const code = parseInt(codeStr);
      if (code >= 200 && code < 300) return `<span class="text-emerald-400 font-mono">${match}</span>`;
      if (code >= 400) return `<span class="text-red-400 font-mono">${match}</span>`;
      return match;
    }
    return match; // HTML tag, unchanged
  });

  return highlighted;
}

// ─────────────────────────────────────────────
// Single log line component
// ─────────────────────────────────────────────
const LogLine = React.memo(({ log, index, isHighlighted, globalExpanded }: { log: LogEntry; index: number; isHighlighted?: boolean; globalExpanded?: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (globalExpanded !== undefined) {
      setExpanded(globalExpanded);
    }
  }, [globalExpanded]);
  const [isTimeHovered, setIsTimeHovered] = useState(false);
  const [isIconHovered, setIsIconHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  useEffect(() => {
    if (isHighlighted) {
      document.getElementById(`log-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted, index]);

  const tzOffset = -new Date().getTimezoneOffset();
  const tzSign = tzOffset >= 0 ? "+" : "-";
  const tzHours = Math.floor(Math.abs(tzOffset) / 60);
  const tzMins = Math.abs(tzOffset) % 60;
  const tzLabel = `GMT${tzSign}${tzHours}${tzMins ? ":" + tzMins.toString().padStart(2, "0") : ""}:`;

  const isActive = isHovered || isMenuOpen;

  const getRowStyles = () => {
    let bg = "transparent";
    let shadow = "none";

    if (isHighlighted) {
      bg = "#3b0764"; // Deep purple
      shadow = "inset 0 1px 0 #a855f7, inset 0 -1px 0 #a855f7"; // Glowing purple top/bottom borders
    } else if (log.level === "error") {
      bg = isActive ? "#471616" : "#3b1212";
      shadow = "inset 0 1px 0 #ef4444, inset 0 -1px 0 #ef4444"; // Glowing red top/bottom borders
    } else if (log.level === "warning") {
      bg = isActive ? "#423800" : "#332b00";
      shadow = "inset 0 1px 0 #eab308, inset 0 -1px 0 #eab308"; // Glowing yellow top/bottom borders
    } else if (isActive) {
      bg = "#3b0764"; // Deep purple hover for normal rows
      shadow = "inset 0 1px 0 #a855f7, inset 0 -1px 0 #a855f7"; // Matching purple border for hovered rows
    }
    
    return { backgroundColor: bg, boxShadow: shadow };
  };

  const handleCopyLine = () => {
    const textToCopy = `[${formatTimestamp(log.timestamp)}] [${getStepLabel(log.step)}] ${log.message}`;
    navigator.clipboard.writeText(textToCopy);
    setIsMenuOpen(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Log line copied to clipboard", type: "success" } }));
  };

  const handleViewInContext = () => {
    window.open(`${window.location.pathname}?line=${index}`, '_blank');
    setIsMenuOpen(false);
  };

  return (
    <div
      id={`log-${index}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex flex-col transition-colors relative"
      style={{ 
        ...getRowStyles(),
        zIndex: isActive || isTimeHovered || isIconHovered ? 20 : 0
      }}
    >
      <div className="flex items-center gap-4 px-4 py-1 text-[13px] font-mono w-full">
        {/* Icon column */}
        <div 
          className="w-4 shrink-0 flex items-center justify-center relative cursor-default"
          onMouseEnter={() => setIsIconHovered(true)}
          onMouseLeave={() => setIsIconHovered(false)}
          style={{ zIndex: isIconHovered ? 60 : 10 }}
        >
          {log.level === "error" ? (
            <XCircle className="h-3.5 w-3.5 text-red-500 rounded-full" style={{ backgroundColor: "#3b1212" }} />
          ) : log.level === "warning" ? (
            <AlertCircle className="h-3.5 w-3.5 text-yellow-500 rounded-full" style={{ backgroundColor: "#332b00" }} />
          ) : (
            <div 
              className="flex items-center justify-center rounded-full transition-opacity text-white font-sans font-bold text-[10px]"
              style={{ 
                opacity: isActive ? 1 : 0, 
                width: 14, height: 14, backgroundColor: "#5e35b1",
                lineHeight: 1
              }}
            >
              i
            </div>
          )}

          {/* Icon Tooltip */}
          <div 
            className="absolute z-[100] transition-opacity"
            style={{
              left: "100%", // Start immediately after the icon
              top: "50%",
              transform: "translateY(-50%)",
              marginLeft: "12px", // Small spacing
              opacity: isIconHovered ? 1 : 0,
              visibility: isIconHovered ? "visible" : "hidden",
              pointerEvents: isIconHovered ? "auto" : "none",
              filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))"
            }}
          >
            {/* Main Box */}
            <div 
              className="relative bg-white border border-[#e5e7eb] rounded shadow-lg z-10"
              style={{ padding: "6px 10px" }}
            >
              {/* Tooltip Arrow */}
              <div 
                className="absolute bg-white border-l border-t border-[#e5e7eb]"
                style={{
                  width: "8px",
                  height: "8px",
                  left: "-5px",
                  top: "50%",
                  marginTop: "-4px",
                  transform: "rotate(-45deg)",
                  zIndex: 1
                }}
              />
              
              {/* Text */}
              <div 
                className="relative z-10 font-mono text-[12px] font-medium text-black leading-none whitespace-nowrap"
                style={{ color: "#000000" }}
              >
                {log.level === "error" ? "ERROR" : log.level === "warning" ? "WARN" : "INFO"}
              </div>
            </div>
          </div>
        </div>

        {/* Timestamp with Tooltip */}
        <div 
          className="shrink-0 text-zinc-500 w-[95px] relative cursor-pointer"
          onMouseEnter={() => setIsTimeHovered(true)}
          onMouseLeave={() => setIsTimeHovered(false)}
        >
          <span className="block">{formatTimestamp(log.timestamp)}</span>
          
          {/* Tooltip Wrapper */}
          <div 
            className="absolute z-[100] transition-opacity"
            style={{
              left: "100%", // Start immediately after the timestamp
              top: "50%",   // "Center of that row" vertically
              transform: "translateY(-50%)",
              marginLeft: "12px", // Small spacing from the time text
              opacity: isTimeHovered ? 1 : 0,
              visibility: isTimeHovered ? "visible" : "hidden",
              pointerEvents: isTimeHovered ? "auto" : "none",
              filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))"
            }}
          >
            {/* Main Box */}
            <div 
              className="relative bg-white border border-[#e5e7eb] rounded z-10"
              style={{ padding: "6px 12px" }}
            >
              {/* Tooltip Arrow (inside main box to seamlessly cover border) */}
              <div 
                className="absolute bg-white border-l border-t border-[#e5e7eb]"
                style={{
                  width: "8px",
                  height: "8px",
                  left: "-5px",
                  top: "50%",
                  marginTop: "-4px",
                  transform: "rotate(-45deg)",
                  zIndex: 1
                }}
              />
              
              {/* Text Grid */}
              <div 
                className="relative z-10" 
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: "auto 1fr", 
                  columnGap: "16px",
                  rowGap: "4px", 
                  whiteSpace: "nowrap", 
                  textAlign: "left", 
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', 
                  fontSize: "11px", 
                  lineHeight: "1.4",
                  alignItems: "center" 
                }}
              >
                <span style={{ color: "#71717a" }}>{tzLabel}</span>
                <span style={{ color: "#18181b" }}>{new Date(log.timestamp).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).replace(/,/g, "")}</span>
                <span style={{ color: "#71717a" }}>UTC:</span>
                <span style={{ color: "#18181b" }}>{new Date(log.timestamp).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).replace(/,/g, "")}</span>
                <span style={{ color: "#71717a" }}>Timestamp:</span>
                <span style={{ color: "#18181b" }}>{new Date(log.timestamp).getTime()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step / Tag */}
        <div className="w-[120px] shrink-0 text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap">
          {log.step ? `[${log.step}]` : ""}
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <span
            className="break-words whitespace-pre-wrap"
            style={{
              color: log.level === "error" ? "#fca5a5" :
                     log.level === "warning" ? "#fde047" :
                     log.level === "success" ? "#4ade80" : "#d4d4d8"
            }}
            dangerouslySetInnerHTML={{ __html: highlightMessage(log.message) }}
          />
          {hasMetadata && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="ml-2 text-zinc-500 hover:text-zinc-300 transition-colors text-[11px] inline-flex items-center gap-0.5"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
              meta
            </button>
          )}
        </div>

        {/* Action Menu (3 dots) */}
        <div 
          className="shrink-0 w-8 flex items-center justify-end transition-opacity relative"
          style={{ opacity: isHovered || isMenuOpen ? 1 : 0 }}
          ref={menuRef}
        >
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-zinc-500 hover:text-white transition-colors p-1 rounded hover:bg-zinc-800"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute top-full right-4 mt-1 w-[180px] bg-zinc-800 border border-zinc-700 rounded shadow-2xl z-50 py-1 font-sans text-zinc-200">
              <button
                onClick={handleCopyLine}
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-zinc-700 flex items-center gap-2 transition-colors"
              >
                <Copy className="h-3.5 w-3.5 opacity-70" />
                <span>Copy log line</span>
              </button>
              <button
                onClick={handleViewInContext}
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-zinc-700 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Crosshair className="h-3.5 w-3.5 opacity-70" />
                  <span>View in context</span>
                </div>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Metadata */}
      {expanded && hasMetadata && (
        <div className="w-full pb-2" style={{ paddingLeft: "265px", paddingRight: "16px" }}>
          <pre className="p-2 border border-zinc-800/60 rounded text-[11px] text-zinc-400 overflow-x-auto" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
});
LogLine.displayName = "LogLine";

// ─────────────────────────────────────────────
// Main log viewer page
// ─────────────────────────────────────────────
export default function DeploymentLogViewerPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const deploymentId = params.deploymentId as string;

  const searchParams = useSearchParams();
  const highlightLine = searchParams.get("line");

  const [deployment, setDeployment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [toast, setToast] = useState<{message: string, type: "success"|"error"} | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set(["info", "success", "warning", "error"]));
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Auto-scroll "follow" mode
  const [following, setFollowing] = useState(true);
  const [copied, setCopied] = useState(false);
  
  // Action Menu State
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [actionMenuPosition, setActionMenuPosition] = useState<MenuPosition | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuPanelRef = useRef<HTMLDivElement>(null);

  // Status Menu State
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [statusMenuPosition, setStatusMenuPosition] = useState<MenuPosition | null>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const statusMenuPanelRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  const [globalExpanded, setGlobalExpanded] = useState(false);

  const getFixedMenuPosition = useCallback((anchor: HTMLElement | null, menuWidth: number): MenuPosition | null => {
    if (!anchor) return null;
    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 8;
    return {
      top: rect.bottom + 8,
      left: Math.max(
        viewportPadding,
        Math.min(window.innerWidth - menuWidth - viewportPadding, rect.right - menuWidth)
      ),
    };
  }, []);

  const updateMenuPositions = useCallback(() => {
    if (isStatusMenuOpen) {
      setStatusMenuPosition(getFixedMenuPosition(statusMenuRef.current, 224));
    }
    if (isActionMenuOpen) {
      setActionMenuPosition(getFixedMenuPosition(actionMenuRef.current, 260));
    }
  }, [getFixedMenuPosition, isActionMenuOpen, isStatusMenuOpen]);

  const toggleStatusMenu = useCallback(() => {
    setIsActionMenuOpen(false);
    setActionMenuPosition(null);
    setIsStatusMenuOpen(open => {
      const nextOpen = !open;
      setStatusMenuPosition(nextOpen ? getFixedMenuPosition(statusMenuRef.current, 224) : null);
      return nextOpen;
    });
  }, [getFixedMenuPosition]);

  const toggleActionMenu = useCallback(() => {
    setIsStatusMenuOpen(false);
    setStatusMenuPosition(null);
    setIsActionMenuOpen(open => {
      const nextOpen = !open;
      setActionMenuPosition(nextOpen ? getFixedMenuPosition(actionMenuRef.current, 260) : null);
      return nextOpen;
    });
  }, [getFixedMenuPosition]);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        actionMenuRef.current &&
        !actionMenuRef.current.contains(target) &&
        !actionMenuPanelRef.current?.contains(target)
      ) {
        setIsActionMenuOpen(false);
        setActionMenuPosition(null);
      }
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(target) &&
        !statusMenuPanelRef.current?.contains(target)
      ) {
        setIsStatusMenuOpen(false);
        setStatusMenuPosition(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsActionMenuOpen(false);
        setIsStatusMenuOpen(false);
        setActionMenuPosition(null);
        setStatusMenuPosition(null);
      }
    };
    if (isActionMenuOpen || isStatusMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    if (isActionMenuOpen || isStatusMenuOpen) document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActionMenuOpen, isStatusMenuOpen]);

  useEffect(() => {
    if (!isActionMenuOpen && !isStatusMenuOpen) return;
    updateMenuPositions();
    window.addEventListener("resize", updateMenuPositions);
    window.addEventListener("scroll", updateMenuPositions, true);
    return () => {
      window.removeEventListener("resize", updateMenuPositions);
      window.removeEventListener("scroll", updateMenuPositions, true);
    };
  }, [isActionMenuOpen, isStatusMenuOpen, updateMenuPositions]);

  useEffect(() => {
    const handleShowToast = (e: any) => {
      setToast(e.detail);
      setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener("show-toast", handleShowToast);
    return () => window.removeEventListener("show-toast", handleShowToast);
  }, []);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdated = useRef(Date.now());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ─────────────────────────
  // Debounce search
  // ─────────────────────────
  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdated.current >= 1000) {
      setDebouncedSearch(searchQuery);
      lastUpdated.current = now;
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDebouncedSearch(searchQuery);
        lastUpdated.current = Date.now();
      }, 300);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [searchQuery]);

  // ─────────────────────────
  // Fetch deployment
  // ─────────────────────────
  const fetchDeployment = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/deployments/${deploymentId}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setDeployment(data);
        return data;
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  }, [deploymentId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await fetchDeployment();
      setLoading(false);
      // Start polling if deployment is still running
      if (data && (data.status === "running" || data.status === "queued")) {
        setPolling(true);
      }
    })();
  }, [fetchDeployment]);

  // ─────────────────────────
  // Live polling while running
  // ─────────────────────────
  useEffect(() => {
    if (polling) {
      pollIntervalRef.current = setInterval(async () => {
        const data = await fetchDeployment();
        if (data && data.status !== "running" && data.status !== "queued") {
          setPolling(false);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      }, 3000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [polling, fetchDeployment]);

  // ─────────────────────────
  // Auto-scroll to bottom
  // ─────────────────────────
  useEffect(() => {
    if (following && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [deployment?.logs, following]);

  // Detect user scroll away from bottom → unfollow
  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setFollowing(isNearBottom);
  }, []);

  // ─────────────────────────
  // Filtered logs (memoized)
  // ─────────────────────────
  const allLogs: LogEntry[] = deployment?.logs || [];

  const filteredLogs = useMemo(() => {
    let result = allLogs.filter(log => {
      const matchesLevel = selectedLevels.has(log.level);
      const matchesSearch = !debouncedSearch ||
        log.message.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        log.step.toLowerCase().includes(debouncedSearch.toLowerCase());
      return matchesLevel && matchesSearch;
    });
    
    if (sortOrder === "desc") {
      result = [...result].reverse();
    }
    return result;
  }, [allLogs, selectedLevels, debouncedSearch, sortOrder]);

  // Log counts by level
  const counts = useMemo(() => ({
    all: allLogs.length,
    info: allLogs.filter(l => l.level === "info").length,
    warning: allLogs.filter(l => l.level === "warning").length,
    error: allLogs.filter(l => l.level === "error").length,
    success: allLogs.filter(l => l.level === "success").length,
  }), [allLogs]);

  // ─────────────────────────
  // Download logs
  // ─────────────────────────
  const handleDownload = useCallback(() => {
    const text = allLogs.map(l =>
      `[${formatTimestamp(l.timestamp)}] [${l.level.toUpperCase().padEnd(7)}] [${l.step}] ${l.message}`
    ).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `deployment-logs-${deploymentId.slice(-8)}.txt`;
    a.click();
  }, [allLogs, deploymentId]);

  // Copy logs
  const handleCopy = useCallback(async () => {
    const text = filteredLogs.map(l =>
      `[${formatTimestamp(l.timestamp)}] [${l.level.toUpperCase()}] ${l.message}`
    ).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Visible logs copied to clipboard", type: "success" } }));
    } catch {}
  }, [filteredLogs]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+C or Cmd+Shift+C
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy]);

  // ─────────────────────────
  // Render
  // ─────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-7 w-7 animate-spin text-zinc-500" />
      </div>
    );
  }

  const isRunning = deployment?.status === "running" || deployment?.status === "queued";
  const isFailed = deployment?.status === "failed";
  const isSuccess = deployment?.status === "success" || deployment?.status === "completed";

  const statusIcon = isRunning
    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-400" />
    : isSuccess
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    : isFailed
    ? <XCircle className="h-3.5 w-3.5 text-red-400" />
    : <Circle className="h-3.5 w-3.5 text-zinc-500" />;

  const statusLabel = isRunning ? "Building" : isSuccess ? "Ready" : isFailed ? "Failed" : deployment?.status;

  const projectName = deployment?.projectId?.repoName || "Project";
  const branch = deployment?.source?.branch || "main";

  return (
    <div className="h-screen flex flex-col bg-[#050505] text-white overflow-hidden">
      {/* ── TOP HEADER BAR (Removed) ── */}

      {/* ── FILTER BAR ── */}
      <div className="relative z-[300] border-b border-zinc-800 bg-[#070707] shrink-0 px-4 py-3 flex items-center gap-4">
        {/* Left side: Branch, Date, Lines */}
        <div className="flex items-center gap-3 text-[12px] text-zinc-500 min-w-max">
          <a 
            href={deployment?.projectId?.repoFullName ? `https://github.com/${deployment.projectId.repoFullName}/tree/${branch}` : "#"} 
            target={deployment?.projectId?.repoFullName ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-zinc-300 bg-zinc-900/50 hover:bg-zinc-800 px-2.5 py-1 rounded-md border border-zinc-800/80 transition-colors cursor-pointer"
          >
            <GitBranch className="h-3.5 w-3.5 text-zinc-400" />
            <span className="font-mono font-medium">{branch}</span>
          </a>

          <div className="flex items-center gap-1.5 bg-zinc-900/30 px-2.5 py-1 rounded-md border border-zinc-800/50">
            <Clock className="h-3.5 w-3.5 text-zinc-500" />
            <span>{deployment?.createdAt ? new Date(deployment.createdAt).toLocaleString() : "—"}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-900/50 px-2.5 py-1 rounded-md border border-zinc-800/80">
            <Terminal className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-white font-semibold text-[13px]">{filteredLogs.length} <span className="text-zinc-500 font-normal text-[12px]">lines</span></span>
          </div>
        </div>

        {/* Center: Search */}
        <div className={`relative flex-1 group border rounded-md h-10 bg-[#0a0a0a] transition-all ${
          isSearchFocused ? 'border-white ring-1 ring-white' : 'border-zinc-800 hover:border-white'
        }`}>
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            <Search className={`h-4 w-4 transition-colors ${isSearchFocused ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-400'}`} />
          </div>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            style={{ paddingLeft: '42px' }}
            className="w-full h-full bg-transparent border-none outline-none pr-3 text-[13px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-0 font-mono rounded-md"
          />
        </div>

        {/* Right side: Status dropdown & actions */}
        <div className="relative z-[400] flex items-center gap-3 min-w-max">
          {/* Status Dropdown */}
          <div className="relative z-[410]" ref={statusMenuRef}>
            <button
              onClick={toggleStatusMenu}
              className={`flex items-center gap-2 px-3 h-10 border rounded-md text-[13px] transition-colors ${
                isStatusMenuOpen ? 'border-white bg-zinc-800 text-white' : 'border-zinc-800 bg-[#0a0a0a] text-zinc-300 hover:border-white hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <div className="flex -space-x-1">
                <div className={`h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0a] z-40 transition-colors ${selectedLevels.has("success") ? "bg-emerald-500" : "bg-emerald-500/20"}`} />
                <div className={`h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0a] z-30 transition-colors ${selectedLevels.has("error") ? "bg-red-500" : "bg-red-500/20"}`} />
                <div className={`h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0a] z-20 transition-colors ${selectedLevels.has("warning") ? "bg-yellow-500" : "bg-yellow-500/20"}`} />
                <div className={`h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0a] z-10 transition-colors ${selectedLevels.has("info") ? "bg-zinc-500" : "bg-zinc-500/20"}`} />
              </div>
              Status {selectedLevels.size}/4
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            </button>
          </div>
          
          <div className="relative z-[410]" ref={actionMenuRef}>
            <button
              onClick={toggleActionMenu}
              className={`w-10 h-10 border rounded-md transition-colors flex items-center justify-center ${
                isActionMenuOpen ? 'border-white bg-zinc-800 text-white' : 'border-zinc-800 bg-[#0a0a0a] text-zinc-400 hover:border-white hover:text-white hover:bg-zinc-900'
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── LOG OUTPUT ── */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-[#050505] font-mono"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#27272a transparent" }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-600">
            <Terminal className="h-12 w-12 opacity-30" />
            {isRunning ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                <p className="text-[14px]">Waiting for logs…</p>
              </div>
            ) : (
              <p className="text-[14px]">
                {allLogs.length === 0 ? "No logs recorded for this deployment." : "No logs match your filter."}
              </p>
            )}
          </div>
        ) : (
          <div className="py-2">
            {filteredLogs.map((log, i) => (
              <LogLine key={`${i}-${log.timestamp}`} log={log} index={i} isHighlighted={highlightLine === String(i)} globalExpanded={globalExpanded} />
            ))}

            {/* Live indicator at end */}
            {isRunning && (
              <div className="flex items-center gap-2 px-4 py-2 text-[12px] text-zinc-600 font-mono">
                <div className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                Streaming logs… refreshing every 3s
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM STATUS BAR ── */}
      <div className="border-t border-zinc-800 bg-[#080808] shrink-0 px-4 py-1.5 flex items-center justify-between text-[11px] text-zinc-600 font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            {statusIcon} <span>{statusLabel}</span>
          </span>
          {deployment?.durationMs && (
            <span>Duration: {(deployment.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-zinc-700">{filteredLogs.length} / {allLogs.length} lines shown</span>
          {isRunning && <span className="text-yellow-500/70 flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" /> Live</span>}
        </div>
      </div>

      {/* Global Toast */}
      {toast && (
        <div 
          className={`fixed top-6 right-6 px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 text-[13px] font-medium transition-all animate-in slide-in-from-top-5 fade-in duration-200 ${toast.type === "success" ? "bg-black text-zinc-200 border border-zinc-800" : "bg-black text-red-200 border border-red-900/50"}`}
          style={{ zIndex: 999999 }}
        >
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-red-500" />}
          {toast.message}
        </div>
      )}

      {/* Menus via Portal */}
      {isMounted && document.body && createPortal(
        <>
          {isStatusMenuOpen && statusMenuPosition && (
            <div 
              ref={statusMenuPanelRef}
              className="fixed w-[200px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl p-1 flex flex-col font-sans"
              style={{ top: statusMenuPosition.top, left: statusMenuPosition.left, zIndex: 99999 }}
            >
              {["error", "warning", "info", "success"].map(level => {
                const optColor = level === 'success' ? 'bg-[#55c786]' : level === 'error' ? 'bg-[#c34370]' : level === 'warning' ? 'bg-[#f5a623]' : 'bg-zinc-500';
                const optLabel = level === 'success' ? 'Ready' : level === 'error' ? 'Error' : level === 'warning' ? 'Warning' : 'Info';
                const isSelected = selectedLevels.has(level);
                return (
                  <button
                    key={level}
                    onClick={() => {
                      const next = new Set(selectedLevels);
                      if (next.has(level)) next.delete(level);
                      else next.add(level);
                      setSelectedLevels(next);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] cursor-pointer hover:bg-zinc-800/50 transition-colors ${isSelected ? 'text-white' : 'text-zinc-400'}`}
                  >
                    <div className={`h-3.5 w-3.5 rounded-[3px] border flex items-center justify-center shrink-0 ${isSelected ? 'bg-white border-white' : 'border-zinc-600'}`}>
                      {isSelected && <Check className="h-2.5 w-2.5 text-black" strokeWidth={3} />}
                    </div>
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${optColor}`}></div>
                    <span>{optLabel}</span>
                  </button>
                );
              })}
            </div>
          )}

          {isActionMenuOpen && actionMenuPosition && (
            <div 
              ref={actionMenuPanelRef}
              className="fixed w-[260px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl p-1 flex flex-col font-sans"
              style={{ top: actionMenuPosition.top, left: actionMenuPosition.left, zIndex: 99999 }}
            >
              <button
                onClick={() => {
                  handleCopy();
                  setIsActionMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer hover:bg-zinc-800/50 transition-colors text-zinc-300"
              >
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <Copy className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span>Copy logs</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-zinc-800/50 px-1.5 py-0.5 rounded border border-zinc-700/50 shrink-0">
                  <span>^</span>
                  <span>⇧</span>
                  <span>C</span>
                </div>
              </button>

              <div className="h-px bg-zinc-800 my-1.5 mx-2" />
              
              <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                Order by
              </div>

              <button
                onClick={() => {
                  setSortOrder("asc");
                  setIsActionMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer hover:bg-zinc-800/50 transition-colors text-zinc-300"
              >
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <ArrowUp className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span>Ascending</span>
                </div>
                {sortOrder === "asc" && <Check className="h-4 w-4 text-zinc-300 shrink-0" />}
              </button>

              <button
                onClick={() => {
                  setSortOrder("desc");
                  setIsActionMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer hover:bg-zinc-800/50 transition-colors text-zinc-300"
              >
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <ArrowDown className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span>Descending</span>
                </div>
                {sortOrder === "desc" && <Check className="h-4 w-4 text-zinc-300 shrink-0" />}
              </button>

              <div className="h-px bg-zinc-800 my-1.5 mx-2" />

              <button
                onClick={() => {
                  setGlobalExpanded(prev => !prev);
                  setIsActionMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer hover:bg-zinc-800/50 transition-colors text-zinc-300"
              >
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <AlignLeft className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span>Display: <span className="font-semibold text-zinc-100">{globalExpanded ? "Collapse everything" : "Expand everything"}</span></span>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
              </button>

              {/* <div className="h-px bg-zinc-800 my-1.5 mx-2" /> */}

              {/* <button
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] cursor-pointer hover:bg-zinc-800/50 transition-colors text-zinc-300 whitespace-nowrap"
              >
                <Settings className="h-4 w-4 text-zinc-400 shrink-0" />
                <span>Theme Settings</span>
              </button> */}
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}
