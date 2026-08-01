"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { FileBarChart, Info, Calendar, BarChart3, Clock, Table as TableIcon, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';

const COLORS = ['#eab308', '#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'];

export default function PRUpdatePage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  useEffect(() => {
    get('last_pr_update').then(saved => {
      if (saved) setParsed(saved);
    }).catch(err => console.warn('Failed to load PR Update state from IndexDB', err));
  }, []);
  
  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedEta, setSelectedEta] = useState<string[]>(['All']);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca data PR Update...', { id: 'pr' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      
      try {
        await set('last_pr_update', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('Data PR Update berhasil di-load!', { id: 'pr' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'pr' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['branch_name', 'regional', 'cabang']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['item category', 'grup', 'category']) : undefined, [parsed]);
  const colEta = useMemo(() => parsed ? findColumn(parsed.headers, ['week eta', 'eta fix', 'tanggal eta']) : undefined, [parsed]);
  const colStatus = useMemo(() => parsed ? findColumn(parsed.headers, ['status compile', 'status']) : undefined, [parsed]);

  // Linked Filter options
  const cabangs = useMemo(() => {
    if (!parsed || !colCabang) return [];
    const source = parsed.data.filter(d =>
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()];
  }, [parsed, colCabang, selectedCategory, selectedEta, colCategory, colEta]);

  const categories = useMemo(() => {
    if (!parsed || !colCategory) return [];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCategory]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()];
  }, [parsed, colCategory, selectedCabang, selectedEta, colCabang, colEta]);

  const etas = useMemo(() => {
    if (!parsed || !colEta) return [];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colEta]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua eta'))).sort()];
  }, [parsed, colEta, selectedCabang, selectedCategory, colCabang, colCategory]);

  // Handle Export
  const handleExport = () => {
    if (!parsed || !parsed.data) return;
    const rows = parsed.data; // export all data, or filtered? Let's export filtered.
    
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
    link.download = 'pr_update_export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Data
  const filtered = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
    );
  }, [parsed, selectedCabang, selectedCategory, selectedEta, colCabang, colCategory, colEta]);

  // Chart data: Grouped by Cabang, Count by STATUS Compile
  const { chartData, statusList } = useMemo(() => {
    if (!parsed || filtered.length === 0) return { chartData: [], statusList: [] };
    const map: Record<string, any> = {};
    const statuses = new Set<string>();

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      const stat = colStatus ? (row[colStatus] || 'Unknown') : 'Total';
      statuses.add(stat);
      
      if (!map[cbg]) {
        map[cbg] = { cabang: cbg };
      }
      map[cbg][stat] = (map[cbg][stat] || 0) + 1;
    }

    return { chartData: Object.values(map), statusList: Array.from(statuses) };
  }, [parsed, filtered, colCabang, colStatus]);

  // KPIs
  const kpis = useMemo(() => {
    if (!parsed) return [];
    return statusList.slice(0, 3).map(stat => {
      const total = chartData.reduce((a, d) => a + (d[stat] || 0), 0);
      return { name: stat, total };
    });
  }, [parsed, chartData, statusList]);

  // Pivot Table Data
  const pivotData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    const colDesc = findColumn(parsed.headers, ['description', 'deskripsi', 'nama barang', 'item']);
    const colQty = findColumn(parsed.headers, ['qty', 'quantity', 'jumlah']);

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      const stat = colStatus ? (row[colStatus] || 'Unknown') : 'Unknown';
      const eta = colEta ? (row[colEta] || 'Unknown') : 'Unknown';
      const cat = colCategory ? (row[colCategory] || 'Unknown') : 'Unknown';
      const desc = colDesc ? (row[colDesc] || 'Unknown') : 'Unknown';
      
      const qtyStr = colQty ? row[colQty] : 0;
      let qty = 0;
      if (typeof qtyStr === 'number') qty = qtyStr;
      else if (typeof qtyStr === 'string') {
        const q = parseFloat(qtyStr.replace(/,/g, ''));
        if (!isNaN(q)) qty = q;
      }

      const key = `${cbg}_${stat}_${eta}_${cat}_${desc}`;
      if (!map[key]) {
        map[key] = {
          'Cabang': cbg,
          'Status': stat,
          'ETA': eta,
          'Kategori Produk': cat,
          'Deskripsi': desc,
          'Total Qty': 0,
          'Jumlah Dokumen': 0
        };
      }
      map[key]['Total Qty'] += qty;
      map[key]['Jumlah Dokumen'] += 1;
    }
    return Object.values(map).sort((a: any, b: any) => b['Jumlah Dokumen'] - a['Jumlah Dokumen']);
  }, [parsed, filtered, colCabang, colStatus, colEta, colCategory]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
          <FileBarChart className="w-8 h-8 text-primary" />
          PR Update
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Dashboard dari sheet PR Update. Menganalisa jumlah item per status (ON VESSEL, HOLD DELIVERY, dll).
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-6 mb-8 items-stretch">
        <div className="md:col-span-2">
          <GlassCard className="h-full bg-muted/30 flex flex-col justify-center">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <Info className="w-5 h-5 text-primary" /> Executive Insights
            </h3>
            <ul className="text-sm text-muted-foreground leading-relaxed list-disc list-inside space-y-3">
              <li><strong>Kesiapan Rantai Pasok (Supply Chain):</strong> Pantau <em>Status Compile</em> untuk mendeteksi posisi terlama (bottleneck) dari pengadaan barang, baik di sisi internal maupun vendor.</li>
              <li><strong>Prioritas Kedatangan Barang:</strong> Melalui analisis <em>Week ETA</em> vs <em>Total Qty</em>, rencanakan prioritas penerimaan barang untuk memastikan kapasitas gudang tiap cabang memadai.</li>
            </ul>
          </GlassCard>
        </div>
        <div className="md:col-span-1 flex flex-col">
          <GlassCard className="h-full flex items-center justify-center p-3">
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              templateCsv="PO No,PR No,vendor_no,No SKU,DESCRIPTION,Qty,STATUS Compile,CONTAINER ,GRUP,ITEM CATEGORY,SUB ITEM CATEGORY,CATEGORY DSP,branch_name,Regional,ETA FIX,Week ETA"
              templateName="pr_update_template.csv"
              label="Upload Data PR Update"
              description="Upload CSV hasil export (sistem otomatis menghitung jumlah PO per STATUS Compile)."
            />
          </GlassCard>
        </div>
      </div>

      {parsed && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Filters */}
          <GlassCard>
            <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4 border-b border-border pb-6">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">Filter Dashboard</h3>
                  <TimestampBadge timestamp={parsed.processed_at || new Date().toISOString()} />
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  {colCabang && <MultiSelect options={cabangs} selected={selectedCabang} onChange={setSelectedCabang} selectAllLabel="Semua Cabang" />}
                  {colCategory && <MultiSelect options={categories} selected={selectedCategory} onChange={setSelectedCategory} selectAllLabel="Semua Kategori" />}
                  {colEta && <MultiSelect options={etas} selected={selectedEta} onChange={setSelectedEta} selectAllLabel="Semua ETA" />}
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
                  icon={<Clock />} 
                />
              ))}
              <KPICard title="Total Rows" value={filtered.length.toLocaleString()} icon={<BarChart3 />} />
            </div>
          </GlassCard>

          {/* Dynamic Bar Chart per Cabang */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Summary Status per Cabang</h3>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                  <Legend />
                  {statusList.map((stat, idx) => (
                    <Bar key={stat} dataKey={stat} fill={COLORS[idx % COLORS.length]} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Pivot Data Table */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-primary" /> Data Summary (Pivot Tabular)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Cabang</th>
                    <th className="px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 whitespace-nowrap">ETA</th>
                    <th className="px-4 py-3 whitespace-nowrap">Kategori Produk</th>
                    <th className="px-4 py-3 whitespace-nowrap">Deskripsi</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Total Qty</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Jumlah Dokumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pivotData.slice(0, 100).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap">{row['Cabang']}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row['Status']}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row['ETA']}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row['Kategori Produk']}</td>
                      <td className="px-4 py-3 truncate max-w-[200px]" title={row['Deskripsi']}>{row['Deskripsi']}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-medium">{row['Total Qty'].toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-primary">{row['Jumlah Dokumen'].toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pivotData.length > 100 && (
              <p className="text-xs text-muted-foreground mt-4 italic">
                Menampilkan 100 baris pertama dari {pivotData.length} baris summary...
              </p>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
