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
      "glass p-6 rounded-md flex items-start gap-4",
      isAlert ? "glass-alert" : "glass-card",
      className
    )}>
      <div className={cn(
        "p-3 rounded-md",
        isAlert ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
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
