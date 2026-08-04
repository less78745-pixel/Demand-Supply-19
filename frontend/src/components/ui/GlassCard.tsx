"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverEffect?: boolean;
  allowOverflow?: boolean;
}

export function GlassCard({ children, className, hoverEffect = false, allowOverflow = false, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        'glass-card rounded-xl p-6 text-foreground relative',
        !allowOverflow && 'overflow-hidden',
        allowOverflow && 'overflow-visible relative z-30',
        hoverEffect && 'glass-card-hover cursor-pointer hover:-translate-y-1',
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50 pointer-events-none"></div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
