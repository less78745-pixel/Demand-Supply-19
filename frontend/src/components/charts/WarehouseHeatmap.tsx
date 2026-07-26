"use client";

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface HeatmapProps {
  data: any[];
}

export function WarehouseHeatmap({ data }: HeatmapProps) {
  // Generate a mock 10x10 warehouse grid
  const grid = useMemo(() => {
    const cells = Array(100).fill(null);
    
    // Distribute actual inventory items onto the grid
    data.forEach((item, index) => {
      // Place A items closer to the front (bottom rows)
      let targetIndex = 0;
      if (item.abc === 'A') {
        targetIndex = 70 + (index % 30); 
      } else if (item.abc === 'B') {
        targetIndex = 40 + (index % 30);
      } else {
        targetIndex = (index % 40);
      }
      
      // Find nearest empty cell
      while(cells[targetIndex] !== null && targetIndex < 100) {
        targetIndex++;
      }
      
      if (targetIndex < 100) {
        cells[targetIndex] = item;
      }
    });
    
    return cells;
  }, [data]);

  return (
    <div className="w-full aspect-square bg-slate-900/80 rounded-xl p-4 border border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      
      <div className="h-full w-full grid grid-cols-10 grid-rows-10 gap-2 relative z-10">
        {grid.map((cell, idx) => {
          let bgColor = "bg-slate-800/50";
          let shadow = "";
          
          if (cell) {
            if (cell.abc === 'A') {
              bgColor = "bg-red-500/80";
              shadow = "shadow-[0_0_15px_rgba(239,68,68,0.8)]";
            } else if (cell.abc === 'B') {
              bgColor = "bg-amber-500/80";
              shadow = "shadow-[0_0_10px_rgba(245,158,11,0.6)]";
            } else {
              bgColor = "bg-cyan-500/60";
              shadow = "shadow-[0_0_5px_rgba(6,182,212,0.4)]";
            }
          }
          
          return (
            <motion.div
              key={idx}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: idx * 0.005 }}
              className={`rounded-sm ${bgColor} ${shadow} flex items-center justify-center group relative cursor-pointer hover:ring-2 hover:ring-white`}
            >
              {cell && (
                <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 text-xs rounded border border-white/10 z-20 shadow-xl pointer-events-none">
                  <p className="font-bold text-white mb-1">{cell.category}</p>
                  <p className="text-slate-300">Class: {cell.class}</p>
                  <p className="text-slate-300">Volume: {cell.volume.toLocaleString()}</p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
      
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center bg-slate-950/80 p-2 rounded border border-white/10 z-20 backdrop-blur">
        <span className="text-xs text-slate-400 font-mono">DOCK DOORS (FRONT)</span>
        <div className="flex gap-4">
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm shadow-[0_0_5px_rgba(239,68,68,0.8)]"></div><span className="text-xs text-slate-300">Fast (A)</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded-sm shadow-[0_0_5px_rgba(245,158,11,0.6)]"></div><span className="text-xs text-slate-300">Med (B)</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-cyan-500 rounded-sm"></div><span className="text-xs text-slate-300">Slow (C)</span></div>
        </div>
      </div>
    </div>
  );
}
