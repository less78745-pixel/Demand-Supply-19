"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import {
  Radar, Download, AlertTriangle, Activity, Shield,
  Package, XCircle, CheckCircle, Info, TrendingUp
} from 'lucide-react';
import { uploadControlTowerFile } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';

const ZONE_COLORS: Record<string, string> = {
  RED: '#ef4444', YELLOW: '#f59e0b', GREEN: '#22c55e', BLUE: '#3b82f6',
};

const TEMPLATE_CSV = `Cabang,In_Stock_Rate,Days_of_Supply,OTIF_Score,Current_Stock,ROP_Level,Category
Jakarta,95,18,92,50000,12000,Filter
Jakarta,88,12,85,30000,8000,Oil
Surabaya,92,15,90,40000,10000,Filter
Surabaya,85,10,82,25000,7000,Brake
Bandung,90,14,88,35000,9000,Filter
Semarang,87,11,84,28000,7500,Filter
Medan,78,5,75,12000,8000,Filter
Medan,72,4,70,8000,5000,Oil
Makassar,82,8,80,18000,6500,Filter
Palembang,85,9,83,20000,7000,Filter
Denpasar,91,16,89,32000,8500,Filter
Balikpapan,80,7,78,15000,6000,Filter
Manado,65,2,68,5000,7000,Filter
Pontianak,75,6,74,10000,5500,Filter
Banjarmasin,83,9,81,17000,6000,Filter
Lampung,88,13,86,27000,7500,Filter
Padang,79,6,76,11000,5500,Filter
Pekanbaru,81,8,79,14000,5800,Filter
Jambi,77,5,73,9000,5200,Filter
Bengkulu,70,3,65,6000,5000,Filter
Mataram,86,10,84,19000,6200,Filter
Kupang,60,2,55,3000,5000,Filter
Ambon,55,1,50,2000,4500,Filter
Jayapura,50,1,48,1500,4000,Filter
Sorong,58,2,52,2500,4200,Filter
Ternate,62,2,58,3500,4500,Filter
Kendari,74,5,72,8500,5000,Filter
Palu,76,6,74,9500,5300,Filter
Gorontalo,68,3,66,5500,4800,Filter
Cirebon,89,14,87,26000,7200,Filter
Yogyakarta,93,17,91,38000,9500,Filter`;

