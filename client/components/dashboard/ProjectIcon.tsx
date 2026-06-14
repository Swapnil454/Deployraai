"use client";

import React from "react";

export const ProjectIcon = ({ name }: { name: string }) => {
  let gradient = "from-blue-600 to-cyan-400";
  let emoji = "🌟";
  
  if (name.toLowerCase().includes('currency')) {
    gradient = "from-purple-600 to-orange-400";
    emoji = "⚡";
  } else if (name.toLowerCase().includes('rating')) {
    gradient = "from-blue-600 to-cyan-400";
    emoji = "🌟";
  } else {
    const gradients = [
      "from-blue-600 to-cyan-400",
      "from-purple-600 to-orange-400",
      "from-pink-500 to-rose-400",
      "from-emerald-500 to-teal-400",
      "from-amber-500 to-red-400",
      "from-indigo-600 to-purple-400",
    ];
    const emojis = ["🌟", "⚡", "🚀", "🔥", "💎", "🎯", "🎨", "🧩", "🔮", "✨"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    gradient = gradients[Math.abs(hash) % gradients.length];
    emoji = emojis[Math.abs(hash) % emojis.length];
  }
  
  return (
    <div className={`h-full w-full flex items-center justify-center bg-gradient-to-tr ${gradient}`}>
      <span className="text-xl" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{emoji}</span>
    </div>
  );
};
