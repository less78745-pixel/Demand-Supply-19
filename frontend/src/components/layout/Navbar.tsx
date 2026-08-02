"use client";

import React from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { LogOut, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Navbar({ onToggleMobile }: { onToggleMobile?: () => void }) {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobile}
          className="lg:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-95"
          aria-label="Buka Menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="lg:hidden font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5">
          DSP Analytics
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-foreground">{user?.name}</p>
          <p className="text-[10px] text-primary/80 uppercase tracking-widest font-medium">{user?.role}</p>
        </div>
        <button
          onClick={handleLogout}
          title="Logout"
          className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
