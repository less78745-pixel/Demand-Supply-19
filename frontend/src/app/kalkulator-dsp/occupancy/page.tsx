"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { OccupancyChart } from '@/components/charts/OccupancyChart';
import { InventoryChart } from '@/components/charts/InventoryChart';
import { Activity, AlertTriangle, Info, TrendingUp, TrendingDown, AlertOctagon, Layers, Download, PackageSearch, LayoutGrid, CheckCircle, Sparkles, HelpCircle, FileSpreadsheet, Zap, ShieldAlert, Cloud } from 'lucide-react';
import { uploadOccupancyFile, downloadOccupancyTemplate } from '@/lib/api';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import toast from 'react-hot-toast';
import { getStandardFilename } from '@/utils/export';
import { ExportHtmlButton } from '@/components/ui/ExportHtmlButton';
import { supabase } from '@/lib/supabase';

type ScenarioType = 'actual' | 'surge' | 'expansion';

const SCENARIOS = [
  {
    id: 'actual' as ScenarioType,
    title: 'Jalur 1: Kapasitas Aktual Gudang (Current Base)',
    desc: 'Pemantauan rasio pemanfaatan gudang aktual (Occupancy Pct) terhadap batas kapasitas resmi tiap cabang saat ini.',
    color: 'from-indigo-600 to-violet-500',
    icon: Activity,
    modifier: 1.0
  },
  {
    id: 'surge' as ScenarioType,
    title: 'Jalur 2: Simulasi Lonjakan Stok (+25% Inflow)',
    desc: 'Uji stress gudang saat terjadi lonjakan kedatangan kontainer atau penumpukan stok akhir tahun maupun seasonal import.',
    color: 'from-rose-600 to-orange-500',
    icon: AlertTriangle,
    modifier: 1.25
  },
  {
    id: 'expansion' as ScenarioType,
    title: 'Jalur 3: Simulasi Ekspansi Gudang (+30% Kapasitas)',
    desc: 'Evaluasi kelonggaran ruang simpan dan penurunan persentase over-occupancy paska penambahan pallet space di cabang.',
    color: 'from-emerald-600 to-teal-500',
    icon: Layers,
    modifier: 0.77
  }
];

