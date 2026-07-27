/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  isAlert?: boolean;
  className?: string;
}

export function KPICard({ title, value, icon, trend, isAlert, className }: KPICardProps) {
  return (
    <div className={cn(
      "glass p-6 rounded-xl flex items-start gap-4 relative overflow-hidden group",
      isAlert ? "glass-alert" : "glass-card hover:border-primary/50 transition-colors duration-300",
      className
    )}>
      <div className="absolute top-0 right-0 p-16 bg-primary/5 rounded-full blur-[40px] pointer-events-none group-hover:bg-primary/10 transition-colors duration-500"></div>
      <div className={cn(
        "p-3 rounded-xl shadow-sm z-10",
        isAlert ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-gradient-to-br from-primary/20 to-primary/5 text-primary border border-primary/20"
      )}>
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground tracking-tight">{value}</span>
          {trend && (
            <span className={cn(
              "text-xs font-medium",
              isAlert ? "text-destructive" : "text-emerald-500"
            )}>
              {trend}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

