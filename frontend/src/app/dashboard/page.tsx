"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import {
  Box, Activity, PackageSearch, ArrowRight, LayoutDashboard, DatabaseZap, Download,
  ClipboardList, TrendingUp, FileBarChart, ShieldCheck, ArrowLeftRight, Ship, Radar,
  LineChart, AlertTriangle, CheckCircle, XCircle, Anchor,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { get } from 'idb-keyval';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { getStandardFilename } from '@/utils/export';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

/* ─── Color Palette ─── */
const BRANCH_COLORS = [
  'hsl(var(--primary))', '#4f46e5', '#059669', '#ea580c',
  '#2563eb', '#db2777', '#65a30d', '#d97706',
];

const STATUS_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444', WARNING: '#f59e0b', SAFE: '#22c55e', OVERSTOCK: '#3b82f6',
};

const ZONE_COLORS: Record<string, string> = {
  RED: '#ef4444', YELLOW: '#f59e0b', GREEN: '#22c55e', BLUE: '#3b82f6',
};

/* ─── Section Header Component ─── */
function SectionHeader({ title, icon: Icon, href, linkLabel = 'Lihat Modul Lengkap', timestamp }: {
  title: string; icon: React.ElementType; href: string; linkLabel?: string; timestamp?: string | number | null;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-t border-border pt-8 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2 uppercase tracking-wide">
          <Icon className="w-5 h-5 text-primary" /> {title}
        </h2>
        <TimestampBadge timestamp={timestamp} label="Olahan Terakhir" className="py-1 px-2.5 text-[11px]" />
      </div>
      <Link href={href} className="text-xs text-primary hover:underline flex items-center gap-1 transition font-bold uppercase tracking-wider shrink-0">
        {linkLabel} <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

/* ─── Empty State for a section ─── */
function EmptySection({ label }: { label: string }) {
  return (
    <div className="p-5 border border-border bg-muted/10 text-muted-foreground text-sm rounded-md">
      Belum ada data {label}.
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function DashboardOverview() {
  /* ─── All module data ─── */
  const [data, setData] = useState<any>({
    occupancy: null, forecast: null, inventory: null,
    soh: null, historySales: null, prUpdate: null,
    safetyStock: null, rebalancing: null, landedCost: null, controlTower: null, trackingContainer: null,
  });
  const [globalCabang, setGlobalCabang] = useState<string[]>(['All']);
  const [isLoading, setIsLoading] = useState(true);

  /* ─── Load all data from localStorage + IndexedDB ─── */
  useEffect(() => {
    const loadData = async () => {
      try {
        // localStorage sources
        const occData = JSON.parse(localStorage.getItem('lastOccupancy') || 'null');
        const invData = occData?.inventory_analysis || JSON.parse(localStorage.getItem('lastInventory') || 'null');
        const fcData = JSON.parse(localStorage.getItem('lastForecast') || 'null');
        const ssData = JSON.parse(localStorage.getItem('lastSafetyStock') || 'null');
        const rbData = JSON.parse(localStorage.getItem('lastRebalancing') || 'null');
        const lcData = JSON.parse(localStorage.getItem('lastLandedCost') || 'null');
        const ctData = JSON.parse(localStorage.getItem('lastControlTower') || 'null');
        const tcLocal = JSON.parse(localStorage.getItem('last_tracking_containers') || 'null');

        // IndexedDB sources (idb-keyval)
        let sohData = null;
        let hsData = null;
        let prData = null;
        let tcData = tcLocal;
        try { sohData = await get('last_soh_data'); } catch {}
        try { hsData = await get('last_history_sales'); } catch {}
        try { prData = await get('last_pr_update'); } catch {}
        try { 
          const dbTc = await get('last_tracking_containers_v2'); 
          if (dbTc) tcData = dbTc;
        } catch {}

        setData({
          occupancy: occData, forecast: fcData, inventory: invData,
          soh: sohData, historySales: hsData, prUpdate: prData,
          safetyStock: ssData, rebalancing: rbData, landedCost: lcData, controlTower: ctData,
          trackingContainer: tcData,
        });
      } catch { /* silent */ }
      setIsLoading(false);
    };
    loadData();
  }, []);

  const hasAnyData = Object.values(data).some(Boolean);

  /* ─── Global Cabang Filter ─── */
  const allCabangs = useMemo(() => {
    const s = new Set<string>();
    // Occupancy
    data.occupancy?.daily_data?.forEach((d: any) => s.add(d.cabang));
    // Forecast
    data.forecast?.forecast_data?.forEach((d: any) => s.add(d.cabang));
    // Inventory
    data.inventory?.matrix_data?.forEach((d: any) => s.add(d.cabang));
    // SOH (dynamic CSV columns)
    if (data.soh?.data) {
      const colCab = findCabangColumn(data.soh.headers);
      if (colCab) data.soh.data.forEach((d: any) => { if (d[colCab] && !isGarbage(d[colCab])) s.add(d[colCab]); });
    }
    // History Sales
    if (data.historySales?.data) {
      const colCab = findCabangColumn(data.historySales.headers);
      if (colCab) data.historySales.data.forEach((d: any) => { if (d[colCab] && !isGarbage(d[colCab])) s.add(d[colCab]); });
    }
    // PR Update
    if (data.prUpdate?.data) {
      const colCab = findCabangColumn(data.prUpdate.headers);
      if (colCab) data.prUpdate.data.forEach((d: any) => { if (d[colCab] && !isGarbage(d[colCab])) s.add(d[colCab]); });
    }
    // Safety Stock
    data.safetyStock?.results?.forEach((r: any) => s.add(r.cabang));
    // Rebalancing
    data.rebalancing?.movements?.forEach((m: any) => { s.add(m.from_cabang); s.add(m.to_cabang); });
    // Landed Cost
    data.landedCost?.shipments?.forEach((sh: any) => s.add(sh.cabang_tujuan));
    // Control Tower
    data.controlTower?.branches?.forEach((b: any) => s.add(b.cabang));

    return ['All', ...Array.from(s).filter(Boolean).sort()];
  }, [data]);

  /* ─── Helper: find cabang column in dynamic CSV ─── */
  function findCabangColumn(headers: string[] | undefined): string | undefined {
    if (!headers) return undefined;
    const candidates = ['cabang', 'branch_name', 'branch', 'cab', 'regional', 'region'];
    const hLower = headers.map(h => h.toLowerCase().trim());
    for (const cand of candidates) {
      const idx = hLower.findIndex(h => h.includes(cand));
      if (idx !== -1) return headers[idx];
    }
    return undefined;
  }

  function isGarbage(val: any): boolean {
    if (!val) return true;
    const s = String(val);
    return s.includes('#N/A') || s.includes('#REF!') || s.toLowerCase() === 'semua cabang';
  }

  function matchesCabang(cabang: string | undefined): boolean {
    if (globalCabang.includes('All')) return true;
    return cabang !== undefined && globalCabang.includes(cabang);
  }

  /* ═══ OCCUPANCY ═══ */
  const occSnapshot = useMemo(() => {
    if (!data.occupancy?.daily_data) return null;
    const filtered = data.occupancy.daily_data.filter((d: any) => matchesCabang(d.cabang));
    if (!filtered.length) return { avg: 0, max: 0 };
    const avg = filtered.reduce((a: number, c: any) => a + c.occupancy_pct, 0) / filtered.length;
    const max = Math.max(...filtered.map((d: any) => d.occupancy_pct));
    return { avg: avg.toFixed(1), max: max.toFixed(1) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.occupancy, globalCabang]);

  const occChartData = useMemo(() => {
    const summary: any[] = data.occupancy?.branch_date_summary;
    if (!summary?.length) return { chartRows: [], branches: [] };
    const filtered = summary.filter((d: any) => matchesCabang(d.cabang));
    const dateMap: Record<string, any> = {};
    const branchSet = new Set<string>();
    for (const row of filtered) {
      if (!dateMap[row.date]) dateMap[row.date] = { date: row.date };
      dateMap[row.date][row.cabang] = row.total_occupancy_pct || row.occupancy_pct;
      branchSet.add(row.cabang);
    }
    return {
      chartRows: Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)),
      branches: Array.from(branchSet),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.occupancy, globalCabang]);

  /* ═══ FORECAST ═══ */
  const forecastSnapshot = useMemo(() => {
    if (!data.forecast) return null;
    const fcData = data.forecast.forecast_data || [];
    const bestModel = data.forecast.best_model || 'SMA-3';
    const tally: Record<string, number> = data.forecast.model_tally || {};
    const cabangMap: Record<string, { actuals: number[], preds: number[] }> = {};
    for (const row of fcData) {
      if (!matchesCabang(row.cabang)) continue;
      if (!cabangMap[row.cabang]) cabangMap[row.cabang] = { actuals: [], preds: [] };
      cabangMap[row.cabang].actuals.push(row.actual);
      const pred = row.forecasts?.[bestModel];
      if (pred != null) cabangMap[row.cabang].preds.push(pred);
    }
    const chartRows = Object.entries(cabangMap).map(([cab, v]) => ({
      cabang: cab,
      'Avg Actual': Math.round(v.actuals.reduce((a, b) => a + b, 0) / (v.actuals.length || 1)),
      [`Forecast (${bestModel})`]: Math.round(v.preds.reduce((a, b) => a + b, 0) / (v.preds.length || 1)),
    }));
    return { bestModel, tally, chartRows, insights: data.forecast.ai_insights || [], kpis: data.forecast.inventory_kpis };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.forecast, globalCabang]);

  /* ═══ INVENTORY ═══ */
  const invSnapshot = useMemo(() => {
    if (!data.inventory?.matrix_data) return null;
    const filtered = data.inventory.matrix_data.filter((d: any) => matchesCabang(d.cabang));
    return {
      total: filtered.length,
      aClass: filtered.filter((d: any) => d.abc === 'A').length,
      dead: filtered.filter((d: any) => d.doh > 90).length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.inventory, globalCabang]);

  /* ═══ SOH & TO ═══ */
  const sohSnapshot = useMemo(() => {
    if (!data.soh?.data || !data.soh?.targetColumns) return null;
    const colCab = findCabangColumn(data.soh.headers);
    const filtered = data.soh.data.filter((d: any) => !colCab || matchesCabang(d[colCab]));
    const topMetrics = data.soh.targetColumns.slice(0, 4).map((tc: any) => {
      const total = filtered.reduce((a: number, d: any) => a + (d[tc.name] || 0), 0);
      return { name: tc.name, total };
    });
    return { totalRows: filtered.length, metrics: topMetrics };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.soh, globalCabang]);

  /* ═══ HISTORY SALES ═══ */
  const historySalesSnapshot = useMemo(() => {
    if (!data.historySales?.data || !data.historySales?.targetColumns) return null;
    const colCab = findCabangColumn(data.historySales.headers);
    const filtered = data.historySales.data.filter((d: any) => !colCab || matchesCabang(d[colCab]));
    const topMetrics = data.historySales.targetColumns.slice(0, 4).map((tc: any) => {
      const total = filtered.reduce((a: number, d: any) => a + (d[tc.name] || 0), 0);
      return { name: tc.name, total };
    });
    return { totalRows: filtered.length, metrics: topMetrics };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.historySales, globalCabang]);

  /* ═══ PR UPDATE ═══ */
  const prSnapshot = useMemo(() => {
    if (!data.prUpdate?.data) return null;
    const colCab = findCabangColumn(data.prUpdate.headers);
    const colStatus = data.prUpdate.headers?.find((h: string) =>
      ['status compile', 'status'].includes(h.toLowerCase())
    );
    const filtered = data.prUpdate.data.filter((d: any) => !colCab || matchesCabang(d[colCab]));
    const statusMap: Record<string, number> = {};
    for (const row of filtered) {
      const stat = colStatus ? (row[colStatus] || 'Unknown') : 'Total';
      statusMap[stat] = (statusMap[stat] || 0) + 1;
    }
    return { totalRows: filtered.length, statuses: statusMap };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.prUpdate, globalCabang]);

  /* ═══ TRACKING CONTAINER ═══ */
  const trackingContainerSnapshot = useMemo(() => {
    if (!data.trackingContainer?.containers || !Array.isArray(data.trackingContainer.containers)) return null;
    const filtered = data.trackingContainer.containers.filter((c: any) => !c.cabang || matchesCabang(c.cabang));
    const transit = filtered.filter((c: any) => c.status === "Sedang Berlayar").length;
    const delay = filtered.filter((c: any) => c.status === "Estimasi Delay" || (c.eta && c.status !== "Tiba di Pelabuhan" && c.status !== "Selesai/Diambil" && (new Date(c.eta).getTime() - Date.now()) < 0)).length;
    const arrived = filtered.filter((c: any) => c.status === "Tiba di Pelabuhan" || c.status === "Selesai/Diambil").length;
    return { total: filtered.length, transit, delay, arrived };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.trackingContainer, globalCabang]);

  /* ═══ SAFETY STOCK ═══ */
  const safetyStockSnapshot = useMemo(() => {
    if (!data.safetyStock?.results) return null;
    const filtered = data.safetyStock.results.filter((r: any) => matchesCabang(r.cabang));
    const critical = filtered.filter((r: any) => r.status === 'CRITICAL').length;
    const warning = filtered.filter((r: any) => r.status === 'WARNING').length;
    const safe = filtered.filter((r: any) => r.status === 'SAFE').length;
    const overstock = filtered.filter((r: any) => r.status === 'OVERSTOCK').length;
    return { total: filtered.length, critical, warning, safe, overstock };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.safetyStock, globalCabang]);

  /* ═══ REBALANCING ═══ */
  const rebalancingSnapshot = useMemo(() => {
    if (!data.rebalancing?.movements) return null;
    const filtered = data.rebalancing.movements.filter((m: any) =>
      matchesCabang(m.from_cabang) || matchesCabang(m.to_cabang)
    );
    const totalQty = filtered.reduce((a: number, m: any) => a + (m.qty || 0), 0);
    const totalCost = filtered.reduce((a: number, m: any) => a + (m.total_cost || 0), 0);
    return { totalMovements: filtered.length, totalQty, totalCost };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.rebalancing, globalCabang]);

  /* ═══ LANDED COST ═══ */
  const landedCostSnapshot = useMemo(() => {
    if (!data.landedCost?.shipments) return null;
    const filtered = data.landedCost.shipments.filter((s: any) => matchesCabang(s.cabang_tujuan));
    const demurrageRisk = filtered.filter((s: any) => s.demurrage_risk).length;
    const totalCost = filtered.reduce((a: number, s: any) => a + (s.total_landed_cost_usd || 0), 0);
    return { totalShipments: filtered.length, demurrageRisk, totalCost };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.landedCost, globalCabang]);

  /* ═══ CONTROL TOWER ═══ */
  const controlTowerSnapshot = useMemo(() => {
    if (!data.controlTower?.branches) return null;
    const filtered = data.controlTower.branches.filter((b: any) => matchesCabang(b.cabang));
    const zones = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
    const avgHealth = filtered.length
      ? (filtered.reduce((a: number, b: any) => a + (b.health_score || 0), 0) / filtered.length).toFixed(1)
      : '0';
    for (const b of filtered) {
      const z = b.zone?.toUpperCase();
      if (z && z in zones) zones[z as keyof typeof zones]++;
    }
    return { total: filtered.length, avgHealth, zones };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.controlTower, globalCabang]);

  /* ─── CSV Export ─── */
  const handleExport = () => {
    const lines: string[] = [];
    lines.push('--- EXECUTIVE DASHBOARD REPORT ---');
    lines.push(`Export Date,${new Date().toLocaleString()}`);
    lines.push(`Filter Cabang,${globalCabang.join('; ')}`);
    lines.push('');

    if (occSnapshot) {
      lines.push('--- OCCUPANCY ---');
      lines.push(`Avg Occupancy,${occSnapshot.avg}%`);
      lines.push(`Max Occupancy,${occSnapshot.max}%`);
      lines.push('');
    }
    if (forecastSnapshot) {
      lines.push('--- FORECAST ---');
      lines.push(`Best Model,${forecastSnapshot.bestModel}`);
      lines.push(`Avg Safety Stock,${forecastSnapshot.kpis?.avg_safety_stock || 0}`);
      lines.push(`Avg Reorder Point,${forecastSnapshot.kpis?.avg_reorder_point || 0}`);
      lines.push('');
    }
    if (invSnapshot) {
      lines.push('--- INVENTORY ---');
      lines.push(`Total Kategori,${invSnapshot.total}`);
      lines.push(`Kelas A,${invSnapshot.aClass}`);
      lines.push(`Dead Stock,${invSnapshot.dead}`);
      lines.push('');
    }
    if (sohSnapshot) {
      lines.push('--- SOH & TO ---');
      lines.push(`Total Rows,${sohSnapshot.totalRows}`);
      sohSnapshot.metrics.forEach((m: any) => lines.push(`${m.name},${m.total}`));
      lines.push('');
    }
    if (historySalesSnapshot) {
      lines.push('--- HISTORY SALES ---');
      lines.push(`Total Rows,${historySalesSnapshot.totalRows}`);
      historySalesSnapshot.metrics.forEach((m: any) => lines.push(`${m.name},${m.total}`));
      lines.push('');
    }
    if (prSnapshot) {
      lines.push('--- PR UPDATE ---');
      lines.push(`Total Rows,${prSnapshot.totalRows}`);
      Object.entries(prSnapshot.statuses).forEach(([k, v]) => lines.push(`${k},${v}`));
      lines.push('');
    }
    if (safetyStockSnapshot) {
      lines.push('--- SAFETY STOCK ---');
      lines.push(`Total SKU,${safetyStockSnapshot.total}`);
      lines.push(`Critical,${safetyStockSnapshot.critical}`);
      lines.push(`Warning,${safetyStockSnapshot.warning}`);
      lines.push(`Safe,${safetyStockSnapshot.safe}`);
      lines.push('');
    }
    if (rebalancingSnapshot) {
      lines.push('--- REBALANCING ---');
      lines.push(`Total Movements,${rebalancingSnapshot.totalMovements}`);
      lines.push(`Total Qty,${rebalancingSnapshot.totalQty}`);
      lines.push(`Total Cost,${rebalancingSnapshot.totalCost}`);
      lines.push('');
    }
    if (landedCostSnapshot) {
      lines.push('--- LANDED COST ---');
      lines.push(`Total Shipments,${landedCostSnapshot.totalShipments}`);
      lines.push(`Demurrage Risk,${landedCostSnapshot.demurrageRisk}`);
      lines.push(`Total Cost USD,${landedCostSnapshot.totalCost}`);
      lines.push('');
    }
    if (controlTowerSnapshot) {
      lines.push('--- CONTROL TOWER ---');
      lines.push(`Total Cabang,${controlTowerSnapshot.total}`);
      lines.push(`Avg Health Score,${controlTowerSnapshot.avgHealth}`);
      lines.push(`RED,${controlTowerSnapshot.zones.RED}`);
      lines.push(`GREEN,${controlTowerSnapshot.zones.GREEN}`);
      lines.push('');
    }

    if (lines.length <= 4) {
      toast.error('Tidak ada data yang bisa di-export');
      return;
    }

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getStandardFilename("Executive_Dashboard", new Date().toISOString(), "csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Dashboard report exported!');
  };

  /* ─── Loading State ─── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">

      {/* ═══ HEADER ═══ */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
            <LayoutDashboard className="w-8 h-8 text-primary" />
            Executive Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Overview ringkasan dari semua modul Supply Chain Analytics.
          </p>
        </div>
        {hasAnyData && (
          <div className="flex flex-wrap items-center gap-3">
            <MultiSelect
              options={allCabangs}
              selected={globalCabang}
              onChange={setGlobalCabang}
              selectAllLabel="Semua Cabang"
            />
            <button onClick={handleExport} className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" /> Export Dashboard
            </button>
          </div>
        )}
      </header>

      {!hasAnyData ? (
        <GlassCard className="text-center py-24 border-dashed border-2 flex flex-col items-center justify-center">
          <DatabaseZap className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Belum Ada Analisa</h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Jalankan analisa di salah satu modul agar ringkasan muncul di sini.
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <Link href="/kalkulator-dsp/occupancy" className="px-5 py-2.5 bg-background border border-border hover:border-primary text-sm font-medium transition flex items-center gap-2 rounded-none">
              <Box className="w-4 h-4 text-primary" /> Run Occupancy
            </Link>
            <Link href="/kalkulator-dsp/forecast" className="px-5 py-2.5 bg-background border border-border hover:border-primary text-sm font-medium transition flex items-center gap-2 rounded-none">
              <Activity className="w-4 h-4 text-primary" /> Run Forecast
            </Link>
            <Link href="/dashboard-harian/soh-to-analysis" className="px-5 py-2.5 bg-background border border-border hover:border-primary text-sm font-medium transition flex items-center gap-2 rounded-none">
              <ClipboardList className="w-4 h-4 text-primary" /> Run SOH
            </Link>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-10 animate-in fade-in duration-700">

          {/* ═══ 1. OCCUPANCY & INVENTORY ═══ */}
          <section>
            <SectionHeader title="Occupancy & Inventory" icon={Activity} href="/kalkulator-dsp/occupancy" timestamp={data.occupancy?.processed_at || data.inventory?.processed_at} />
            {occSnapshot ? (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 flex flex-col gap-4">
                  <KPICard title="Avg Occupancy" value={`${occSnapshot.avg}%`} icon={<Box />} />
                  <KPICard title="Max Occupancy Hit" value={`${occSnapshot.max}%`} icon={<Activity />}
                    isAlert={Number(occSnapshot.max) > 90} />
                  {invSnapshot && (
                    <>
                      <KPICard title="Total Kategori" value={invSnapshot.total} icon={<PackageSearch />} />
                      <KPICard title="Dead Stock (>90d)" value={invSnapshot.dead} icon={<AlertTriangle />}
                        isAlert={invSnapshot.dead > 0} />
                    </>
                  )}
                </div>
                <div className="lg:col-span-2">
                  {occChartData.chartRows.length > 0 ? (
                    <GlassCard className="h-full min-h-[320px] flex flex-col">
                      <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                        Total Occupancy per Cabang per Tanggal
                      </h3>
                      <div className="flex-1 min-h-[270px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={occChartData.chartRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} formatter={(value: any) => [`${Number(value).toFixed(2)}%`]} />
                            <Legend />
                            <ReferenceLine y={100} stroke="hsl(var(--destructive))" strokeDasharray="4 2" />
                            <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="4 2" />
                            {occChartData.branches.map((branch: string, idx: number) => (
                              <Bar key={branch} dataKey={branch} name={branch} fill={BRANCH_COLORS[idx % BRANCH_COLORS.length]} radius={[2, 2, 0, 0]} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </GlassCard>
                  ) : (
                    <GlassCard className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Data cabang tidak tersedia untuk filter ini.
                    </GlassCard>
                  )}
                </div>
              </div>
            ) : <EmptySection label="occupancy" />}
          </section>

          {/* ═══ 2. SALES FORECASTING ═══ */}
          <section>
            <SectionHeader title="Sales Forecasting" icon={LineChart} href="/kalkulator-dsp/forecast" timestamp={data.forecast?.processed_at} />
            {forecastSnapshot ? (
              <div className="space-y-6">
                <div className="grid md:grid-cols-4 gap-4">
                  <KPICard title="Best Model" value={forecastSnapshot.bestModel} icon={<Activity />} />
                  <KPICard title="Avg Safety Stock" value={forecastSnapshot.kpis?.avg_safety_stock || 0} icon={<Box />} />
                  <KPICard title="Avg Reorder Point" value={forecastSnapshot.kpis?.avg_reorder_point || 0} icon={<PackageSearch />} />
                  <KPICard title="Kombinasi DSP" value={Object.values(forecastSnapshot.tally).reduce((a: any, b: any) => a + b, 0)} icon={<DatabaseZap />} />
                </div>
                {forecastSnapshot.chartRows.length > 0 && (
                  <GlassCard className="min-h-[300px] flex flex-col">
                    <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                      Rata-rata Actual vs Forecast per Cabang
                    </h3>
                    <div className="flex-1 min-h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={forecastSnapshot.chartRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                          <Legend />
                          <Bar dataKey="Avg Actual" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
                          <Bar dataKey={`Forecast (${forecastSnapshot.bestModel})`} fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </GlassCard>
                )}
              </div>
            ) : <EmptySection label="forecast" />}
          </section>

          {/* ═══ 3. SOH & TO ANALYSIS ═══ */}
          <section>
            <SectionHeader title="SOH & TO Analysis" icon={ClipboardList} href="/dashboard-harian/soh-to-analysis" timestamp={data.soh?.processed_at} />
            {sohSnapshot ? (
              <div className="grid md:grid-cols-5 gap-4">
                {sohSnapshot.metrics.map((m: any, idx: number) => (
                  <KPICard key={idx} title={m.name} value={m.total.toLocaleString('id-ID')} icon={<Box />} />
                ))}
                <KPICard title="Total Rows" value={sohSnapshot.totalRows.toLocaleString()} icon={<ClipboardList />} />
              </div>
            ) : <EmptySection label="SOH & TO" />}
          </section>

          {/* ═══ 4. HISTORY SALES-OUTSTANDING ═══ */}
          <section>
            <SectionHeader title="History Sales-Outstanding" icon={TrendingUp} href="/dashboard-harian/history-sales" timestamp={data.historySales?.processed_at} />
            {historySalesSnapshot ? (
              <div className="grid md:grid-cols-5 gap-4">
                {historySalesSnapshot.metrics.map((m: any, idx: number) => (
                  <KPICard key={idx} title={m.name} value={m.total.toLocaleString('id-ID')} icon={<TrendingUp />} />
                ))}
                <KPICard title="Total Rows" value={historySalesSnapshot.totalRows.toLocaleString()} icon={<TrendingUp />} />
              </div>
            ) : <EmptySection label="History Sales" />}
          </section>

          {/* ═══ 5. PR UPDATE ═══ */}
          <section>
            <SectionHeader title="PR Update" icon={FileBarChart} href="/dashboard-harian/pr-update" timestamp={data.prUpdate?.processed_at} />
            {prSnapshot ? (
              <div className="grid md:grid-cols-5 gap-4">
                <KPICard title="Total PR Entries" value={prSnapshot.totalRows.toLocaleString()} icon={<FileBarChart />} />
                {Object.entries(prSnapshot.statuses).slice(0, 4).map(([status, count], idx) => (
                  <KPICard key={idx} title={status} value={Number(count).toLocaleString()} icon={<FileBarChart />} />
                ))}
              </div>
            ) : <EmptySection label="PR Update" />}
          </section>

          {/* ═══ TRACKING CONTAINER ═══ */}
          <section>
            <SectionHeader title="Tracking Container" icon={Anchor} href="/dashboard-harian/tracking-container" timestamp={data.trackingContainer?.processed_at} />
            {trackingContainerSnapshot ? (
              <div className="grid md:grid-cols-4 gap-4">
                <KPICard title="Total Kontainer" value={trackingContainerSnapshot.total} icon={<Anchor />} />
                <KPICard title="Sedang Berlayar" value={trackingContainerSnapshot.transit} icon={<Ship />} />
                <KPICard title="Delay / Lewat ETA" value={trackingContainerSnapshot.delay} icon={<AlertTriangle />} isAlert={trackingContainerSnapshot.delay > 0} />
                <KPICard title="Tiba / Selesai" value={trackingContainerSnapshot.arrived} icon={<CheckCircle />} />
              </div>
            ) : <EmptySection label="Tracking Container" />}
          </section>

          {/* ═══ SAFETY STOCK & ROP ═══ */}
          <section>
            <SectionHeader title="Safety Stock & ROP" icon={ShieldCheck} href="/scm-analytic/safety-stock" timestamp={data.safetyStock?.processed_at} />
            {safetyStockSnapshot ? (
              <div className="grid md:grid-cols-5 gap-4">
                <KPICard title="Total SKU" value={safetyStockSnapshot.total} icon={<ShieldCheck />} />
                <KPICard title="Critical" value={safetyStockSnapshot.critical} icon={<XCircle />} isAlert={safetyStockSnapshot.critical > 0} />
                <KPICard title="Warning" value={safetyStockSnapshot.warning} icon={<AlertTriangle />} />
                <KPICard title="Safe" value={safetyStockSnapshot.safe} icon={<CheckCircle />} />
                <KPICard title="Overstock" value={safetyStockSnapshot.overstock} icon={<Box />} />
              </div>
            ) : <EmptySection label="Safety Stock" />}
          </section>

          {/* ═══ 7. STOCK REBALANCING ═══ */}
          <section>
            <SectionHeader title="Stock Rebalancing" icon={ArrowLeftRight} href="/scm-analytic/rebalancing" timestamp={data.rebalancing?.processed_at} />
            {rebalancingSnapshot ? (
              <div className="grid md:grid-cols-3 gap-4">
                <KPICard title="Total Movements" value={rebalancingSnapshot.totalMovements} icon={<ArrowLeftRight />} />
                <KPICard title="Total Qty Transferred" value={rebalancingSnapshot.totalQty.toLocaleString()} icon={<PackageSearch />} />
                <KPICard title="Total Cost" value={`Rp ${rebalancingSnapshot.totalCost.toLocaleString()}`} icon={<Box />} />
              </div>
            ) : <EmptySection label="Rebalancing" />}
          </section>

          {/* ═══ 8. LANDED COST TRACKER ═══ */}
          <section>
            <SectionHeader title="Landed Cost Tracker" icon={Ship} href="/scm-analytic/landed-cost" timestamp={data.landedCost?.processed_at} />
            {landedCostSnapshot ? (
              <div className="grid md:grid-cols-3 gap-4">
                <KPICard title="Total Shipments" value={landedCostSnapshot.totalShipments} icon={<Ship />} />
                <KPICard title="Demurrage Risk" value={landedCostSnapshot.demurrageRisk} icon={<AlertTriangle />} isAlert={landedCostSnapshot.demurrageRisk > 0} />
                <KPICard title="Total Landed Cost" value={`$${landedCostSnapshot.totalCost.toLocaleString()}`} icon={<Box />} />
              </div>
            ) : <EmptySection label="Landed Cost" />}
          </section>

          {/* ═══ 9. CONTROL TOWER ═══ */}
          <section>
            <SectionHeader title="Control Tower" icon={Radar} href="/scm-analytic/control-tower" timestamp={data.controlTower?.processed_at} />
            {controlTowerSnapshot ? (
              <div className="grid md:grid-cols-5 gap-4">
                <KPICard title="Total Cabang" value={controlTowerSnapshot.total} icon={<Radar />} />
                <KPICard title="Avg Health Score" value={controlTowerSnapshot.avgHealth} icon={<Activity />} />
                <KPICard title="🔴 RED Zone" value={controlTowerSnapshot.zones.RED} icon={<XCircle />} isAlert={controlTowerSnapshot.zones.RED > 0} />
                <KPICard title="🟡 YELLOW Zone" value={controlTowerSnapshot.zones.YELLOW} icon={<AlertTriangle />} />
                <KPICard title="🟢 GREEN Zone" value={controlTowerSnapshot.zones.GREEN} icon={<CheckCircle />} />
              </div>
            ) : <EmptySection label="Control Tower" />}
          </section>

        </div>
      )}
    </div>
  );
}