function PaginatedTable<T>({
  data,
  pageSize = 50,
  renderTable,
}: {
  data: T[];
  pageSize?: number;
  renderTable: (currentData: T[], page: number, totalPages: number) => React.ReactNode;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [data.length, totalPages, page]);

  const currentData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  return (
    <div className="w-full">
      {renderTable(currentData, page, totalPages)}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-t border-border mt-2 rounded-b-lg text-foreground">
          <div className="text-xs text-muted-foreground font-medium">
            Menampilkan {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, data.length)} dari {data.length.toLocaleString()} data
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs font-semibold rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sebelumnya
            </button>
            <span className="text-xs font-bold px-2.5 py-1 bg-muted rounded">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-xs font-semibold rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function generateDemoOccupancy() {
  const dates = ['JAN-1', 'JAN-2', 'JAN-3', 'JAN-4', 'FEB-1', 'FEB-2'];
  const branches = [
    { name: 'DC Jakarta', capacity: 30000, hand: 15200 },
    { name: 'DC Surabaya', capacity: 17000, hand: 8300 },
    { name: 'DC Medan', capacity: 9000, hand: 4100 },
    { name: 'DC Makassar', capacity: 13500, hand: 6200 },
  ];

  const forecastSeries: Record<string, number[]> = {
    'DC Jakarta': [50.67, 48.33, 49.67, 49.67, 51.33, 51.0],
    'DC Surabaya': [48.82, 48.24, 45.29, 45.29, 43.53, 42.35],
    'DC Medan': [45.56, 45.56, 45.0, 46.11, 46.11, 45.0],
    'DC Makassar': [45.93, 45.93, 45.56, 46.3, 46.3, 45.56]
  };
  const targetSeries: Record<string, number[]> = {
    'DC Jakarta': [50.0, 46.67, 47.0, 46.0, 46.67, 45.33],
    'DC Surabaya': [49.41, 49.41, 47.06, 47.65, 46.47, 45.88],
    'DC Medan': [44.44, 43.33, 41.67, 41.67, 40.56, 38.33],
    'DC Makassar': [45.19, 44.44, 43.33, 43.33, 42.59, 41.11]
  };

  const daily_data: any[] = [];
  branches.forEach(b => {
    const series = forecastSeries[b.name] || [50, 50, 50, 50, 50, 50];
    dates.forEach((dt, idx) => {
      const pct = series[idx];
      const currentHand = Math.round((pct / 100) * b.capacity);
      daily_data.push({
        date: dt,
        cabang: b.name,
        total_on_hand: currentHand,
        capacity: b.capacity,
        occupancy_pct: pct,
        is_shortage: currentHand < 0
      });
    });
  });

  return {
    processed_at: new Date().toISOString(),
    daily_data,
    kpi_summary: { avg_occupancy: 46.8, max_occupancy: 51.3, categories_at_risk: 0 },
    shortage_alerts: [],
    inventory_analysis: {
      kpi_summary: {
        total_categories: 3,
        a_class_count: 2,
        z_class_count: 2,
        dead_stock_count: 1,
        stockout_risk_count: 0
      },
      matrix_data: [
        { cabang: 'DC Jakarta', category: 'Electronics & Spareparts', class: 'A-X', volume: 5200, mean_sales: 140, cv: 0.2, doh: 22, on_hand: 3080, trend_pct: 5, stockout_risk: false, strategy: 'Continuous Review, tight safety stock. High value, predictable.' },
        { cabang: 'DC Surabaya', category: 'Fast Moving Consumer', class: 'A-Z', volume: 3800, mean_sales: 110, cv: 0.75, doh: 12, on_hand: 1320, trend_pct: -2, stockout_risk: false, strategy: 'Collaborative forecasting needed. Risk of high-cost stockouts.' },
        { cabang: 'DC Medan', category: 'Apparel & Textiles', class: 'C-Z', volume: 800, mean_sales: 5, cv: 1.2, doh: 115, on_hand: 575, trend_pct: -15, stockout_risk: false, strategy: 'Candidate for discontinuation or consignment stock.' }
      ],
      dead_stock: [
        { cabang: 'DC Medan', category: 'Apparel & Textiles', doh: 115, on_hand: 575, class: 'C-Z' }
      ]
    },
    over_occupancy_insights: [
      'PERBANDINGAN SKENARIO - DC Jakarta: pada periode JAN-1, utilisasi gudang stabil di kisaran 50.67% dari total kapasitas 30,000 unit.',
      'STATUS GUDANG - Seluruh 4 Distribution Center (DC Jakarta, Surabaya, Medan, Makassar) beroperasi pada level occupancy ideal (42% - 51%), tidak terdeteksi risiko over-kapasitas maupun shortage.'
    ],
    mrp_results: {
      week_awal: 1,
      period_labels: dates,
      insights_list: [
        'PERBANDINGAN SKENARIO - DC Jakarta: pada periode JAN-1, utilisasi gudang stabil di kisaran 50.67% dari total kapasitas 30,000 unit.',
        'TREN - DC Surabaya (Forecast): balance utilisasi turun stabil dari 48.82% (JAN-1) menjadi 42.35% (FEB-2). Status utilisasi kapasitas gudang optimal.',
        'STATUS GUDANG - Seluruh 4 Distribution Center (DC Jakarta, Surabaya, Medan, Makassar) beroperasi pada level occupancy ideal (42% - 51%), tidak terdeteksi risiko over-kapasitas maupun shortage.'
      ],
      occupancy_series_forecast: forecastSeries,
      occupancy_series_target: targetSeries
    },
    ddmrp_results: {
      week_awal: 1,
      period_labels: dates,
      insights_list: [
        'PERBANDINGAN SKENARIO - DC Jakarta: pada periode JAN-1, utilisasi gudang stabil di kisaran 50.67% dari total kapasitas 30,000 unit.',
        'TREN - DC Surabaya (Forecast): balance utilisasi turun stabil dari 48.82% (JAN-1) menjadi 42.35% (FEB-2). Status utilisasi kapasitas gudang optimal.',
        'STATUS GUDANG - Seluruh 4 Distribution Center (DC Jakarta, Surabaya, Medan, Makassar) beroperasi pada level occupancy ideal (42% - 51%), tidak terdeteksi risiko over-kapasitas maupun shortage.'
      ],
      occupancy_series_forecast: forecastSeries,
      occupancy_series_target: targetSeries
    }
  };
}

export default function OccupancyPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults]           = useState<any>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('actual');
  const [showHowTo, setShowHowTo] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      toast.loading('Mengunduh Template Excel MRP (Raw & WH)...', { id: 'tpl' });
      const blob = await downloadOccupancyTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Template_Occupancy_MRP_Raw_WH.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Template MRP Berhasil Diunduh!', { id: 'tpl' });
    } catch (e: any) {
      toast.error('Gagal mengunduh template: ' + (e?.message || 'Server offline'), { id: 'tpl' });
    }
  };

  const handleSaveToGlobal = async () => {
    if (!results) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }
    toast.loading('Menyimpan ke Global DB...', { id: 'save-global' });
    const timestamp = new Date().toISOString();
    const dataCopy = { ...results, processed_at: timestamp };
    sessionStorage.setItem('last_processed_at_occupancy', timestamp);
    const { error } = await supabase.from('processed_results').insert([{ module: 'occupancy', result_json: JSON.stringify(dataCopy) }]);
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    const demo = generateDemoOccupancy();
    setResults(demo);
    try {
      localStorage.setItem('lastOccupancy', JSON.stringify(demo));
      if (demo.inventory_analysis) localStorage.setItem('lastInventory', JSON.stringify(demo.inventory_analysis));
    } catch(e){}
    toast.success('🎉 Data Demo Occupancy & Inventory Berhasil Dimuat!');
  };

  // ── Restore previous results from Supabase ──
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data, error } = await supabase
          .from('processed_results')
          .select('*')
          .eq('module', 'occupancy')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (data && data.length > 0) {
          const row = data[0];
          const parsed = JSON.parse(row.result_json);
          parsed.processed_at = row.created_at;
          setResults(parsed);
        } else {
          setResults(generateDemoOccupancy());
        }
      } catch (err) {
        setResults(generateDemoOccupancy());
      }
    };
    
    fetchInitialData();
    
    const channel = supabase
      .channel('occupancy_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: 'module=eq.occupancy' },
        (payload) => {
          try {
            const newData = JSON.parse(payload.new.result_json);
            newData.processed_at = payload.new.created_at;
            
            const lastProcessedAt = sessionStorage.getItem('last_processed_at_occupancy');
            if (lastProcessedAt === newData.processed_at) return;

            setResults(newData);
            toast.success('Pembaruan data dari pengguna lain diterima!', { 
              icon: '🔄',
              duration: 5000,
              style: { background: '#22c55e', color: '#fff', fontWeight: 'bold' } 
            });
          } catch (e) {
            console.error("Failed parsing realtime data", e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [selectedCabang,   setSelectedCabang]   = useState<string[]>(['All']);
  const [selectedDate,     setSelectedDate]     = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedClass,    setSelectedClass]    = useState<string[]>(['All']);

  // ── Upload handler ──
  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Analyzing occupancy & inventory dataset...', { id: 'occ' });
    try {
      const data = await uploadOccupancyFile(file);
      data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      sessionStorage.setItem('last_processed_at_occupancy', data.processed_at);
      try {
        localStorage.setItem('lastOccupancy', JSON.stringify(data));
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di memori browser');
      }
      // Also save inventory data separately for dashboard compatibility
      if (data.inventory_analysis) {
        try {
          localStorage.setItem('lastInventory', JSON.stringify(data.inventory_analysis));
        } catch(e) {}
      }
      toast.success('Analysis complete!', { id: 'occ' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to process. Check columns.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'occ' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── CSV export with insights ──
  const handleExport = () => {
    if (!results?.daily_data) return;
    const rows = results.daily_data;
    
    // Main data section
    const header = ['Date','Cabang','Total On Hand','Capacity','Occupancy Pct (%)'];
    const lines = [
      header.join(','),
      ...rows.map((r: any) =>
        [r.date, r.cabang, r.total_on_hand, r.capacity, r.occupancy_pct].join(',')
      ),
    ];
    
    // KPI Summary section
    lines.push('');
    lines.push('--- DSP INSIGHT: KPI SUMMARY ---');
    lines.push(`Avg Occupancy (%),${results.kpi_summary?.avg_occupancy || 0}`);
    lines.push(`Max Occupancy (%),${results.kpi_summary?.max_occupancy || 0}`);
    lines.push(`Categories at Risk,${results.kpi_summary?.categories_at_risk || 0}`);

    // Over Occupancy Insights
    const overData = rows.filter((d: any) => d.occupancy_pct > 100);
    if (overData.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHT: OVER OCCUPANCY (> 100%) ---');
      lines.push('Date,Cabang,Occupancy Pct (%)');
      overData.forEach((d: any) => lines.push(`${d.date},${d.cabang},${d.occupancy_pct}`));
    }

    // Lower Occupancy Insights
    const lowerData = rows.filter((d: any) => d.occupancy_pct < 50);
    if (lowerData.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHT: LOWER OCCUPANCY (< 50%) ---');
      lines.push('Date,Cabang,Occupancy Pct (%)');
      lowerData.forEach((d: any) => lines.push(`${d.date},${d.cabang},${d.occupancy_pct}`));
    }

    // Shortage Alerts
    const alerts = results.shortage_alerts || [];
    if (alerts.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHT: SHORTAGE ALERTS (DEFICIT) ---');
      lines.push('Cabang,Category,Date,Deficit');
      alerts.forEach((a: any) => lines.push(`${a.cabang},${a.category},${a.date},${a.deficit}`));
    }

    // Inventory Analysis (if available)
    const inv = results.inventory_analysis;
    if (inv?.matrix_data?.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHT: INVENTORY ABC-XYZ CLASSIFICATION ---');
      lines.push('Cabang,Category,Class,Volume,Mean Sales,CV,DOH,On Hand,Trend (%),Risk,Strategy');
      inv.matrix_data.forEach((r: any) => {
        const risk = r.stockout_risk ? 'STOCKOUT' : r.overstock ? 'OVERSTOCK' : 'OK';
        lines.push(`"${r.cabang}","${r.category}","${r.class}",${r.volume},${r.mean_sales},${r.cv},${r.doh},${r.on_hand},${r.trend_pct},"${risk}","${r.strategy}"`);
      });

      if (inv.dead_stock?.length > 0) {
        lines.push('');
        lines.push('--- DSP INSIGHT: DEAD STOCK (DOH > 90 HARI) ---');
        lines.push('Cabang,Category,DOH,On Hand,Class');
        inv.dead_stock.forEach((d: any) => lines.push(`${d.cabang},${d.category},${d.doh},${d.on_hand},${d.class}`));
      }
    }

    // Over Occupancy Insights
    if (results.over_occupancy_insights?.length) {
      lines.push('');
      lines.push('--- WARNING: RAWAN PENUH (>90%) ---');
      results.over_occupancy_insights.forEach((ins: string) => {
        lines.push(`"${ins}"`);
      });
    }

    const blob = new Blob(['sep=,\r\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = getStandardFilename("Occupancy_Capacity", results?.processed_at || new Date().toISOString(), "csv");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Full report exported with DSP Insights!');
  };

  const handleExportWorkspace = () => {
    if (!results && !mrpData) {
      toast.error('Tidak ada data untuk disimpan!');
      return;
    }
    const workspace = { mrpData, results };
    const blob = new Blob([JSON.stringify(workspace)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace_dsp_${new Date().toISOString().split('T')[0]}.dsp`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Workspace berhasil diunduh! Anda dapat menyimpannya di Google Drive.');
  };

  const handleImportWorkspace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.mrpData) setMrpData(data.mrpData);
        if (data.results) setResults(data.results);
        toast.success('Workspace berhasil dimuat! Sesi dipulihkan.');
      } catch (err) {
        toast.error('File .dsp tidak valid atau rusak!');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Dropdown options ──
  const cabangs = useMemo(() => {
    if (!results?.daily_data) return [];
    return ['All', ...Array.from(new Set<string>(results.daily_data.map((d: any) => d.cabang)))];
  }, [results]);

  const dates = useMemo(() => {
    if (!results?.daily_data) return [];
    return ['All', ...Array.from(new Set<string>(results.daily_data.map((d: any) => d.date))).sort()];
  }, [results]);

  const invCategories = useMemo(() => {
    if (!results?.inventory_analysis?.matrix_data) return [];
    return ['All', ...Array.from(new Set<string>(results.inventory_analysis.matrix_data.map((d: any) => d.category)))];
  }, [results]);

  const invClasses = useMemo(() => {
    if (!results?.inventory_analysis?.matrix_data) return [];
    return ['All', ...Array.from(new Set<string>(results.inventory_analysis.matrix_data.map((d: any) => d.class)))];
  }, [results]);

  const filteredData = useMemo(() => {
    if (!results?.daily_data) return [];
    const mod = SCENARIOS.find(s => s.id === activeScenario)?.modifier || 1.0;
    return results.daily_data.filter((d: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(d.cabang)) &&
      (selectedDate.includes('All') || selectedDate.includes(d.date))
    ).map((d: any) => ({
      ...d,
      occupancy_pct: Math.round(Number(d.occupancy_pct || 0) * mod * 10) / 10,
      total_on_hand: activeScenario === 'surge' ? Math.round(d.total_on_hand * 1.25) : d.total_on_hand,
      capacity: activeScenario === 'expansion' ? Math.round(d.capacity * 1.3) : d.capacity,
    }));
  }, [results, selectedCabang, selectedDate, activeScenario]);

  const insights = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return { over: [], lower: [] };
    const over = filteredData.filter((d: any) => d.occupancy_pct > 100);
    const lower = filteredData.filter((d: any) => d.occupancy_pct < 50);
    return { over, lower };
  }, [filteredData]);

  const filteredInvData = useMemo(() => {
    if (!results?.inventory_analysis?.matrix_data) return [];
    return results.inventory_analysis.matrix_data.filter((d: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(d.cabang)) &&
      (selectedCategory.includes('All') || selectedCategory.includes(d.category)) &&
      (selectedClass.includes('All') || selectedClass.includes(d.class))
    );
  }, [results, selectedCabang, selectedCategory, selectedClass]);

  const filteredShortageAlerts = useMemo(() => {
    if (!results?.shortage_alerts) return [];
    return results.shortage_alerts.filter((a: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(a.cabang)) &&
      (selectedDate.includes('All') || selectedDate.includes(a.date)) &&
      (selectedCategory.includes('All') || selectedCategory.includes(a.category))
    );
  }, [results, selectedCabang, selectedDate, selectedCategory]);

  const kpiMetrics = useMemo(() => {
    if (!filteredData || filteredData.length === 0) {
      return {
        avg: 0,
        peak: 0,
        top3Peak: [] as Array<{ cabang: string; date: string; val: string }>,
        min: 0,
        bottom3Min: [] as Array<{ cabang: string; date: string; val: string }>,
        riskCount: 0,
        top5RiskCategories: [] as Array<{ category: string; cabang: string; reason: string }>,
      };
    }

    // Avg Occupancy from active filtered data
    const totalOccupancy = filteredData.reduce((acc: number, item: any) => acc + Number(item.occupancy_pct || 0), 0);
    const avg = Number((totalOccupancy / filteredData.length).toFixed(1));

    // Sorted by occupancy_pct descending (Peak Occupancy)
    const sortedDesc = [...filteredData].sort((a: any, b: any) => Number(b.occupancy_pct || 0) - Number(a.occupancy_pct || 0));
    const peak = sortedDesc[0] ? Number(sortedDesc[0].occupancy_pct || 0).toFixed(1) : 0;
    const top3Peak = sortedDesc.slice(0, 3).map((item: any) => ({
      cabang: item.cabang,
      date: item.date,
      val: Number(item.occupancy_pct || 0).toFixed(1)
    }));

    // Sorted by occupancy_pct ascending (Min Occupancy)
    const sortedAsc = [...filteredData].sort((a: any, b: any) => Number(a.occupancy_pct || 0) - Number(b.occupancy_pct || 0));
    const min = sortedAsc[0] ? Number(sortedAsc[0].occupancy_pct || 0).toFixed(1) : 0;
    const bottom3Min = sortedAsc.slice(0, 3).map((item: any) => ({
      cabang: item.cabang,
      date: item.date,
      val: Number(item.occupancy_pct || 0).toFixed(1)
    }));

    // Categories at Risk: combines shortage alerts and inventory analysis risks
    const riskMap = new Map<string, { category: string; cabang: string; reason: string; score: number }>();
    
    if (filteredShortageAlerts && filteredShortageAlerts.length > 0) {
      filteredShortageAlerts.forEach((item: any) => {
        const key = `${item.cabang}-${item.category}`;
        riskMap.set(key, {
          category: item.category,
          cabang: item.cabang,
          reason: `Defisit: ${item.deficit}`,
          score: 1000 + Number(item.deficit || 0)
        });
      });
    }

    if (filteredInvData && filteredInvData.length > 0) {
      filteredInvData.forEach((item: any) => {
        if (item.stockout_risk || item.xyz === 'Z' || item.doh > 90) {
          const key = `${item.cabang}-${item.category}`;
          if (!riskMap.has(key)) {
            const reason = item.stockout_risk ? `Stockout Risk (DOH: ${item.doh})` : item.doh > 90 ? `Dead Stock (DOH: ${item.doh})` : `High Volatility (${item.class})`;
            const score = item.stockout_risk ? 500 : item.doh > 90 ? 300 : 100;
            riskMap.set(key, { category: item.category, cabang: item.cabang, reason, score });
          }
        }
      });
    }

    const riskList = Array.from(riskMap.values()).sort((a, b) => b.score - a.score);
    const top5RiskCategories = riskList.slice(0, 5);
    const riskCount = riskList.length || results?.kpi_summary?.categories_at_risk || 0;

    return {
      avg,
      peak,
      top3Peak,
      min,
      bottom3Min,
      riskCount,
      top5RiskCategories,
    };
  }, [filteredData, filteredShortageAlerts, filteredInvData, results]);

  const mrpData = results?.mrp_results || results?.ddmrp_results;

  return (
    <div className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">

      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 border border-indigo-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest">
              <Activity className="w-3.5 h-3.5" /> Kalkulator DSP • Warehouse & Inventory Projector
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              Occupancy & <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-300 to-purple-300">Inventory Projector</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Analisis utilitas ruang simpan gudang per cabang, mitigasi kekurangan kapasitas, dan klasifikasi ABC-XYZ Inventory untuk pengoptimalan rantai pasok Anda.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <label className="w-full sm:w-auto px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm">
              <Download className="w-4 h-4 rotate-180" /> Buka Sesi (.dsp)
              <input type="file" accept=".dsp,.json" className="hidden" onChange={handleImportWorkspace} />
            </label>
            <button
              onClick={handleExportWorkspace}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-500 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 shadow-md"
            >
              <Download className="w-4 h-4" /> Simpan Sesi
            </button>
            <ExportHtmlButton elementId="export-container" moduleName="Occupancy_Analisa" processedAt={results?.processed_at} />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN & DEMO DATA SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-indigo-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Panduan & Skema File Excel Occupancy
            </h3>
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-900 font-bold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <FileSpreadsheet className="w-4 h-4" /> Download Template Excel MRP
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Zap className="w-4 h-4" /> Gunakan Data Demo
              </button>
              <button
                onClick={handleSaveToGlobal}
                disabled={!results}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg"
              >
                <Cloud className="w-4 h-4" /> Simpan ke Global
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700">
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">📌 Skema Kolom Diperlukan (2 Pilihan Format):</h4>
              <div className="space-y-2 mb-3">
                <p className="text-xs font-bold text-indigo-400">Option 1: Format Multi-Sheet MRP (Terbaru)</p>
                <p className="text-xs text-slate-600">• Sheet <code>Raw</code>: No, Cabang, Grup, Category, On Hand + blok mingguan [TO, Vessel, Forecast, Target].</p>
                <p className="text-xs text-slate-600">• Sheet <code>WH</code>: No, Cabang, Kapasitas Existing, Tambahan, dan sel <code>Week Awal</code> (cth: 1 untuk JAN-1).</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-teal-400">Option 2: Format Tabel Tunggal (Legacy CSV/XLSX)</p>
                <ul className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                  {['Cabang','Category','On Hand (stok awal)','In (masuk)','Out (keluar / penjualan)','Capacity (kapasitas cabang)','Date'].map(col => (
                    <li key={col} className="flex items-center gap-2 font-mono bg-white/5 p-2 rounded border border-slate-200">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>{col}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900">⚙️ Proxy Penjualan & Klasifikasi ABC-XYZ:</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Kolom <code>Out</code> atau demand <code>Forecast/Target</code> diproses sebagai proxy <b>Penjualan</b> untuk memetakan inventory ke kelas ABC (Volume) dan XYZ (Variabilitas/Coefficient of Variation), sehingga Anda mengetahui risiko Stockout dan Dead Stock secara otomatis.
              </p>
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-indigo-400" />
                <span>Mendukung penggabungan sheet Hasil Forecast/Target & Occupancy secara dinamis!</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi & Uji Ketahanan Gudang:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk memproyeksikan lonjakan inflow atau ekspansi gudang!</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SCENARIOS.map((sc) => {
            const Icon = sc.icon;
            const isSelected = activeScenario === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => {
                  setActiveScenario(sc.id);
                  toast.success(`Mengaktifkan ${sc.title}`);
                }}
                className={`relative group p-4 sm:p-5 rounded-2xl transition-all duration-300 text-left border overflow-hidden shadow-lg ${
                  isSelected
                    ? `bg-gradient-to-br ${sc.color} text-slate-900 border-transparent ring-2 ring-white/20 shadow-indigo-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-indigo-400'}`} />
                    {sc.title}
                  </span>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-slate-900 text-xs font-black uppercase tracking-wider">
                      Aktif
                    </span>
                  )}
                </div>
                <p className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                  {sc.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── UPLOAD BOX WHEN RESULTS PRESENT OR HIDDEN ─── */}
      <GlassCard className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full">
          <FileUploader
            onFileUpload={handleFileUpload}
            isLoading={isProcessing}
            templateCsv={
              'Cabang,Category,On Hand,In,Out,Capacity,Date\n' +
              'DC Jakarta,Electronics,200,150,120,5000,2026-08-01\n' +
              'DC Surabaya,Apparel,300,180,190,4000,2026-08-01'
            }
            templateName="occupancy_template.csv"
            label="Upload Dataset Occupancy (Excel/CSV)"
            description="Format Multi-Sheet MRP (Raw & WH) atau Format Legacy CSV/XLSX (Cabang, Category, On Hand, In, Out, Capacity, Date)."
          />
        </div>
        <div className="sm:border-l border-slate-200 sm:pl-4 flex flex-col justify-center items-center shrink-0 gap-2.5">
          <button
            onClick={handleDownloadTemplate}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-900 font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-xs sm:text-sm"
          >
            <FileSpreadsheet className="w-4 h-4" /> Download Template MRP
          </button>
          <button
            onClick={handleGenerateDemo}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-slate-900 font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-xs sm:text-sm"
          >
            <Zap className="w-4 h-4" /> Gunakan Data Demo
          </button>
              <button
                onClick={handleSaveToGlobal}
                disabled={!results}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg"
              >
                <Cloud className="w-4 h-4" /> Simpan ke Global
              </button>
        </div>
      </GlassCard>

      {results && (
        /* ── Result state ── */
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              📈 Hasil Analisa Occupancy & Shortage
            </h2>
            <TimestampBadge timestamp={results.processed_at || new Date().toISOString()} />
          </div>

          {/* ═══ OCCUPANCY SECTION ═══ */}

          {/* KPI Row & Deep Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Avg Occupancy */}
            <GlassCard className="flex flex-col justify-between p-5 border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Occupancy</span>
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="my-4">
                <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.avg}%</div>
                <p className="text-xs text-muted-foreground mt-1">Rerata dari filter aktif</p>
              </div>
            </GlassCard>

            {/* Peak Occupancy (Top 3) */}
            <GlassCard className="flex flex-col justify-between p-5 border-orange-500/30 bg-orange-500/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-500 uppercase tracking-wider">Peak Occupancy</span>
                  <Layers className="w-5 h-5 text-orange-500" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.peak}%</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Top 3 Maksimum (Cabang & Periode):</p>
                </div>
                <div className="space-y-1.5 mt-2">
                  {kpiMetrics.top3Peak.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground truncate max-w-[120px]">#{idx+1} {p.cabang} <span className="text-[10px] text-muted-foreground">({p.date})</span></span>
                      <span className="font-bold text-orange-500 ml-2">{p.val}%</span>
                    </div>
                  ))}
                  {kpiMetrics.top3Peak.length === 0 && <p className="text-xs text-muted-foreground italic">Tidak ada data</p>}
                </div>
              </div>
            </GlassCard>

            {/* Min Occupancy (Bottom 3) */}
            <GlassCard className="flex flex-col justify-between p-5 border-blue-500/30 bg-blue-500/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">Min Occupancy</span>
                  <TrendingDown className="w-5 h-5 text-blue-500" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.min}%</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Bottom 3 Minimum (Cabang & Periode):</p>
                </div>
                <div className="space-y-1.5 mt-2">
                  {kpiMetrics.bottom3Min.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground truncate max-w-[120px]">#{idx+1} {m.cabang} <span className="text-[10px] text-muted-foreground">({m.date})</span></span>
                      <span className="font-bold text-blue-500 ml-2">{m.val}%</span>
                    </div>
                  ))}
                  {kpiMetrics.bottom3Min.length === 0 && <p className="text-xs text-muted-foreground italic">Tidak ada data</p>}
                </div>
              </div>
            </GlassCard>

            {/* Categories at Risk (Top 5) */}
            <GlassCard className="flex flex-col justify-between p-5 border-destructive/30 bg-destructive/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-destructive uppercase tracking-wider">Categories at Risk</span>
                  <AlertOctagon className="w-5 h-5 text-destructive" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.riskCount}</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Top 5 Kategori Berbahaya:</p>
                </div>
                <div className="space-y-1.5 mt-2 max-h-[140px] overflow-y-auto">
                  {kpiMetrics.top5RiskCategories.map((r, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] py-1 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground truncate max-w-[110px]">#{idx+1} {r.category} <span className="text-[9px] text-muted-foreground">({r.cabang})</span></span>
                      <span className="font-bold text-destructive ml-1">{r.reason}</span>
                    </div>
                  ))}
                  {kpiMetrics.top5RiskCategories.length === 0 && <p className="text-xs text-muted-foreground italic">Aman (Tidak ada risiko)</p>}
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Insights Row */}
          {(insights.over.length > 0 || insights.lower.length > 0) && (
            <div className="grid md:grid-cols-2 gap-6">
              {insights.over.length > 0 && (
                <GlassCard className="border-orange-500/30 bg-orange-500/5">
                  <h3 className="text-lg font-bold text-orange-500 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <AlertTriangle className="w-5 h-5" /> Over Occupancy (&gt; 100%)
                  </h3>
                  <PaginatedTable
                    data={insights.over}
                    pageSize={25}
                    renderTable={(slicedData) => (
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-sm text-left text-muted-foreground">
                          <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider">
                            <tr>
                              <th className="px-4 py-3">Cabang</th>
                              <th className="px-4 py-3">Tanggal</th>
                              <th className="px-4 py-3 text-right">Occupancy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slicedData.map((a: any, i: number) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 font-medium text-foreground">{a.cabang}</td>
                                <td className="px-4 py-3">{a.date}</td>
                                <td className="px-4 py-3 text-right font-bold text-orange-500">{a.occupancy_pct}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  />
                </GlassCard>
              )}

              {insights.lower.length > 0 && (
                <GlassCard className="border-blue-500/30 bg-blue-500/5">
                  <h3 className="text-lg font-bold text-blue-500 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <Info className="w-5 h-5" /> Lower Occupancy (&lt; 50%)
                  </h3>
                  <PaginatedTable
                    data={insights.lower}
                    pageSize={25}
                    renderTable={(slicedData) => (
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-sm text-left text-muted-foreground">
                          <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider">
                            <tr>
                              <th className="px-4 py-3">Cabang</th>
                              <th className="px-4 py-3">Tanggal</th>
                              <th className="px-4 py-3 text-right">Occupancy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slicedData.map((a: any, i: number) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 font-medium text-foreground">{a.cabang}</td>
                                <td className="px-4 py-3">{a.date}</td>
                                <td className="px-4 py-3 text-right font-bold text-blue-500">{a.occupancy_pct}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  />
                </GlassCard>
              )}
            </div>
          )}

          {/* Chart Card */}
          <GlassCard allowOverflow={true} className="mb-10 p-6 bg-white border-slate-200 shadow-xl relative z-30">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-6 border-b border-slate-200 pb-6">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">
                  Occupancy per Cabang per Tanggal
                </h3>
                <p className="text-xs text-muted-foreground mt-1 font-medium">
                  Total On Hand (All Categories) ÷ Kapasitas Cabang
                </p>
                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 max-w-2xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">🏢 Filter Cabang:</label>
                    <MultiSelect
                      options={cabangs}
                      selected={selectedCabang}
                      onChange={setSelectedCabang}
                      selectAllLabel="Semua Cabang"
                      placeholder="Pilih Cabang..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">📅 Filter Tanggal:</label>
                    <MultiSelect
                      options={dates}
                      selected={selectedDate}
                      onChange={setSelectedDate}
                      selectAllLabel="Semua Tanggal"
                      placeholder="Pilih Tanggal..."
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 shrink-0">
                <button onClick={handleExport}
                  className="px-5 py-2.5 bg-slate-100 text-slate-900 border border-slate-200 rounded-xl hover:border-sky-500 hover:bg-slate-700 transition text-sm flex items-center gap-2 font-bold shadow-md">
                  <Download className="w-4 h-4 text-sky-400" /> Export CSV
                </button>
              </div>
            </div>

            {filteredData.length > 0
              ? <OccupancyChart data={filteredData} />
              : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
                  Tidak ada data untuk filter yang dipilih.
                </div>
            }
          </GlassCard>

          {/* Shortage Alerts */}
          {filteredShortageAlerts.length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2 uppercase tracking-wide">
                <AlertTriangle className="w-5 h-5" /> Shortage Alerts (Mengikuti Filter)
              </h3>
              <PaginatedTable
                data={filteredShortageAlerts}
                pageSize={50}
                renderTable={(slicedData) => (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm text-left text-muted-foreground">
                      <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Cabang</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Tanggal</th>
                          <th className="px-4 py-3 text-right">Deficit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slicedData.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{a.cabang}</td>
                            <td className="px-4 py-3 font-medium text-foreground">{a.category}</td>
                            <td className="px-4 py-3">{a.date}</td>
                            <td className="px-4 py-3 text-right text-destructive font-bold">{Number(a.deficit).toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              />
            </GlassCard>
          )}

          {/* ═══ MRP AUTOMATED ANALYSIS SECTION (WHEN MULTI-SHEET EXCEL UPLOADED) ═══ */}
          {mrpData && (
            <GlassCard className="p-6 border-indigo-500/30 bg-gradient-to-br from-slate-900/90 via-indigo-950/20 to-slate-900/90 shadow-2xl relative z-30 mb-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-indigo-500/20 pb-5 mb-6">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2.5">
                    <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
                    Analisa &amp; Grafik MRP (Skenario Forecast vs Target)
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Hasil kalkulasi otomatis balance mingguan, rasio demand, dan occupancy gudang per periode ({mrpData.period_labels?.join(', ')}).
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 shrink-0">
                  {mrpData.excel_base64 && (
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${mrpData.excel_base64}`;
                        link.download = getStandardFilename('mrp_hasil_perhitungan', 'xlsx');
                        link.click();
                        toast.success('File Excel MRP dengan rumus berhasil diunduh!');
                      }}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-900 font-bold rounded-xl shadow-lg transition text-xs flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4" /> Download Excel Hasil (Rumus &amp; Ratio)
                    </button>
                  )}
                  {mrpData.html_report && (
                    <button
                      onClick={() => {
                        const blob = new Blob([mrpData.html_report], { type: 'text/html;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = getStandardFilename('mrp_analysis_report', 'html');
                        link.click();
                        toast.success('Laporan HTML Analisa MRP berhasil diunduh!');
                      }}
                      className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-slate-900 font-bold rounded-xl shadow-lg transition text-xs flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Download Laporan Analisa HTML
                    </button>
                  )}
                </div>
              </div>

              {/* Komparasi Occupancy Skenario Forecast vs Target Table */}
              {(mrpData.occupancy_series_forecast || mrpData.occupancy_series_target) && (
                <div className="mb-8">
                  <h4 className="text-sm sm:text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                    <Activity className="w-5 h-5 text-emerald-400" /> Komparasi Occupancy Mingguan - Skenario Forecast vs Target (%)
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 shadow-xl">
                    <table className="w-full text-xs text-left text-slate-700">
                      <thead className="bg-white text-slate-900 uppercase font-extrabold border-b border-slate-200 tracking-wider">
                        <tr>
                          <th className="py-3.5 px-4">Cabang</th>
                          <th className="py-3.5 px-4 text-center">Skenario</th>
                          {mrpData.period_labels?.map((label: string, i: number) => (
                            <th key={i} className="py-3.5 px-3 text-right">{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium">
                        {Object.keys(mrpData.occupancy_series_forecast || mrpData.occupancy_series_target || {})
                          .filter((cabang) => selectedCabang.includes('All') || selectedCabang.includes(cabang))
                          .map((cabang) => {
                          const fVals = mrpData.occupancy_series_forecast?.[cabang] || [];
                          const tVals = mrpData.occupancy_series_target?.[cabang] || [];
                          return (
                            <React.Fragment key={cabang}>
                              <tr className="bg-white hover:bg-slate-100 transition">
                                <td className="py-3 px-4 font-bold text-indigo-700 text-sm" rowSpan={2}>{cabang}</td>
                                <td className="py-2 px-3 text-center font-bold text-blue-700 bg-blue-500/10 rounded">Forecast</td>
                                {fVals.map((v: number, vIdx: number) => {
                                  const isOver = v > 100;
                                  const isHigh = v >= 90 && v <= 100;
                                  return (
                                    <td key={vIdx} className={`py-2.5 px-3 text-right text-sm font-bold ${
                                      isOver ? 'text-rose-600 bg-rose-500/20 font-black' : isHigh ? 'text-amber-600 font-extrabold' : 'text-slate-800'
                                    }`}>
                                      {v.toFixed(1)}%
                                      {isOver && <span className="block text-[9px] font-extrabold text-rose-600 uppercase tracking-tighter">Over Capacity!</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                              <tr className="bg-white hover:bg-slate-100 transition border-b border-slate-200">
                                <td className="py-2 px-3 text-center font-bold text-emerald-700 bg-emerald-500/10 rounded">Target</td>
                                {tVals.map((v: number, vIdx: number) => {
                                  const isOver = v > 100;
                                  const isHigh = v >= 90 && v <= 100;
                                  return (
                                    <td key={vIdx} className={`py-2.5 px-3 text-right text-sm font-bold ${
                                      isOver ? 'text-rose-600 bg-rose-500/20 font-black' : isHigh ? 'text-amber-600 font-extrabold' : 'text-slate-800'
                                    }`}>
                                      {v.toFixed(1)}%
                                      {isOver && <span className="block text-[9px] font-extrabold text-rose-600 uppercase tracking-tighter">Over Capacity!</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Automated Insights Section (Filtered) */}
              {(() => {
                const filteredShortageAlerts = (mrpData.shortage_alerts || []).filter((a: any) => selectedCabang.includes('All') || selectedCabang.includes(a.cabang));
                const filteredDailyData = (mrpData.daily_data || []).filter((d: any) => selectedCabang.includes('All') || selectedCabang.includes(d.cabang));
                const hasInsights = filteredShortageAlerts.length > 0 || filteredDailyData.some((d: any) => d.occupancy_pct > 100);
                if (!hasInsights) return null;
                return (
                  <div className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" /> Rangkuman Status Gudang (Mengikuti Filter)
                    </h4>
                    <div className="flex flex-wrap gap-4">
                      <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3">
                        <AlertOctagon className="w-6 h-6 text-rose-500" />
                        <div>
                          <div className="text-rose-900 font-bold text-lg">{filteredShortageAlerts.length} Alert</div>
                          <div className="text-rose-600 text-xs font-medium">Potensi Kekurangan Stok</div>
                        </div>
                      </div>
                      <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                        <div>
                          <div className="text-amber-900 font-bold text-lg">
                            {filteredDailyData.filter((d: any) => d.occupancy_pct > 100).length} Insiden
                          </div>
                          <div className="text-amber-700 text-xs font-medium">Over Kapasitas Gudang</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Matplotlib Generated Charts Grid */}
              {mrpData.charts && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.entries(mrpData.charts).map(([key, b64]: [string, any], idx) => {
                    if (!b64) return null;
                    const titleMap: Record<string, string> = {
                      balance_forecast: "📈 Tren Balance - Skenario Forecast",
                      balance_target: "📈 Tren Balance - Skenario Target",
                      occupancy_forecast: "🏢 Occupancy Gudang - Skenario Forecast",
                      occupancy_target: "🏢 Occupancy Gudang - Skenario Target"
                    };
                    return (
                      <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-inner">
                        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2 border-b border-white/5 pb-2">
                          {titleMap[key] || key}
                        </h4>
                        <div className="overflow-hidden rounded-xl bg-white/5 flex items-center justify-center">
                          <img
                            src={`data:image/png;base64,${b64}`}
                            alt={titleMap[key] || key}
                            className="w-full h-auto object-contain rounded-lg hover:scale-[1.02] transition-transform duration-300"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          )}

          {/* ═══ INVENTORY INTELLIGENCE SECTION ═══ */}
          {results.inventory_analysis && (
            <>
              <div className="border-t border-border pt-8">
                <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase mb-6">
                  <PackageSearch className="w-7 h-7 text-primary" />
                  Inventory Intelligence (ABC-XYZ)
                </h2>

                {/* Inventory KPI Row */}
                <div className="grid md:grid-cols-4 gap-6 mb-6">
                  <KPICard title="Total Kategori" value={results.inventory_analysis.kpi_summary?.total_categories || 0} icon={<LayoutGrid />} />
                  <KPICard title="Class A (Fast Movers)" value={results.inventory_analysis.kpi_summary?.a_class_count || 0} icon={<CheckCircle />} />
                  <KPICard title="High Volatility (Z)" value={results.inventory_analysis.kpi_summary?.z_class_count || 0} icon={<AlertTriangle />} />
                  <KPICard title="Dead Stock (DOH>90)" value={results.inventory_analysis.kpi_summary?.dead_stock_count || 0}
                    icon={<AlertOctagon />} isAlert={(results.inventory_analysis.kpi_summary?.dead_stock_count || 0) > 0} />
                </div>

                {/* Stockout warning */}
                {(results.inventory_analysis.kpi_summary?.stockout_risk_count ?? 0) > 0 && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-3 mb-6">
                    <AlertOctagon className="w-5 h-5 text-destructive shrink-0" />
                    <span className="text-sm text-foreground">
                      <b>{results.inventory_analysis.kpi_summary.stockout_risk_count}</b> kategori berisiko stockout (DOH &lt; 14 hari).
                      Segera lakukan replenishment.
                    </span>
                  </div>
                )}

                {/* Chart + filters (Overflow visible) */}
                <GlassCard allowOverflow={true} className="mb-10 p-6 bg-white border-slate-200 shadow-xl relative z-30">
                  <div className="flex flex-col justify-between mb-6 gap-6 border-b border-slate-200 pb-6">
                    <div>
                      <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">ABC-XYZ Matrix Chart</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 max-w-4xl">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">🏢 Filter Cabang:</label>
                          <MultiSelect
                            options={cabangs}
                            selected={selectedCabang}
                            onChange={setSelectedCabang}
                            selectAllLabel="Semua Cabang"
                            placeholder="Pilih Cabang..."
                          />
                        </div>
                        {invCategories.length > 1 && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">📦 Filter Kategori:</label>
                            <MultiSelect
                              options={invCategories}
                              selected={selectedCategory}
                              onChange={setSelectedCategory}
                              selectAllLabel="Semua Kategori"
                              placeholder="Pilih Kategori..."
                            />
                          </div>
                        )}
                        {invClasses.length > 1 && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">🏷️ Filter Class ABC-XYZ:</label>
                            <MultiSelect
                              options={invClasses}
                              selected={selectedClass}
                              onChange={setSelectedClass}
                              selectAllLabel="Semua Class"
                              placeholder="Pilih Class..."
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {filteredInvData.length > 0
                    ? <InventoryChart data={filteredInvData} />
                    : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
                        Tidak ada data untuk filter yang dipilih.
                      </div>
                  }
                </GlassCard>

                {/* Detailed Insights Table */}
                <GlassCard className="mt-6">
                  <h3 className="text-lg font-bold text-foreground mb-4 uppercase tracking-wide">
                    Detailed Insights — Semua Kombinasi Cabang × Kategori
                  </h3>
                  <PaginatedTable
                    data={filteredInvData}
                    pageSize={50}
                    renderTable={(slicedData) => (
                      <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
                        <table className="w-full text-xs text-left text-muted-foreground min-w-[1100px]">
                          <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider">
                            <tr>
                              <th className="px-3 py-3">Cabang</th>
                              <th className="px-3 py-3">Category</th>
                              <th className="px-3 py-3 text-center">Class</th>
                              <th className="px-3 py-3 text-right">Volume</th>
                              <th className="px-3 py-3 text-right">Mean Sales</th>
                              <th className="px-3 py-3 text-right">CV</th>
                              <th className="px-3 py-3 text-right">DOH</th>
                              <th className="px-3 py-3 text-right">On Hand</th>
                              <th className="px-3 py-3 text-center">Trend</th>
                              <th className="px-3 py-3 text-center">Risk</th>
                              <th className="px-3 py-3">Strategy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slicedData.map((row: any, idx: number) => {
                              const abcColor =
                                row.abc === 'A' ? 'text-primary font-bold' :
                                row.abc === 'B' ? 'text-orange-500' : 'text-muted-foreground';
                              const xyzColor =
                                row.xyz === 'X' ? 'text-blue-500' :
                                row.xyz === 'Y' ? 'text-yellow-500' : 'text-destructive';
                              const dohColor = row.doh > 90 ? 'text-destructive font-bold' :
                                               row.doh < 14 ? 'text-orange-500 font-bold' : 'text-foreground';
                              const trendColor = row.trend_pct > 5 ? 'text-primary' :
                                                 row.trend_pct < -5 ? 'text-destructive' : 'text-muted-foreground';

                              return (
                                <tr key={idx} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                  <td className="px-3 py-3 font-medium text-foreground">{row.cabang}</td>
                                  <td className="px-3 py-3 font-medium text-foreground">{row.category}</td>
                                  <td className="px-3 py-3 text-center">
                                    <span className={`font-mono font-bold text-sm ${abcColor}`}>{row.abc}</span>
                                    <span className={`font-mono font-bold text-sm ${xyzColor}`}>{row.xyz}</span>
                                  </td>
                                  <td className="px-3 py-3 text-right font-medium text-foreground">{Number(row.volume).toLocaleString()}</td>
                                  <td className="px-3 py-3 text-right font-medium text-foreground">{Number(row.mean_sales).toLocaleString()}</td>
                                  <td className="px-3 py-3 text-right text-muted-foreground">{Number(row.cv).toFixed(2)}</td>
                                  <td className={`px-3 py-3 text-right ${dohColor}`}>{row.doh}</td>
                                  <td className="px-3 py-3 text-right font-medium text-foreground">{Number(row.on_hand).toLocaleString()}</td>
                                  <td className={`px-3 py-3 text-center font-medium ${trendColor}`}>
                                    {row.trend_pct > 0 ? '▲' : row.trend_pct < 0 ? '▼' : '—'}
                                    {' '}{Math.abs(row.trend_pct).toFixed(1)}%
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {row.stockout_risk && (
                                      <span className="bg-destructive/10 text-destructive text-xs px-1.5 py-0.5 rounded font-bold mr-1">STOCKOUT</span>
                                    )}
                                    {row.overstock && (
                                      <span className="bg-orange-500/10 text-orange-600 text-xs px-1.5 py-0.5 rounded font-bold">OVERSTOCK</span>
                                    )}
                                    {!row.stockout_risk && !row.overstock && (
                                      <span className="text-muted-foreground font-semibold text-xs">OK</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-muted-foreground text-xs max-w-xs leading-relaxed">{row.strategy}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  />
                </GlassCard>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