export default function ControlTowerPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedRegion, setSelectedRegion] = useState<string[]>(['All']);
  const [selectedZone, setSelectedZone] = useState<string[]>(['All']);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastControlTower');
      if (saved) setResults(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Menganalisis health score 28 cabang...', { id: 'ct' });
    try {
      const data = await uploadControlTowerFile(file);
      setResults(data);
      try { localStorage.setItem('lastControlTower', JSON.stringify(data)); } catch {}
      toast.success('Control Tower analysis selesai!', { id: 'ct' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Gagal memproses.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'ct' });
    } finally {
      setIsProcessing(false);
    }
  };

  const regionOptions = useMemo(() => {
    if (!results?.branches) return ['All'];
    const s = new Set<string>();
    results.branches.forEach((b: any) => s.add(b.region));
    return ['All', ...Array.from(s).sort()];
  }, [results]);

  const zoneOptions = ['All', 'RED', 'YELLOW', 'GREEN', 'BLUE'];

  const filtered = useMemo(() => {
    if (!results?.branches) return [];
    return results.branches.filter((b: any) =>
      (selectedRegion.includes('All') || selectedRegion.includes(b.region)) &&
      (selectedZone.includes('All') || selectedZone.includes(b.zone))
    );
  }, [results, selectedRegion, selectedZone]);

  const handleExport = () => {
    if (!filtered.length) { toast.error('Tidak ada data'); return; }
    const lines = ['Cabang,Region,In_Stock_%,DoS,OTIF_%,Health_Score,Zone,Total_Stock'];
    for (const b of filtered) {
      lines.push(`"${b.cabang}","${b.region}",${b.in_stock_rate},${b.days_of_supply},${b.otif_score},${b.health_score},${b.zone},${b.total_stock}`);
    }
    if (results.weekly_actions?.length) {
      lines.push('');
      lines.push('--- REKOMENDASI AKSI MINGGUAN ---');
      results.weekly_actions.forEach((a: string) => lines.push(`"${a}"`));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `SCM_Control_Tower_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Control Tower report exported!');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
            <Radar className="w-8 h-8 text-primary" />
            SCM Control Tower
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Dashboard eksekutif untuk memantau health score supply chain 28 cabang secara real-time.
          </p>
        </div>
        {results && (
          <div className="flex flex-wrap items-center gap-3">
            <MultiSelect options={regionOptions} selected={selectedRegion} onChange={setSelectedRegion} selectAllLabel="Semua Region" />
            <MultiSelect options={zoneOptions} selected={selectedZone} onChange={setSelectedZone} selectAllLabel="Semua Zone" />
            <button onClick={handleExport} className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" /> Export Report
            </button>
          </div>
        )}
      </header>

      {!results && (
        <GlassCard>
          <FileUploader
            onFileUpload={handleFileUpload}
            isLoading={isProcessing}
            label="Upload Data Branch Health"
            description="Upload file dengan kolom: Cabang, In_Stock_Rate, Days_of_Supply, OTIF_Score. Opsional: Current_Stock, ROP_Level, Category."
            templateCsv={TEMPLATE_CSV}
            templateName="template_branch_health.csv"
          />
        </GlassCard>
      )}

      {results && (
        <div className="space-y-8 animate-in fade-in duration-700">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard title="Avg Health Score" value={`${results.kpi.avg_health}%`} icon={<Shield />} />
            <KPICard title="Avg In-Stock" value={`${results.kpi.avg_in_stock}%`} icon={<Activity />} />
            <KPICard title="Avg DoS" value={`${results.kpi.avg_dos} hr`} icon={<Package />} />
            <KPICard title="Critical" value={results.kpi.critical_count} icon={<XCircle />} isAlert={results.kpi.critical_count > 0} />
            <KPICard title="Avg OTIF" value={`${results.kpi.avg_otif}%`} icon={<TrendingUp />} />
          </div>

          {/* Weekly Actions */}
          {results.weekly_actions.length > 0 && (
            <GlassCard className="border-primary/30 bg-primary/5">
              <h3 className="text-sm font-bold text-primary mb-3 uppercase tracking-wide">
                Rekomendasi Aksi Mingguan
              </h3>
              <div className="space-y-2">
                {results.weekly_actions.map((action: string, i: number) => (
                  <p key={i} className="text-sm text-foreground leading-relaxed">{action}</p>
                ))}
              </div>
            </GlassCard>
          )}

          {/* DDMRP Zone Distribution */}
          <div className="grid lg:grid-cols-3 gap-6">
            <GlassCard className="lg:col-span-1">
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Distribusi Zona DDMRP</h3>
              <div className="space-y-3">
                {results.ddmrp_distribution.map((d: any) => {
                  const pct = results.kpi.total_branches > 0 ? (d.count / results.kpi.total_branches * 100) : 0;
                  return (
                    <div key={d.zone} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-foreground">{d.zone}</span>
                          <span className="text-muted-foreground font-bold">{d.count} cabang</span>
                        </div>
                        <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* Region Performance */}
            <GlassCard className="lg:col-span-2">
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Performa per Wilayah</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.region_summary} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="region" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                    <Legend />
                    <Bar dataKey="avg_in_stock" name="In-Stock %" fill="#22c55e" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="avg_otif" name="OTIF %" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="health_score" name="Health Score" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          {/* Heatmap — Stok Indonesia */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Heatmap Stok Indonesia — Days of Supply per Cabang
            </h3>
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filtered} layout="vertical" margin={{ top: 10, right: 20, left: 90, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} unit=" hari" />
                  <YAxis type="category" dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} width={85} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                    formatter={(value: any, name: string) => [`${value} hari`, 'Days of Supply']}
                    labelFormatter={(label: string) => {
                      const b = filtered.find((x: any) => x.cabang === label);
                      return b ? `${label} (${b.region}) — ${b.zone_label}` : label;
                    }} />
                  <Bar dataKey="days_of_supply" name="Days of Supply" radius={[0, 4, 4, 0]}>
                    {filtered.map((entry: any, idx: number) => (
                      <Cell key={idx} fill={ZONE_COLORS[entry.zone] || '#888'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {[
                { label: 'Stockout Risk (<3 hari)', color: '#ef4444' },
                { label: 'Warning (3-7 hari)', color: '#f59e0b' },
                { label: 'Safe (7-30 hari)', color: '#22c55e' },
                { label: 'Overstock (>30 hari)', color: '#3b82f6' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Alerts */}
          {results.alerts.length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Exception Alerts ({results.alerts.length})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                {results.alerts
                  .filter((a: any) => selectedRegion.includes('All') || selectedRegion.includes(a.region))
                  .map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                    <span className={`mt-0.5 px-2 py-0.5 rounded text-xs font-bold uppercase flex-shrink-0 ${
                      a.severity === 'CRITICAL' ? 'bg-destructive/20 text-destructive' : 'bg-yellow-500/20 text-yellow-500'
                    }`}>{a.severity}</span>
                    <p className="text-sm text-foreground">{a.message}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Branch Detail Table */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Detail Health per Cabang ({filtered.length} cabang)
            </h3>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-muted-foreground">
                <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider z-10">
                  <tr>
                    <th className="px-3 py-3">Cabang</th>
                    <th className="px-3 py-3">Region</th>
                    <th className="px-3 py-3 text-right">In-Stock %</th>
                    <th className="px-3 py-3 text-right">DoS</th>
                    <th className="px-3 py-3 text-right">OTIF %</th>
                    <th className="px-3 py-3 text-right">Health</th>
                    <th className="px-3 py-3">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-foreground">{b.cabang}</td>
                      <td className="px-3 py-2.5">{b.region}</td>
                      <td className="px-3 py-2.5 text-right">{b.in_stock_rate}%</td>
                      <td className="px-3 py-2.5 text-right font-medium">{b.days_of_supply}</td>
                      <td className="px-3 py-2.5 text-right">{b.otif_score}%</td>
                      <td className="px-3 py-2.5 text-right font-bold">{b.health_score}%</td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded text-xs font-bold uppercase" style={{
                          backgroundColor: `${b.zone_color}20`,
                          color: b.zone_color,
                        }}>
                          {b.zone_label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Re-upload */}
          <GlassCard>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Ulang Data"
              description="Upload file baru untuk refresh Control Tower."
              templateCsv={TEMPLATE_CSV}
              templateName="template_branch_health.csv"
            />
          </GlassCard>
        </div>
      )}
    </div>
  );
}
