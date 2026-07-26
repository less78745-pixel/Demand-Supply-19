"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Activity, LineChart, Package } from 'lucide-react';
import { motion } from 'framer-motion';

const MENU_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Occupancy & Inventory', href: '/occupancy', icon: Activity },
  { name: 'Sales Forecasting', href: '/forecast', icon: LineChart },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    router.push('/');
  };

  return (
    <aside className="w-64 bg-card flex-shrink-0 min-h-screen flex flex-col z-20 border-r border-border">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <Package className="w-6 h-6 mr-3 text-primary" />
        <h1 className="font-bold text-lg tracking-tight text-foreground">Demand & Supply</h1>
      </div>
      
      <nav className="flex-1 py-6 px-3 space-y-1">
        {MENU_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center px-3 py-3 rounded-md transition-all duration-200 ${
                isActive 
                  ? 'text-primary bg-primary/10 font-semibold' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute left-0 w-1 h-full bg-primary rounded-r-full"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-primary' : ''}`} />
              <span className="text-sm tracking-wide">{item.name}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-border space-y-3">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 hover:border-destructive/50 transition rounded-md text-sm font-medium"
        >
          Logout
        </button>
        <p className="text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} DSP Analytics
        </p>
      </div>
    </aside>
  );
}
