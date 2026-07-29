"use client";

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { Toaster } from 'react-hot-toast';
import { useAuthStore, canAccess } from '@/stores/useAuthStore';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { user, login } = useAuthStore();

  useEffect(() => {
    setMounted(true);

    // Restore user from localStorage
    const isAuth = localStorage.getItem('isAuthenticated');
    const savedUser = localStorage.getItem('authUser');

    if (isAuth && savedUser && !user) {
      try {
        const parsed = JSON.parse(savedUser);
        login(parsed);
      } catch {
        // corrupt data – force re-login
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('authUser');
        if (pathname !== '/') router.push('/');
      }
    } else if (!isAuth && pathname !== '/') {
      router.push('/');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Role-based route guard (runs when user or pathname changes)
  useEffect(() => {
    if (!mounted) return;
    if (pathname === '/') return;

    const isAuth = localStorage.getItem('isAuthenticated');
    if (!isAuth) {
      router.push('/');
      return;
    }

    const currentUser = useAuthStore.getState().user;
    if (currentUser && !canAccess(currentUser.role, pathname)) {
      router.push('/dashboard');
    }
  }, [pathname, mounted, router]);

  if (!mounted) return (
    <div className="h-screen w-full bg-background flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
      <p className="text-muted-foreground animate-pulse font-medium tracking-wide text-sm">Menyiapkan Aplikasi...</p>
    </div>
  );

  const isLoginPage = pathname === '/';

  if (isLoginPage) {
    return (
      <>
        {children}
        <Toaster position="top-right" toastOptions={{
          className: '!bg-slate-800 !text-white !border !border-white/10 !backdrop-blur-md',
        }} />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6 relative">
          {children}
          <Toaster position="top-right" toastOptions={{
            className: '!bg-slate-800 !text-white !border !border-white/10 !backdrop-blur-md',
          }} />
        </main>
      </div>
    </div>
  );
}
