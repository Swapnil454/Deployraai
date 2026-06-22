"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Loader2, Sparkles, ChevronLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Link from "next/link";
import { useParams } from "next/navigation";

interface ChatMessage {
  id?: string;
  _id?: string;
  role: "user" | "model";
  content: string;
  timestamp?: string;
}

export default function SupportChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const params = useParams();
  const caseId = params?.caseId as string;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (caseId) {
      fetchCase();
    }
  }, [caseId]);

  const fetchCase = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/api/support/${caseId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const tempId = Date.now().toString();
    const userMessage: ChatMessage = {
      id: tempId,
      role: "user",
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
        throw new Error("Failed to fetch response");
      }

      const data = await response.json();
      
      setMessages((prev) => [...prev, data.reply]);
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

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full relative bg-[#030305] overflow-hidden">
      {/* Top Navigation */}
      <div className="absolute top-0 left-0 w-full p-4 z-20 flex items-center justify-between pointer-events-none">
        <Link 
          href="/dashboard/support"
          className="pointer-events-auto flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors bg-[#0a0a0c]/80 backdrop-blur-md px-3 py-1.5 rounded-md border border-white/5"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Cases
        </Link>
      </div>

      {/* Dynamic Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-8 py-4 relative z-10 scroll-smooth">
        {isInitializing ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
          </div>
        ) : (
        <div className="max-w-[1000px] mx-auto space-y-6">
          {messages.map((msg, index) => (
            <div
              key={msg._id || msg.id || index}
              className={`flex items-start gap-4 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex shrink-0 items-center justify-center w-8 h-8 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.2)] border ${
                  msg.role === "user"
                    ? "bg-[#2b2d31] border-white/5 text-white"
                    : "bg-transparent border-white/10 text-indigo-400"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </div>

              {/* Message Content */}
              <div
                className={`max-w-[85%] relative ${
                  msg.role === "user"
                    ? "bg-[#2b2d31] text-zinc-100 px-5 pt-3 pb-6 rounded-2xl rounded-tr-sm border border-white/5 shadow-md"
                    : "text-zinc-200 py-1"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent max-w-none text-[15px] marker:text-indigo-400 pb-4">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({node, inline, className, children, ...props}: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <div className="rounded-xl overflow-hidden my-4 border border-zinc-800/80 shadow-2xl">
                              <div className="flex items-center px-4 py-1.5 bg-[#1a1b1e] border-b border-zinc-800/80 text-xs font-mono text-zinc-400">
                                {match[1]}
                              </div>
                              <SyntaxHighlighter
                                {...props}
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{ margin: 0, padding: '1rem', background: '#0d0d0f' }}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code {...props} className="bg-[#1a1b1e] px-1.5 py-0.5 rounded-md text-indigo-300 font-mono text-[13px] border border-white/5">
                              {children}
                            </code>
                          )
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
                {/* WhatsApp style timestamp */}
                {msg.timestamp && (
                  <div className={`absolute bottom-1.5 text-[10px] font-medium text-zinc-500 flex items-center ${
                    msg.role === "user" ? "right-3" : "right-1"
                  }`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-4">
              <div className="flex shrink-0 items-center justify-center w-8 h-8 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.2)] border bg-transparent border-white/10 text-indigo-400 animate-pulse">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-3 relative z-10 py-1.5 px-1">
                <div className="flex gap-1.5 items-end h-4">
                  <div className="w-1.5 bg-indigo-500 rounded-full animate-[bounce_1s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: '0ms' }} />
                  <div className="w-1.5 bg-purple-400 rounded-full animate-[bounce_1s_ease-in-out_infinite]" style={{ height: '100%', animationDelay: '150ms' }} />
                  <div className="w-1.5 bg-blue-500 rounded-full animate-[bounce_1s_ease-in-out_infinite]" style={{ height: '40%', animationDelay: '300ms' }} />
                </div>
                <span className="font-mono text-[13px] text-indigo-300 font-medium tracking-wide">
                  &gt; _ Synthesizing response...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-[#030305]/80 backdrop-blur-xl px-8 py-6 pb-8 relative z-20">
        <div className="max-w-[900px] mx-auto relative group">
          {/* Glowing Aura Behind Input */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
          
          <form
            onSubmit={handleSubmit}
            className="relative flex items-end gap-3 bg-[#0a0a0c] border border-white/10 rounded-xl p-2.5 shadow-2xl transition-all"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Query deployment status, analyze architecture, or ask for guidance..."
              className="flex-1 max-h-32 min-h-[46px] bg-transparent text-white placeholder-zinc-500 resize-none px-4 py-3 focus:outline-none text-[15px] overflow-y-auto leading-relaxed"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-gradient-to-br from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 text-white w-[46px] h-[46px] rounded-lg flex items-center justify-center shrink-0 transition-all shadow-lg mb-0.5 mr-0.5"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5 ml-0.5" />
              )}
            </button>
          </form>
          <div className="text-center mt-4 flex items-center justify-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50"></div>
             <span className="text-[12px] text-zinc-500 font-medium tracking-wide">Enterprise AI Assistant • Context Secure</span>
             <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50"></div>
          </div>
        </div>
      </div>
      
      {/* Global Animation Keyframes */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
}
