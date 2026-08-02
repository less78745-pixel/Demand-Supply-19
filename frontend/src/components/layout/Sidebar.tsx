"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Activity, LineChart, Package,
  FileBarChart, TrendingUp, ClipboardList,
  Network, ShieldCheck, ArrowLeftRight, Ship, Radar,
  ChevronDown, CalendarClock, Calculator, Layers, Route, Anchor
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore, canAccess } from '@/stores/useAuthStore';

interface MenuItem {
  name: string;
  href: string;
  icon: React.ElementType;
  children?: MenuItem[];
}

const MENU_ITEMS: MenuItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    name: 'Dashboard Data Harian',
    href: '/dashboard-harian',
    icon: CalendarClock,
    children: [
      { name: 'SOH & TO Analysis', href: '/dashboard-harian/soh-to-analysis', icon: ClipboardList },
      { name: 'History Sales-Outstanding', href: '/dashboard-harian/history-sales', icon: TrendingUp },
      { name: 'PR Update', href: '/dashboard-harian/pr-update', icon: FileBarChart },
      { name: 'Tracking Container', href: '/dashboard-harian/tracking-container', icon: Anchor },
    ],
  },
  {
    name: 'Kalkulator DSP',
    href: '/kalkulator-dsp',
    icon: Calculator,
    children: [
      { name: 'Occupancy & Inventory', href: '/kalkulator-dsp/occupancy', icon: Activity },
      { name: 'Sales Forecasting', href: '/kalkulator-dsp/forecast', icon: LineChart },
      { name: 'DDMRP Buffer', href: '/kalkulator-dsp/ddmrp', icon: Layers },
      { name: 'Route Optimization', href: '/kalkulator-dsp/route-optimization', icon: Route },
    ],
  },
  {
    name: 'SCM Analytic',
    href: '/scm-analytic',
    icon: Network,
    children: [
      { name: 'Safety Stock & ROP', href: '/scm-analytic/safety-stock', icon: ShieldCheck },
      { name: 'Stock Rebalancing', href: '/scm-analytic/rebalancing', icon: ArrowLeftRight },
      { name: 'Landed Cost Tracker', href: '/scm-analytic/landed-cost', icon: Ship },
      { name: 'Control Tower', href: '/scm-analytic/control-tower', icon: Radar },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Auto-open groups if user is on a page within them
    return {
      '/dashboard-harian': pathname.startsWith('/dashboard-harian'),
      '/kalkulator-dsp': pathname.startsWith('/kalkulator-dsp'),
      '/scm-analytic': pathname.startsWith('/scm-analytic'),
    };
  });

  const toggleGroup = (href: string) => {
    setOpenGroups((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  // Filter menu items based on user role
  const visibleMenus = MENU_ITEMS.map((item) => {
    if (item.children) {
      const filteredChildren = item.children.filter((child) => canAccess(user?.role, child.href));
      return { ...item, children: filteredChildren };
    }
    return item;
  }).filter((item) => {
    if (item.children) {
      return item.children.length > 0;
    }
    return canAccess(user?.role, item.href);
  });

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
          const hasChildren = item.children && item.children.length > 0;
          const isGroupOpen = openGroups[item.href] ?? false;
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          if (hasChildren) {
            return (
              <div key={item.href}>
                {/* Parent button */}
                <button
                  onClick={() => toggleGroup(item.href)}
                  className={`w-full relative flex items-center px-3 py-2.5 rounded-md transition-all duration-200 ${
                    isActive
                      ? 'text-primary bg-primary/10 font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-parent"
                      className="absolute left-0 w-1 h-full bg-primary rounded-r-full"
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-4 h-4 mr-3 ${isActive ? 'text-primary' : ''}`} />
                  <span className="text-sm tracking-wide flex-1 text-left">{item.name}</span>
                  <motion.div
                    animate={{ rotate: isGroupOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </motion.div>
                </button>

                {/* Children */}
                <AnimatePresence initial={false}>
                  {isGroupOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="ml-4 mt-1 pl-3 border-l border-border/50 space-y-0.5">
                        {item.children!.map((child) => {
                          const isChildActive = pathname === child.href;
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`relative flex items-center px-3 py-2 rounded-md transition-all duration-200 ${
                                isChildActive
                                  ? 'text-primary bg-primary/10 font-semibold'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              }`}
                            >
                              <ChildIcon className={`w-3.5 h-3.5 mr-2.5 ${isChildActive ? 'text-primary' : ''}`} />
                              <span className="text-xs tracking-wide">{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }

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
