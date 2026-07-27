"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverEffect?: boolean;
}

export function GlassCard({ children, className, hoverEffect = false, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        'glass-card rounded-xl p-6 text-foreground relative overflow-hidden',
        hoverEffect && 'glass-card-hover cursor-pointer hover:-translate-y-1',
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50 pointer-events-none"></div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
