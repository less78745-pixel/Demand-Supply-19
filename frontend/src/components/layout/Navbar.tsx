"use client";

import React from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useRouter } from 'next/navigation';

export function Navbar() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    logout();
    router.push('/');
  };

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
      <div className="flex items-center gap-4">
        {/* Left side intentionally empty */}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-foreground">{user?.name}</p>
          <p className="text-xs text-primary/80 uppercase tracking-widest font-medium">{user?.role}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout" className="hover:bg-destructive/20 hover:text-destructive transition-colors">
          <LogOut className="h-5 w-5 text-destructive/70" />
        </Button>
      </div>
    </header>
  );
}
