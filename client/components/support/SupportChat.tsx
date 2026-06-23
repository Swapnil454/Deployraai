"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Loader2, Copy, Lock, Unlock, ExternalLink, MoreHorizontal, ChevronDown, LifeBuoy, Paperclip, ArrowUp, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Link from "next/link";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

interface ChatMessage {
  id?: string;
  _id?: string;
  role: "user" | "model" | "admin" | "system";
  content: string;
  attachment?: {
    url: string;
    type: string;
    name: string;
  };
  attachments?: {
    url: string;
    type: string;
    name: string;
  }[];
  timestamp?: string;
}

interface SupportCase {
  _id: string;
  title: string;
  caseType: string;
  status: string;
  closedByRole?: string;
  severity: string;
  updatedAt: string;
  parentCaseId?: string;
  userId?: {
    name?: string;
    githubUsername?: string;
    avatar?: string;
  };
}

export default function SupportChat({ caseId, initialIsAdmin }: { caseId: string, initialIsAdmin: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [caseDetails, setCaseDetails] = useState<SupportCase | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; type: string; name: string; }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFollowUp, setIsCreatingFollowUp] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{url: string, name: string} | null>(null);
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, caseDetails?.status]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (caseId) {
      fetchCase();

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const socket = io(apiUrl, {
        withCredentials: true,
      });

      socket.on("connect", () => {
        socket.emit("join_case", caseId);
      });

      socket.on("new_message", (data) => {
        if (data.caseId === caseId) {
          setMessages((prev) => {
            // Deduplicate
            if (data.message._id && prev.some(m => m._id === data.message._id)) return prev;
            // Ignore optimistic updates
            if (data.message.role === (isAdmin ? 'admin' : 'user') && prev.some(m => m.content === data.message.content && !m._id)) {
              return prev;
            }
            return [...prev, data.message];
          });
        }
      });

      socket.on("case_status_updated", (data) => {
        if (data.caseId === caseId) {
          setCaseDetails((prev) => prev ? { ...prev, status: data.status, closedByRole: data.closedByRole, updatedAt: new Date().toISOString() } : null);
          if (data.message) {
            setMessages((prev) => {
              if (prev.some(m => m._id === data.message._id)) return prev;
              return [...prev, data.message];
            });
          }
        }
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [caseId, isAdmin]);

  const fetchCase = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/support/${caseId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setIsAdmin(data.isAdmin || initialIsAdmin);
        setCaseDetails(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleCreateFollowUp = async () => {
    try {
      setIsCreatingFollowUp(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/support/${caseId}/followup`, {
        method: "POST",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to create follow-up");
      const data = await res.json();
      router.push(`/dashboard/support/${data._id}`);
    } catch (error) {
      console.error(error);
      setIsCreatingFollowUp(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    setMenuOpen(false);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const endpoint = isAdmin ? `/api/support/admin/cases/${caseId}/status` : `/api/support/${caseId}/status`;
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCaseDetails((prev) => prev ? { ...prev, status: newStatus, closedByRole: newStatus === 'closed' ? (isAdmin ? 'admin' : 'user') : undefined, updatedAt: new Date().toISOString() } : null);
      }
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading file:', error);
      window.open(url, '_blank');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (attachments.length + files.length > 5) {
      files = files.slice(0, 5 - attachments.length);
    }
    
    if (files.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    const newAttachments = [...attachments];

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${apiUrl}/api/support/upload`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) throw new Error("Upload failed");
        const data = await response.json();
        newAttachments.push(data);
      }
      setAttachments(newAttachments);
    } catch (err) {
      console.error("File upload error:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading || isUploading || caseDetails?.status === 'closed') return;

    const tempId = Date.now().toString();
    const userMessage: ChatMessage = {
      id: tempId,
      role: isAdmin ? "admin" : "user",
      content: input.trim() || "Sent attachments",
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiUrl}/api/support/${caseId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          message: userMessage.content,
          attachments: userMessage.attachments
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to fetch response: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      
      if (data.reply && caseDetails?.caseType === 'ai') {
        setMessages((prev) => {
           if (prev.some(m => m._id === data.reply._id)) return prev;
           return [...prev, data.reply];
        });
      }
    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "model",
        content: "Sorry, I encountered an error while trying to process your request. Please try again later.",
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(caseId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    return `${days}d ago`;
  };

  const getFormatTime = (dateString?: string) => {
    if (!dateString) return "Today at 12:00 PM";
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const isToday = today.toDateString() === date.toDateString();
    const isYesterday = yesterday.toDateString() === date.toDateString();
    
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (isToday) return `Today at ${time}`;
    if (isYesterday) return `Yesterday at ${time}`;
    return `${date.toLocaleDateString()} at ${time}`;
  };

  if (isInitializing) {
    return (
      <div className="flex flex-col h-full w-full bg-[#000000] items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-48px)] w-full relative bg-[#000000] text-zinc-200">
      
      {/* Vercel-style Header Area */}
      <div className="px-8 py-2.5 border-b border-white/5 flex flex-col gap-2">
        {/* Breadcrumb - Only show for admin since User Dashboard Header has it */}
        {isAdmin && (
          <div className="flex items-center gap-2 text-[14px] text-zinc-400">
            <Link href="/admin/support" className="hover:text-white transition-colors">Support</Link>
            <span>/</span>
            <Link href="/admin/support" className="hover:text-white transition-colors">Cases</Link>
            <span>/</span>
            <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-[13px]">
              #{caseId}
              <button onClick={copyToClipboard} className="hover:text-white transition-colors ml-1 p-0.5 rounded-md hover:bg-white/10" title="Copy Case ID">
                {copied ? <span className="text-[10px] uppercase text-green-400 font-sans tracking-wide px-1">Copied</span> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Title Row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
            <h1 className="text-[15px] font-medium text-white">{caseDetails?.title || 'Support Case'}</h1>
            <span className="text-[13px] text-zinc-500">updated {getTimeAgo(caseDetails?.updatedAt || new Date().toISOString())}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {caseDetails?.severity && (
              <div className="px-3 py-1 rounded-full bg-[#1a1a1a] border border-white/5 text-[12px] font-medium text-zinc-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                Severity {caseDetails.severity === 'high' ? '1' : caseDetails.severity === 'medium' ? '2' : '3'}
              </div>
            )}
            
            <div className={`px-3 py-1 rounded-full text-[12px] font-medium ${
              caseDetails?.status === 'closed' || caseDetails?.status === 'resolved'
                ? 'bg-[#1a1a1a] border border-white/5 text-zinc-400' 
                : 'bg-[#0070f3] text-white'
            }`}>
              <span className="capitalize">{caseDetails?.status || 'Open'}</span>
            </div>

            {/* Three Dot Menu */}
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setMenuOpen(!menuOpen)}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${menuOpen ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
              >
                <MoreHorizontal className="w-5 h-5 stroke-[2.5px]" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl py-1 z-50 overflow-hidden">
                  <button 
                    onClick={handleCreateFollowUp}
                    disabled={isCreatingFollowUp}
                    className="w-full px-4 py-2.5 text-left text-[13px] text-zinc-300 hover:bg-white/5 flex items-center justify-between transition-colors disabled:opacity-50"
                  >
                    {isCreatingFollowUp ? 'Creating...' : 'Create Follow-Up'}
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                  {caseDetails?.status === 'closed' ? (
                    <button 
                      onClick={() => updateStatus('open')}
                      className="w-full px-4 py-2.5 text-left text-[13px] text-zinc-300 hover:bg-white/5 flex items-center justify-between transition-colors border-t border-white/5"
                    >
                      Reopen Case
                      <Unlock className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  ) : (
                    <button 
                      onClick={() => updateStatus('closed')}
                      className="w-full px-4 py-2.5 text-left text-[13px] text-zinc-300 hover:bg-white/5 flex items-center justify-between transition-colors border-t border-white/5"
                    >
                      Close Case
                      <Lock className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-8 py-6 relative z-10 scroll-smooth flex flex-col"
      >
        <div className="max-w-[800px] space-y-4 w-full mx-auto flex flex-col flex-1 pb-4">
          <div className="space-y-6 flex-1">
            {caseDetails?.parentCaseId && (
              <div className="flex justify-center mb-8">
                <Link href={`${isAdmin ? '/admin' : '/dashboard'}/support/${caseDetails.parentCaseId}`} className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#222222] border border-white/10 rounded-full flex items-center gap-2 transition-colors group shadow-md">
                  <ExternalLink className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300" />
                  <span className="text-[13px] text-zinc-300 font-medium">
                    This case is a follow-up to Case <span className="text-white">#{caseDetails.parentCaseId}</span>
                  </span>
                </Link>
              </div>
            )}
            {messages.map((msg, index) => {
              const currentMsgDate = new Date(msg.timestamp || caseDetails?.updatedAt || new Date()).toDateString();
              const prevMsgDate = index > 0 ? new Date(messages[index - 1].timestamp || caseDetails?.updatedAt || new Date()).toDateString() : null;
              const showDateSeparator = currentMsgDate !== prevMsgDate;
              
              let dateSeparatorText = currentMsgDate;
              if (showDateSeparator) {
                const dateObj = new Date(currentMsgDate);
                const isToday = new Date().toDateString() === currentMsgDate;
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const isYesterday = yesterday.toDateString() === currentMsgDate;
                
                if (isToday) dateSeparatorText = "TODAY";
                else if (isYesterday) dateSeparatorText = "YESTERDAY";
                else {
                  dateSeparatorText = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
                }
              }

              const isSender = (isAdmin && msg.role === "admin") || (!isAdmin && msg.role === "user");
              
              let senderName = "";
              let senderAvatar = null;
              
              if (msg.role === "admin" || msg.role === "model") {
                senderName = "Support Agent";
                senderAvatar = (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shrink-0">
                    <Bot className="w-[18px] h-[18px] text-white" />
                  </div>
                );
              } else {
                senderName = caseDetails?.userId?.name || caseDetails?.userId?.githubUsername || "You";
                senderAvatar = caseDetails?.userId?.avatar ? (
                  <img src={caseDetails.userId.avatar} alt="User Avatar" className="w-9 h-9 rounded-full shrink-0 object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    <User className="w-[18px] h-[18px] text-zinc-400" />
                  </div>
                );
              }

              return (
                <React.Fragment key={msg._id || msg.id || index}>
                  {showDateSeparator && (
                    <div className="flex justify-center my-6">
                      <div className="px-3 py-1 rounded-full bg-[#1a1a1a] border border-white/5 text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                        {dateSeparatorText}
                      </div>
                    </div>
                  )}
                  {msg.role === 'system' ? (
                    <div className="flex justify-center py-1">
                      <div className="px-4 py-1.5 rounded-full bg-[#1a1a1a] border border-white/5 text-[13px] text-zinc-400 flex items-center gap-2">
                        {msg.content.startsWith('STATUS_CHANGE:followup_created') ? (
                          <React.Fragment>
                            <ExternalLink className="w-3.5 h-3.5" />
                            Follow-up case created: <Link href={`${isAdmin ? '/admin' : '/dashboard'}/support/${msg.content.split(':')[2]}`} className="text-indigo-400 hover:underline">#{msg.content.split(':')[2]}</Link>
                          </React.Fragment>
                        ) : (
                          <React.Fragment>
                            {msg.content === 'STATUS_CHANGE:closed' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            Status changed to {msg.content === 'STATUS_CHANGE:closed' ? 'Closed' : 'Open'}
                          </React.Fragment>
                        )} {(() => {
                          if (!msg.timestamp) return '';
                          const date = new Date(msg.timestamp);
                          const now = new Date();
                          const isToday = date.toDateString() === now.toDateString();
                          const yesterday = new Date();
                          yesterday.setDate(now.getDate() - 1);
                          const isYesterday = date.toDateString() === yesterday.toDateString();
                          const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                          
                          if (isToday) return `today at ${time}`;
                          if (isYesterday) return `yesterday at ${time}`;
                          return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className={`flex flex-col gap-2 ${isSender ? "items-end" : "items-start"}`}>
                    
                    {/* Sender Info (Avatar + Name + Time) */}
                    <div className={`flex items-start gap-3 ${isSender ? "flex-row-reverse" : "flex-row"}`}>
                      <div className="shrink-0">
                        {senderAvatar}
                      </div>
                      <div className={`flex flex-col ${isSender ? "items-end" : "items-start"}`}>
                        <span className="text-[15px] font-medium text-zinc-200">
                          {senderName}
                        </span>
                        <span className="text-[13px] font-normal text-zinc-500">
                          {getFormatTime(msg.timestamp || caseDetails?.updatedAt)}
                        </span>
                      </div>
                    </div>

                    <div className={`w-full max-w-[900px] flex flex-col gap-2 text-[15px] font-normal leading-relaxed text-zinc-200 ${isSender ? "text-right items-end" : "text-left items-start"}`}>
                      
                      {/* Legacy single attachment fallback */}
                      {msg.attachment && (!msg.attachments || msg.attachments.length === 0) && (
                        <div className="mb-2 max-w-[280px]">
                          {msg.attachment.type === 'image' ? (
                            <img 
                              src={msg.attachment.url} 
                              alt="Attachment" 
                              className="max-w-[280px] max-h-[200px] rounded-lg object-cover cursor-pointer border border-white/10 hover:opacity-90 transition-opacity"
                              onClick={() => setLightboxImage(msg.attachment ? { url: msg.attachment.url, name: msg.attachment.name } : null)}
                            />
                          ) : (
                            <button 
                              type="button"
                              onClick={() => handleDownload(msg.attachment!.url, msg.attachment!.name)}
                              className="flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg p-3 transition-colors text-left max-w-full shadow-md"
                            >
                              <div className="w-10 h-10 rounded bg-zinc-900 flex items-center justify-center shrink-0 border border-white/5">
                                <FileText className="w-5 h-5 text-zinc-300" />
                              </div>
                              <div className="flex flex-col overflow-hidden text-left max-w-[180px]">
                                <span className="text-sm font-medium text-zinc-100 truncate">{msg.attachment.name}</span>
                                <span className="text-xs text-zinc-400">File Attachment</span>
                              </div>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Multiple attachments mapping */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={`flex flex-col gap-2 mb-2 w-full ${isSender ? 'items-end' : 'items-start'}`}>
                          {msg.attachments.map((att, attIdx) => (
                            <div key={attIdx} className={att.type === 'image' ? "w-[200px]" : "w-[280px]"}>
                              {att.type === 'image' ? (
                                <img 
                                  src={att.url} 
                                  alt="Attachment" 
                                  className="w-full h-[150px] rounded-lg object-cover cursor-pointer border border-white/10 hover:opacity-90 transition-opacity"
                                  onClick={() => setLightboxImage({ url: att.url, name: att.name })}
                                />
                              ) : (
                                <button 
                                  type="button"
                                  onClick={() => handleDownload(att.url, att.name)}
                                  className="flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg p-3 transition-colors text-left max-w-full w-full shadow-md"
                                >
                                  <div className="w-10 h-10 rounded bg-zinc-900 flex items-center justify-center shrink-0 border border-white/5">
                                    <FileText className="w-5 h-5 text-zinc-300" />
                                  </div>
                                  <div className="flex flex-col overflow-hidden text-left flex-1">
                                    <span className="text-sm font-medium text-zinc-100 truncate">{att.name}</span>
                                    <span className="text-xs text-zinc-400">File Attachment</span>
                                  </div>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.content && msg.content !== "Sent an attachment" && (
                        index === 0 && msg.role === 'user' && msg.content.startsWith("**Problem Area**") ? (() => {
                          const parts = msg.content.split('\n\n');
                          const problemArea = parts[0]?.split('\n')[1] || 'General';
                          const severity = parts[1]?.split('\n')[1] || 'Medium';
                          const subject = parts[2]?.split('\n')[1] || 'No subject';
                          const description = parts.slice(3).join('\n\n').replace('**Description**\n', '') || '';
                          
                          return (
                            <div className="bg-[#111111] border border-white/10 rounded-lg p-4 mt-1 w-full max-w-[460px]">
                              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/5">
                                  <LifeBuoy className="w-4 h-4 text-indigo-400" />
                                  <h3 className="font-medium text-[13px] text-white">Support Request Details</h3>
                              </div>
                              <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-3 text-left">
                                  <div>
                                    <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-0.5">Problem Area</p>
                                    <p className="text-[13px] text-zinc-200 capitalize">{problemArea}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-0.5">Severity Level</p>
                                    <div className="flex items-center gap-1.5">
                                       <span className={`w-1.5 h-1.5 rounded-full ${severity.toLowerCase() === 'high' ? 'bg-red-500' : severity.toLowerCase() === 'medium' ? 'bg-orange-500' : 'bg-blue-500'}`}></span>
                                       <p className="text-[13px] text-zinc-200 capitalize">{severity}</p>
                                    </div>
                                  </div>
                                  <div className="col-span-2">
                                    <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-0.5">Subject</p>
                                    <p className="text-[13px] text-zinc-200 font-medium">{subject}</p>
                                  </div>
                              </div>
                              <div className="pt-3 border-t border-white/5 text-left">
                                  <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Description</p>
                                  <div className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                    {description}
                                  </div>
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="prose prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent max-w-none text-inherit text-left">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || "");
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    style={vscDarkPlus as any}
                                    language={match[1]}
                                    PreTag="div"
                                    className={`rounded-lg !my-4 !bg-[#000000] border border-white/10 text-left`}
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, "")}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className="bg-white/10 rounded px-1.5 py-0.5" {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              a: ({ node, ...props }) => <a className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4" target="_blank" rel="noopener noreferrer" {...props} />,
                              p: ({ node, ...props }) => <p className="mb-4 last:mb-0" {...props} />,
                              ul: ({ node, ...props }) => <ul className={`list-disc mb-4 ${isSender ? 'pr-4 text-right' : 'pl-4 text-left'}`} dir={isSender ? 'rtl' : 'ltr'} {...props} />,
                              ol: ({ node, ...props }) => <ol className={`list-decimal mb-4 ${isSender ? 'pr-4 text-right' : 'pl-4 text-left'}`} dir={isSender ? 'rtl' : 'ltr'} {...props} />,
                              li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                              strong: ({ node, ...props }) => <strong className="font-semibold text-white" {...props} />,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-zinc-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-[13px]">Awaiting response...</span>
            </div>
          )}



        </div>
      </div>

      {/* Sticky Input Area */}
      <div className="shrink-0 bg-[#000000] pt-4 pb-6 px-8 relative z-20">
        <div className="max-w-[800px] w-full mx-auto">
          {caseDetails?.status === 'closed' ? (
            <div className="border border-white/10 rounded-xl p-6 bg-[#050505]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[14px] text-zinc-300">Need further help with this case?</span>
                <button 
                  onClick={handleCreateFollowUp}
                  disabled={isCreatingFollowUp}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 transition-colors text-black text-[13px] font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingFollowUp && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isCreatingFollowUp ? 'Creating...' : 'Create Follow-Up'}
                </button>
              </div>
              <div className="relative opacity-30 pointer-events-none mt-6">
                <div className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3.5 text-[14px] text-zinc-500 flex items-center">
                  Send a message...
                </div>
              </div>
            </div>
          ) : (
            <form 
              onSubmit={handleSubmit} 
              className="border border-white/10 rounded-xl bg-[#0a0a0a] flex flex-col focus-within:border-zinc-500 transition-colors relative"
            >
              {attachments.length > 0 && (
                <div className="px-4 pt-3 pb-1 flex items-center gap-2 flex-wrap">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-1.5 text-[13px]">
                      <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-zinc-300 truncate max-w-[150px]">{att.name}</span>
                      <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="ml-2 text-zinc-500 hover:text-zinc-300">
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {isUploading && (
                <div className="px-4 pt-3 pb-1 text-[13px] text-zinc-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading file...
                </div>
              )}
              
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if ((input.trim() || attachments.length > 0) && !isLoading && !isUploading) {
                      handleSubmit(e as any);
                    }
                  }
                }}
                placeholder="Send a message..."
                disabled={isLoading || isUploading}
                rows={1}
                maxLength={4000}
                className="w-full bg-transparent border-none text-[15px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-0 disabled:opacity-50 px-4 pt-3 pb-3 resize-none min-h-[44px] max-h-[160px] overflow-y-auto"
              />
              
              <div className="flex items-center justify-between px-3 pb-2 pt-0">
                <input type="file" ref={fileInputRef} hidden multiple onChange={handleFileUpload} disabled={attachments.length >= 5 || isUploading || isLoading} />
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/5 disabled:opacity-50" disabled={attachments.length >= 5 || isUploading || isLoading}>
                    <Paperclip className="w-[18px] h-[18px]" />
                  </button>
                  {attachments.length >= 5 && (
                    <span className="text-[12px] text-amber-500/80 font-medium">Max 5 attachments</span>
                  )}
                </div>
                
                <button
                  type="submit"
                  disabled={(!input.trim() && attachments.length === 0) || isLoading || isUploading}
                  className="w-8 h-8 rounded-full bg-[#1a1a1a] hover:bg-white/10 border border-white/10 text-zinc-300 flex items-center justify-center transition-all disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 10 7-7 7 7"/>
                    <path d="M12 21V3"/>
                  </svg>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="relative flex flex-col items-end">
            <div className="flex items-center gap-2 mb-3">
               <button 
                 onClick={() => handleDownload(lightboxImage.url, lightboxImage.name)}
                 className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10 flex items-center justify-center"
                 title="Download"
               >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                 </svg>
               </button>
               <button 
                 onClick={() => setLightboxImage(null)}
                 className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10 flex items-center justify-center"
                 title="Close"
               >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               </button>
            </div>
            <img src={lightboxImage.url} alt="Fullscreen Attachment" className="max-w-[80vw] max-h-[80vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
