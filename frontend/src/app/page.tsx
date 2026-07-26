"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'AFIF' && password === 'out19') {
      setIsLoading(true);
      localStorage.setItem('isAuthenticated', 'true');
      toast.success('Welcome back, Commander!', { icon: '🚀' });
      router.push('/dashboard');
    } else {
      toast.error('Access Denied. Invalid credentials.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background Graphic */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-1/2 h-1/2 bg-muted rounded-full blur-[120px] opacity-20"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-1/2 h-1/2 bg-primary/20 rounded-full blur-[120px] opacity-20"></div>
      </div>

      <div className="w-full max-w-md z-10 px-4">
        <GlassCard className="p-8 border-border shadow-lg">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-none flex items-center justify-center border border-primary/20 mb-4">
              <Package className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight uppercase">Demand & Supply</h1>
            <p className="text-sm text-muted-foreground mt-1">Enterprise Analytics Platform</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-primary transition text-foreground sm:text-sm outline-none"
                  placeholder="e.g. AFIF"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-primary transition text-foreground sm:text-sm outline-none"
                  placeholder="Enter any password"
                  required
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-none font-medium transition-colors"
              >
                Secure Login
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-border flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4" />
            <span>Encrypted internal system</span>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
