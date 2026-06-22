"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Loader2, Copy, Lock, Unlock, ExternalLink, MoreHorizontal, ChevronDown, LifeBuoy, Paperclip, ArrowUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Link from "next/link";
import { io } from "socket.io-client";

interface ChatMessage {
  id?: string;
  _id?: string;
  role: "user" | "model" | "admin";
  content: string;
  timestamp?: string;
}

interface SupportCase {
  _id: string;
  title: string;
  caseType: string;
  status: string;
  severity: string;
  updatedAt: string;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
          setCaseDetails((prev) => prev ? { ...prev, status: data.status, updatedAt: new Date().toISOString() } : null);
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

  const updateStatus = async (newStatus: string) => {
    setMenuOpen(false);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const endpoint = isAdmin ? `/api/support/admin/cases/${caseId}/status` : `/api/support/cases/${caseId}/status`;
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCaseDetails((prev) => prev ? { ...prev, status: newStatus, updatedAt: new Date().toISOString() } : null);
      }
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || caseDetails?.status === 'closed') return;

    const tempId = Date.now().toString();
    const userMessage: ChatMessage = {
      id: tempId,
      role: isAdmin ? "admin" : "user",
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

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
                  <button className="w-full px-4 py-2.5 text-left text-[13px] text-zinc-300 hover:bg-white/5 flex items-center justify-between transition-colors">
                    Create Follow-Up
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
          <div className="space-y-4 flex-1">
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
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                );
              } else {
                senderName = caseDetails?.userId?.name || caseDetails?.userId?.githubUsername || "You";
                senderAvatar = caseDetails?.userId?.avatar ? (
                  <img src={caseDetails.userId.avatar} alt="User Avatar" className="w-8 h-8 rounded-full shrink-0 object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    <User className="w-4 h-4 text-zinc-400" />
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
                  <div className={`flex flex-col gap-2 ${isSender ? "items-end" : "items-start"}`}>
                  
                  {/* Sender Info (Avatar + Name + Time) */}
                  <div className={`flex items-start gap-3 ${isSender ? "flex-row-reverse" : "flex-row"}`}>
                    <div className="shrink-0">
                      {senderAvatar}
                    </div>
                    <div className={`flex flex-col ${isSender ? "items-end" : "items-start"}`}>
                      <span className="text-[14px] font-medium text-zinc-200">
                        {senderName}
                      </span>
                      <span className="text-[12px] font-normal text-zinc-500">
                        {getFormatTime(msg.timestamp || caseDetails?.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Message Content Area */}
                  <div className={`w-full max-w-[800px] prose prose-invert text-[16px] font-medium leading-relaxed text-zinc-100 ${isSender ? "text-right" : "text-left"}`}>
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
                              className={`rounded-lg !my-4 !bg-[#000000] border border-white/10 text-left ${isSender ? "ml-auto" : ""}`}
                              {...props}
                            >
                              {String(children).replace(/\n$/, "")}
                            </SyntaxHighlighter>
                          ) : (
                            <code className="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-indigo-300 border border-white/5" {...props}>
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
                </div>
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

          {/* Status Event Pill */}
          {caseDetails?.status === 'closed' && (
            <div className="flex justify-center py-6">
              <div className="px-4 py-1.5 rounded-full bg-[#1a1a1a] border border-white/5 text-[13px] text-zinc-400 flex items-center gap-2">
                Status changed to Closed {getTimeAgo(caseDetails.updatedAt).includes('ago') ? getTimeAgo(caseDetails.updatedAt) : 'recently'}
              </div>
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
                <button className="px-4 py-2 bg-white hover:bg-zinc-200 transition-colors text-black text-[13px] font-medium rounded-lg">
                  Create Follow-Up
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
              className="border border-white/10 rounded-xl bg-[#0a0a0a] flex flex-col focus-within:border-zinc-500 transition-colors"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() && !isLoading) {
                      handleSubmit(e as any);
                    }
                  }
                }}
                placeholder="Send a message..."
                disabled={isLoading}
                rows={2}
                className="w-full bg-transparent border-none text-[15px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-0 disabled:opacity-50 px-4 pt-3 pb-0 resize-none"
              />
              
              <div className="flex items-center justify-between px-3 pb-2 pt-0">
                <button type="button" className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/5">
                  <Paperclip className="w-[18px] h-[18px]" />
                </button>
                
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
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
    </div>
  );
}
