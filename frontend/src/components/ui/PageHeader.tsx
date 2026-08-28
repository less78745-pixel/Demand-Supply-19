"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Ikon kecil di badge eyebrow (biasanya sama dengan ikon menu sidebar-nya). */
  icon: React.ElementType;
  /** Label kategori di atas judul, mis. "Dashboard Data Harian". */
  eyebrow: string;
  title: string;
  /** Frasa aksen opsional di akhir judul, mis. "(Integrated Tracker)". */
  highlight?: string;
  description: React.ReactNode;
  /** Slot kanan: TimestampBadge, ExportHtmlButton, dll. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Header modul standar untuk semua halaman dashboard. Dibuat supaya setiap
 * halaman berhenti mengarang skema warna heronya sendiri-sendiri (gradient
 * slate/ungu/amber ad-hoc) -- semua warna di sini murni dari design token
 * (--primary dkk di globals.css), jadi otomatis konsisten lintas modul dan
 * otomatis benar di light/dark mode.
 */
export function PageHeader({ icon: Icon, eyebrow, title, highlight, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl bg-card border border-border shadow-sm p-6 sm:p-8",
      className
    )}>
      <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(hsl(var(--primary))_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

      <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3 min-w-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">
            <Icon className="w-3.5 h-3.5" />
            {eyebrow}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex flex-wrap items-baseline gap-x-2">
            {title}
            {highlight && (
              <span className="text-base sm:text-lg font-semibold text-primary">{highlight}</span>
            )}
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
            {description}
          </p>
        </div>

        {actions && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
