"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Activity, LineChart, Package,
  FileBarChart, TrendingUp, ClipboardList,
  Network, ShieldCheck, ArrowLeftRight, Ship, Radar,
  ChevronRight, CalendarClock, Calculator, Layers, Route, Anchor, X, MapPin
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
      { name: 'SOH-TO-Vessel', href: '/dashboard-harian/soh-to-analysis', icon: ClipboardList },
      { name: 'History Sales-Outstanding', href: '/dashboard-harian/history-sales', icon: TrendingUp },
      { name: 'PR Update & Tracking Container', href: '/dashboard-harian/pr-update', icon: Anchor },
      { name: 'SKU Velocity', href: '/dashboard-harian/sku-velocity', icon: Activity },
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
      { name: 'WH-TRANS-MP', href: '/kalkulator-dsp/wh-trans-mp', icon: MapPin },
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

export function Sidebar({ mobileOpen = false, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void } = {}) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [activePopup, setActivePopup] = useState<string | null>(null);

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
    <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card/95 lg:bg-card/50 backdrop-blur-xl lg:backdrop-blur-sm flex-shrink-0 min-h-screen flex flex-col border-r border-border transition-transform duration-300 ease-in-out overflow-visible ${
      mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
    }`}>
      {/* Logo Area */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-border">
        <div className="flex items-center">
          <Package className="w-6 h-6 mr-3 text-primary" />
          <div>
            <h1 className="font-bold text-base tracking-tight text-foreground leading-tight">DSP Analytics</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Demand & Supply</p>
          </div>
        </div>
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 -mr-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
        >
          <X className="w-5 h-5" />
        </button>
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
      <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-visible">
        {visibleMenus.map((item) => {
          const hasChildren = item.children && item.children.length > 0;
          const isPopupOpen = activePopup === item.href;
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          if (hasChildren) {
            return (
              <div
                key={item.href}
                className="relative"
                onMouseEnter={() => setActivePopup(item.href)}
                onMouseLeave={() => setActivePopup(null)}
              >
                {/* Parent button */}
                <button
                  onClick={() => setActivePopup(isPopupOpen ? null : item.href)}
                  className={`w-full relative flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 ${
                    isActive || isPopupOpen
                      ? 'text-primary bg-primary/15 font-bold shadow-md shadow-primary/5 border border-primary/30'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-parent"
                      className="absolute left-0 w-1 h-full bg-primary rounded-r-full shadow-md shadow-primary"
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-4 h-4 mr-3 ${isActive || isPopupOpen ? 'text-primary' : ''}`} />
                  <span className="text-sm tracking-wide flex-1 text-left">{item.name}</span>
                  <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${
                    isPopupOpen ? 'rotate-90 lg:rotate-0 lg:translate-x-0.5 text-primary' : ''
                  }`} />
                </button>

                {/* Pop-up Submenu / Flyout Card */}
                <AnimatePresence>
                  {isPopupOpen && (
                    <motion.div
                      initial={{ opacity: 0, x: -8, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="z-50 lg:absolute lg:left-full lg:top-0 lg:pl-3 w-full lg:w-72 mt-1.5 lg:mt-0"
                    >
                      <div className="p-3 bg-card/95 border border-border shadow-[0_15px_40px_rgba(0,0,0,0.15)] rounded-2xl backdrop-blur-2xl text-foreground">
                        <div className="px-2 py-1.5 border-b border-border mb-2 flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-primary" />
                            {item.name}
                          </span>
                          <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                            {item.children!.length} Modul
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          {item.children!.map((child) => {
                            const isChildActive = pathname === child.href;
                            const ChildIcon = child.icon;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => {
                                  setActivePopup(null);
                                  if (onCloseMobile) onCloseMobile();
                                }}
                                className={`group/item flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all duration-200 border ${
                                  isChildActive
                                    ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/25 border-primary scale-[1.02]'
                                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground border-transparent hover:border-border hover:translate-x-1 font-semibold'
                                }`}
                              >
                                <div className={`p-1.5 rounded-lg transition-transform duration-200 ${
                                  isChildActive ? 'bg-white/20 text-white' : 'bg-muted text-primary group-hover/item:scale-110 group-hover/item:bg-primary/15'
                                }`}>
                                  <ChildIcon className="w-4 h-4" />
                                </div>
                                <span className="flex-1 tracking-wide leading-snug">{child.name}</span>
                              </Link>
                            );
                          })}
                        </div>
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
              onClick={() => {
                setActivePopup(null);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`relative flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-primary bg-primary/15 font-bold shadow-md shadow-primary/5 border border-primary/30'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute left-0 w-1 h-full bg-primary rounded-r-full shadow-md shadow-primary"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <Icon className={`w-4 h-4 mr-3 ${isActive ? 'text-primary' : ''}`} />
              <span className="text-sm tracking-wide flex-1">{item.name}</span>
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
