"use client";

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { Toaster } from 'react-hot-toast';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useAuthStore, canAccess } from '@/stores/useAuthStore';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, login } = useAuthStore();

  // Close mobile sidebar whenever route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
          className: '!bg-white !text-slate-900 !border !border-slate-200 !shadow-lg !rounded-xl !backdrop-blur-md',
        }} />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />
      
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Navbar onToggleMobile={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 relative">
          {children}
          <Toaster position="top-right" toastOptions={{
            className: '!bg-white !text-slate-900 !border !border-slate-200 !shadow-lg !rounded-xl !backdrop-blur-md text-xs sm:text-sm',
          }} />
        </main>
      </div>
    </div>
  );
}
