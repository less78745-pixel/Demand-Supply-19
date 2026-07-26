"use client";

import React from 'react';
import { motion } from 'framer-motion';

export function RadarLoader() {
  return (
    <div className="flex flex-col items-center justify-center p-12">
      <div className="relative w-32 h-32 rounded-full border border-cyan-500/30 bg-cyan-950/20 shadow-[0_0_30px_rgba(0,240,255,0.1)] overflow-hidden">
        {/* Radar grid lines */}
        <div className="absolute inset-0 border-2 border-cyan-500/10 rounded-full scale-50"></div>
        <div className="absolute inset-0 border-2 border-cyan-500/10 rounded-full scale-75"></div>
        <div className="absolute inset-0 border-2 border-cyan-500/10 rounded-full"></div>
        <div className="absolute w-full h-px bg-cyan-500/20 top-1/2 -translate-y-1/2"></div>
        <div className="absolute h-full w-px bg-cyan-500/20 left-1/2 -translate-x-1/2"></div>
        
        {/* Radar sweep */}
        <div className="absolute top-0 right-1/2 w-1/2 h-1/2 origin-bottom-right animate-radar-sweep bg-gradient-to-br from-cyan-400/40 to-transparent">
          <div className="absolute right-0 top-0 h-full w-0.5 bg-cyan-400 shadow-[0_0_10px_#00f0ff]"></div>
        </div>

        {/* Pulse blips */}
        <motion.div 
          className="absolute w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_5px_#00f0ff] top-8 right-10"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
        />
        <motion.div 
          className="absolute w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_5px_#10b981] bottom-10 left-8"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: 1.2 }}
        />
      </div>
      <p className="mt-6 text-cyan-400 font-mono text-sm animate-pulse">Training ML Models...</p>
    </div>
  );
}
