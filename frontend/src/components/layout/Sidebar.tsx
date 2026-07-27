"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Activity, LineChart, Package,
  FileBarChart, TrendingUp, ClipboardList
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore, canAccess } from '@/stores/useAuthStore';

const MENU_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Occupancy & Inventory', href: '/occupancy', icon: Activity },
  { name: 'Sales Forecasting', href: '/forecast', icon: LineChart },
  { name: 'SOH & TO Analysis', href: '/soh-to-analysis', icon: ClipboardList },
  { name: 'History Sales-Outstanding', href: '/history-sales', icon: TrendingUp },
  { name: 'PR Update', href: '/pr-update', icon: FileBarChart },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  // Filter menu items based on user role
  const visibleMenus = MENU_ITEMS.filter((item) =>
    canAccess(user?.role, item.href)
  );

  return (
    <aside className="w-64 bg-card/50 backdrop-blur-sm flex-shrink-0 min-h-screen flex flex-col z-20 border-r border-border">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <Package className="w-6 h-6 mr-3 text-primary" />
        <div>
          <h1 className="font-bold text-base tracking-tight text-foreground leading-tight">DSP Analytics</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Demand & Supply</p>
        </div>
      </div>

      {/* User Info */}
      {user && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">{user.name.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-[10px] text-primary/80 uppercase tracking-widest font-medium">{user.role}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {visibleMenus.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center px-3 py-2.5 rounded-md transition-all duration-200 ${
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
              <Icon className={`w-4 h-4 mr-3 ${isActive ? 'text-primary' : ''}`} />
              <span className="text-sm tracking-wide">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest">
          © {new Date().getFullYear()} DSP Analytics
        </p>
      </div>
    </aside>
  );
}
