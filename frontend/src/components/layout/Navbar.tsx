"use client";

import React from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Navbar() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
      <div className="flex items-center gap-4">
        {/* Left side intentionally empty */}
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
