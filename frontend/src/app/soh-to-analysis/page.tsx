"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { ClipboardList, Download, Info, Package, BarChart3, Table as TableIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#eab308'];

export default function SOHAnalysisPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  useEffect(() => {
    try {
      const saved = localStorage.getItem('last_soh_data');
      if (saved) setParsed(JSON.parse(saved));
    } catch {}
  }, []);

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedInsentif, setSelectedInsentif] = useState<string[]>(['All']);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca data SOH & TO...', { id: 'soh' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      
      // Default to picking max 4 metrics so chart is readable initially
      if (parsedData && parsedData.targetColumns) {
        const priority = ['on hand', 'ready', 'plan loading', 'to week', 'vessel'];
        let defaults = parsedData.targetColumns.map(t => t.name).filter(name => 
          priority.some(p => name.toLowerCase().includes(p))
        );
        if (defaults.length === 0) defaults = parsedData.targetColumns.slice(0, 4).map(t => t.name);
        // Only select top 4 priority metrics to avoid clutter
        setSelectedMetrics(defaults.slice(0, 4));
      }
      
      try {
        localStorage.setItem('last_soh_data', JSON.stringify(parsedData));
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di memori browser (localStorage)');
      }
      toast.success('Data SOH berhasil di-load!', { id: 'soh' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'soh' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['cabang', 'cab', 'region']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['grup', 'category', 'kategori item', 'kategori']) : undefined, [parsed]);
  const colInsentif = useMemo(() => parsed ? findColumn(parsed.headers, ['insentif', 'kategori insentif']) : undefined, [parsed]);

  // Filter options
  const cabangs = useMemo(() => parsed && colCabang ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()] : [], [parsed, colCabang]);
  const categories = useMemo(() => parsed && colCategory ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colCategory]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()] : [], [parsed, colCategory]);
  const insentifs = useMemo(() => parsed && colInsentif ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colInsentif]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua insentif'))).sort()] : [], [parsed, colInsentif]);
  
  const metricOptions = useMemo(() => parsed ? ['All', ...parsed.targetColumns.map(t => t.name)] : [], [parsed]);

  // Handle Export
  const handleExport = () => {
    if (!parsed || !parsed.data) return;
    const header = parsed.headers.map(h => `"${h}"`).join(',');
    const lines = [header];
    
    filtered.forEach(row => {
      const line = parsed.headers.map(h => {
        let val = row[h];
        if (val === undefined || val === null) val = '';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return val;
      }).join(',');
      lines.push(line);
    });
    
    // Force Excel to use semicolon separator for Indonesian locale
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'soh_analysis_export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Data
  const filtered = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colInsentif || selectedInsentif.includes('All') || selectedInsentif.includes(d[colInsentif]))
    );
  }, [parsed, selectedCabang, selectedCategory, selectedInsentif, colCabang, colCategory, colInsentif]);

  // KPIs
  const kpis = useMemo(() => {
    if (!parsed) return [];
    // Generate a KPI for the first 4 target columns
    return parsed.targetColumns.slice(0, 4).map(tc => {
      const total = filtered.reduce((a, d) => a + (d[tc.name] || 0), 0);
      return { name: tc.name, total };
    });
  }, [parsed, filtered]);

  // Chart data: Grouped by Cabang
  const chartData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};
    
    // Determine which metrics to plot
    let metricsToPlot = parsed.targetColumns.map(tc => tc.name);
    if (!selectedMetrics.includes('All') && selectedMetrics.length > 0) {
      metricsToPlot = selectedMetrics;
    }

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (!map[cbg]) {
        map[cbg] = { cabang: cbg };
        metricsToPlot.forEach(m => map[cbg][m] = 0);
      }
      metricsToPlot.forEach(m => {
        map[cbg][m] += (row[m] || 0);
      });
    }
    return Object.values(map);
  }, [parsed, filtered, colCabang, selectedMetrics]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
          <ClipboardList className="w-8 h-8 text-primary" />
          SOH & TO Analysis
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Dashboard dari sheet On Hand. Menganalisa ringkasan per cabang/kategori (Vessel, Plan Loading, Ready, dll).
        </p>
      </header>

      {/* Upload & Instructions Row */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2">
          <GlassCard>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              templateCsv="Cabang,Grup,On Hand,TO WEEK 1 JULI,TO WEEK 2 JULI,TO WEEK 3 JULI,TO WEEK 4 JULI,TO WEEK 5 JULI,VESSEL WEEK 2 JULI,VESSEL WEEK 3 JULI,VESSEL WEEK 4 JULI,VESSEL WEEK 5 JULI,VESSEL WEEK 1 AGT,VESSEL WEEK 2 AGT,PLAN LOADING,READY"
              templateName="soh_template.csv"
              label="Upload Data SOH (Sheet: On Hand)"
              description="Upload CSV hasil export dari Google Sheet (tidak perlu repot memberi tanda X, sistem akan otomatis membaca kolom metrik seperti TO, VESSEL, dll)."
            />
          </GlassCard>
        </div>
        <div className="md:col-span-1">
          <GlassCard className="h-full bg-muted/30">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <Info className="w-5 h-5 text-primary" /> Executive Insights
            </h3>
            <ul className="text-sm text-muted-foreground leading-relaxed list-disc list-inside space-y-2">
              <li><strong>Efisiensi Persediaan:</strong> Evaluasi jumlah SOH berbanding dengan status <em>Dead Moving</em> atau <em>Ready</em> untuk mengambil keputusan bisnis yang lebih cepat.</li>
              <li><strong>Sumber Inbound (Cabang/Kota):</strong> <em>Transfer Order (TO)</em> dan <em>Vessel (Kapal)</em> merupakan sumber utama di mana tiap cabang (Kota) mendapatkan pasokan <em>inbound</em> barang. Monitor penumpukan antrean TO yang belum masuk tahap <em>Plan Loading</em> untuk mencegah bottleneck logistik.</li>
            </ul>
          </GlassCard>
        </div>
      </div>

      {parsed && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Filters */}
          <GlassCard>
            <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4 border-b border-border pb-6">
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">Filter Dashboard</h3>
                <div className="flex flex-wrap gap-3 mt-4">
                  {colCabang && <MultiSelect options={cabangs} selected={selectedCabang} onChange={setSelectedCabang} selectAllLabel="Semua Cabang" />}
                  {colCategory && <MultiSelect options={categories} selected={selectedCategory} onChange={setSelectedCategory} selectAllLabel="Semua Kategori" />}
                  {colInsentif && <MultiSelect options={insentifs} selected={selectedInsentif} onChange={setSelectedInsentif} selectAllLabel="Semua Insentif" />}
                  {metricOptions.length > 1 && (
                    <MultiSelect 
                      options={metricOptions} 
                      selected={selectedMetrics} 
                      onChange={setSelectedMetrics} 
                      selectAllLabel="Semua Metrik" 
                      placeholder="Pilih Metrik Grafik"
                    />
                  )}
                </div>
              </div>
              <div className="flex gap-3 shrink-0 mt-4 md:mt-0">
                <button onClick={handleExport}
                  className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm flex items-center gap-2 font-medium">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>
            </div>

            {/* Dynamic KPIs */}
            <div className="grid md:grid-cols-4 gap-4 mt-6">
              {kpis.map((kpi, idx) => (
                <KPICard 
                  key={idx} 
                  title={`Total ${kpi.name}`} 
                  value={kpi.total.toLocaleString('id-ID')} 
                  icon={<Package />} 
                />
              ))}
              <KPICard title="Total Rows" value={filtered.length.toLocaleString()} icon={<BarChart3 />} />
            </div>
          </GlassCard>

          {/* Dynamic Bar Chart per Cabang */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Summary (Kolom 'X') per Cabang</h3>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                  <Legend />
                  {(selectedMetrics.includes('All') || selectedMetrics.length === 0 
                    ? parsed.targetColumns.map(tc => tc.name) 
                    : selectedMetrics
                  ).map((m, idx) => (
                    <Bar key={m} dataKey={m} fill={COLORS[idx % COLORS.length]} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Full Data Table */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-primary" /> Data Detail (Semua Kolom)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
                  <tr>
                    {parsed.headers.map(h => (
                      <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      {parsed.headers.map(h => (
                        <td key={h} className="px-4 py-3 whitespace-nowrap">
                          {typeof row[h] === 'number' ? row[h].toLocaleString('id-ID') : (row[h] || '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 50 && (
              <p className="text-xs text-muted-foreground mt-4 italic">
                Menampilkan 50 baris pertama dari {filtered.length} baris...
              </p>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
