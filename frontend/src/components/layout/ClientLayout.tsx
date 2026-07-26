"use client";

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { Toaster } from 'react-hot-toast';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Simple mock auth guard
    const isAuth = localStorage.getItem('isAuthenticated');
    if (!isAuth && pathname !== '/') {
      router.push('/');
    }
  }, [pathname, router]);

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) return <div className="h-screen bg-background"></div>;

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
