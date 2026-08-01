"use client";

import React from 'react';
import { CalendarClock, CheckCircle2, AlertCircle } from 'lucide-react';

interface TimestampBadgeProps {
  timestamp?: string | number | null;
  label?: string;
  className?: string;
}

export function TimestampBadge({ 
  timestamp, 
  label = "Tanggal Olahan Terakhir",
  className = "" 
}: TimestampBadgeProps) {
  const formatTimestamp = (ts: string | number | undefined | null) => {
    if (!ts) return null;
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return String(ts);
      return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }) + " WIB";
    } catch {
      return String(ts);
    }
  };

  const formatted = formatTimestamp(timestamp);

  return (
    <div className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full border bg-card/60 backdrop-blur-md shadow-sm text-xs font-semibold tracking-wide transition-all ${className} ${
      formatted 
        ? "border-primary/30 text-foreground bg-gradient-to-r from-primary/10 via-transparent to-primary/5 hover:border-primary/50" 
        : "border-border text-muted-foreground"
    }`}>
      {formatted ? (
        <CalendarClock className="w-4 h-4 text-primary animate-pulse shrink-0" />
      ) : (
        <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
      )}
      <span>{label}:</span>
      {formatted ? (
        <span className="text-primary font-mono font-bold">{formatted}</span>
      ) : (
        <span className="text-muted-foreground font-normal italic">Belum ada file upload / olahan terbaru</span>
      )}
    </div>
  );
}
