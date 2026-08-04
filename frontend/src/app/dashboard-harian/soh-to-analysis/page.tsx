/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  ClipboardList, Download, Info, Package, BarChart3,
  Layers, HelpCircle, Sparkles, FileSpreadsheet, Zap, AlertTriangle, CheckCircle2, TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1', '#f43f5e', '#84cc16'];
const TO_COLORS = ['#f97316', '#ef4444', '#eab308', '#ec4899', '#f43f5e', '#d946ef', '#fb923c', '#fde047']; // Warm tones
const VESSEL_COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#6366f1', '#14b8a6', '#84cc16', '#38bdf8', '#10b981']; // Cool tones

const getPillarCategory = (colName: string): 'On Hand' | 'VESSEL' | 'TO' | 'PLAN LOADING' | 'TARGET SALES' | 'Lainnya' => {
  const lower = colName.toLowerCase().trim();
  if (lower.includes('outstanding') || lower.includes('target') || lower.includes('target sales')) return 'TARGET SALES';
  if (lower.includes('on hand') || lower === 'soh' || lower.includes('stock on hand')) return 'On Hand';
  if (lower.includes('vessel') || lower.includes('kapal') || lower.includes('on vessel')) return 'VESSEL';
  if (lower.includes('to ') || lower.startsWith('to') || lower.includes('transfer order')) return 'TO';
  if (lower.includes('plan loading') || lower.includes('loading') || lower.includes('load')) return 'PLAN LOADING';
  return 'Lainnya';
};

const PILLAR_COLORS: Record<string, string> = {
  'On Hand': '#10b981',      // Emerald Green
  'VESSEL': '#3b82f6',       // Blue
  'TO': '#f97316',           // Orange
  'PLAN LOADING': '#a855f7', // Purple
  'TARGET SALES': '#ec4899', // Pink
  'Lainnya': '#64748b'       // Slate Gray
};

const PILLAR_ORDER = ['On Hand', 'VESSEL', 'TO', 'PLAN LOADING'];

type ScenarioType = 'base' | 'fast' | 'buffer';

const SCENARIOS = [
  {
    id: 'base' as ScenarioType,
    title: 'Jalur 1: Evaluasi Stok Current (Base SOH)',
    desc: 'Analisis ketersediaan stok fisik harian terhadap rata-rata pemakaian (ADU) berjalan secara real-time.',
    color: 'from-emerald-600 to-teal-500',
    icon: BarChart3,
    multiplier: 1.0
  },
  {
    id: 'fast' as ScenarioType,
    title: 'Jalur 2: Simulasi Fast-Moving (Turnover 30 Hari)',
    desc: 'Percepatan target perputaran persediaan untuk menekan biaya penyimpanan (Holding Cost) dan optimasi ruang.',
    color: 'from-blue-600 to-cyan-500',
    icon: TrendingUp,
    multiplier: 1.15
  },
  {
    id: 'buffer' as ScenarioType,
    title: 'Jalur 3: Proteksi Buffer Seasonality (+20%)',
    desc: 'Simulasi ketahanan stok terhadap lonjakan permintaan dadakan pada musim puncak (Peak Season / Hari Raya).',
    color: 'from-purple-600 to-indigo-500',
    icon: Zap,
    multiplier: 0.85
  }
];

export interface StockCondition {
  ratio: number;
  status: string;
  badge: string;
  color: string;
}

const calculateStockCondition = (onHand: number, totalTO: number, totalVessel: number, targetSales: number): StockCondition => {
  const totalSupply = onHand + totalTO + totalVessel;
  if (!targetSales || targetSales <= 0) {
    return { ratio: 0, status: 'N/A (Target 0)', badge: '⚪ N/A (Target 0)', color: 'bg-slate-700/50 text-slate-300 border border-slate-600' };
  }
  const ratio = Number((totalSupply / targetSales).toFixed(2));
  if (ratio > 1.25) {
    return { ratio, status: 'Aman', badge: '🟢 AMAN', color: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' };
  }
  if (ratio >= 1.0 && ratio <= 1.25) {
    return { ratio, status: 'Hati-Hati', badge: '🟡 HATI-HATI', color: 'bg-amber-500/20 text-amber-400 border border-amber-500/40' };
  }
  return { ratio, status: 'Bahaya', badge: '🔴 BAHAYA', color: 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' };
};

function generateDemoSOH(): ParsedData {
  const cabangs = ['Surabaya', 'Jakarta', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar'];
  const categories = ['Minyak Goreng Premium', 'Beras Setra Ramos', 'Gula Pasir Kristal', 'Tepung Terigu Serbaguna', 'Kopi Bubuk Murni', 'Susu Kental Manis'];
  const data: any[] = [];

  cabangs.forEach(cab => {
    categories.forEach(cat => {
      const onHand = Math.round(1500 + Math.random() * 4500);
      const to1 = Math.round(100 + Math.random() * 300);
      const to2 = Math.round(150 + Math.random() * 350);
      const to3 = Math.round(120 + Math.random() * 300);
      const to4 = Math.round(180 + Math.random() * 400);
      const v1 = Math.round(200 + Math.random() * 500);
      const v2 = Math.round(180 + Math.random() * 450);
      const v3 = Math.round(220 + Math.random() * 480);
      const v4 = Math.round(150 + Math.random() * 420);
      const planLoading = Math.round(500 + Math.random() * 1200);
      const targetSales = Math.round(2500 + Math.random() * 4500);
      data.push({
        cabang: cab,
        Category: cat,
        'On Hand': onHand,
        'TO Week 1': to1,
        'TO Week 2': to2,
        'TO Week 3': to3,
        'TO Week 4': to4,
        'Vessel Week 1': v1,
        'Vessel Week 2': v2,
        'Vessel Week 3': v3,
        'Vessel Week 4': v4,
        'Plan Loading': planLoading,
        'Outstanding Target Sales': targetSales
      });
    });
  });

  return {
    headers: ['cabang', 'Category', 'On Hand', 'TO Week 1', 'TO Week 2', 'TO Week 3', 'TO Week 4', 'Vessel Week 1', 'Vessel Week 2', 'Vessel Week 3', 'Vessel Week 4', 'Plan Loading', 'Outstanding Target Sales'],
    targetColumns: [
      { index: 2, name: 'On Hand' },
      { index: 3, name: 'TO Week 1' },
      { index: 4, name: 'TO Week 2' },
      { index: 5, name: 'TO Week 3' },
      { index: 6, name: 'TO Week 4' },
      { index: 7, name: 'Vessel Week 1' },
      { index: 8, name: 'Vessel Week 2' },
      { index: 9, name: 'Vessel Week 3' },
      { index: 10, name: 'Vessel Week 4' },
      { index: 11, name: 'Plan Loading' },
      { index: 12, name: 'Outstanding Target Sales' }
    ],
    data,
    processed_at: new Date().toISOString()
  };
}

export default function SOHAnalysisPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chartMode, setChartMode] = useState<'weekly' | 'summary' | 'stock'>('weekly');
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('base');
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedInsentif, setSelectedInsentif] = useState<string[]>(['All']);

  useEffect(() => {
    get('last_soh_data').then(saved => {
      if (saved && saved.data && saved.data.length > 0) {
        setParsed(saved);
      } else {
        setParsed(generateDemoSOH());
      }
    }).catch(err => {
      console.warn('Failed to load SOH state from IndexDB', err);
      setParsed(generateDemoSOH());
    });
  }, []);

  const handleGenerateDemo = () => {
    const demo = generateDemoSOH();
    setParsed(demo);
    toast.success('🎉 Data Demo SOH-TO-Vessel Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    const headers = 'cabang,Category,On Hand,TO Week 1,TO Week 2,TO Week 3,TO Week 4,Vessel Week 1,Vessel Week 2,Vessel Week 3,Vessel Week 4,Plan Loading,Outstanding Target Sales';
    const row1 = 'Surabaya,Minyak Goreng Premium,4500,250,300,280,320,500,450,480,520,900,5200';
    const row2 = 'Jakarta,Beras Setra Ramos,2800,200,220,210,230,400,380,410,390,1100,3500';
    const blob = new Blob(['\ufeff' + headers + '\n' + row1 + '\n' + row2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_soh_to_vessel.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📁 Template CSV SOH-TO-Vessel Berhasil Diunduh');
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca file SOH & TO (Excel/CSV)...', { id: 'soh' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      try {
        await set('last_soh_data', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('✅ Data SOH & TO Berhasil Diproses!', { id: 'soh' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'soh' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['cabang', 'branch_name', 'branch', 'cab', 'regional', 'region']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['grup', 'category', 'kategori item', 'kategori', 'item category']) : undefined, [parsed]);
  const colInsentif = useMemo(() => parsed ? findColumn(parsed.headers, ['insentif', 'kategori insentif']) : undefined, [parsed]);
  const colTargetSales = useMemo(() => parsed ? findColumn(parsed.headers, ['outstanding target sales', 'target sales', 'outstanding target', 'target_sales', 'target', 'target sales outstanding']) : undefined, [parsed]);

  // Filter options
  const cabangs = useMemo(() => parsed && colCabang ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()] : [], [parsed, colCabang]);
  const categories = useMemo(() => parsed && colCategory ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colCategory]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()] : [], [parsed, colCategory]);
  const insentifs = useMemo(() => parsed && colInsentif ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colInsentif]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua insentif'))).sort()] : [], [parsed, colInsentif]);

  // Filtered Data with Scenario Multiplier applied to numerical metrics
  const filtered = useMemo(() => {
    if (!parsed) return [];
    const sc = SCENARIOS.find(s => s.id === activeScenario) || SCENARIOS[0];
    return parsed.data
      .filter(d =>
        (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
        (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
        (!colInsentif || selectedInsentif.includes('All') || selectedInsentif.includes(d[colInsentif]))
      )
      .map(row => {
        const copy = { ...row };
        parsed.targetColumns.forEach(tc => {
          copy[tc.name] = Math.round((row[tc.name] || 0) * sc.multiplier);
        });
        return copy;
      });
  }, [parsed, selectedCabang, selectedCategory, selectedInsentif, colCabang, colCategory, colInsentif, activeScenario]);

  // Pillar mapping
  const pillarColumnsMap = useMemo(() => {
    if (!parsed) return { 'On Hand': [], 'VESSEL': [], 'TO': [], 'PLAN LOADING': [], 'Lainnya': [] };
    const map: Record<string, string[]> = { 'On Hand': [], 'VESSEL': [], 'TO': [], 'PLAN LOADING': [], 'Lainnya': [] };
    parsed.targetColumns.forEach(tc => {
      const cat = getPillarCategory(tc.name);
      if (map[cat]) map[cat].push(tc.name);
    });
    return map;
  }, [parsed]);

  // Grouped Pivot Data per Cabang
  const pivotData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      if (!map[cbg]) {
        map[cbg] = { cabang: cbg, 'On Hand': 0, 'VESSEL': 0, 'TO': 0, 'PLAN LOADING': 0, 'Lainnya': 0, total: 0, details: {} };
        parsed.targetColumns.forEach(tc => { map[cbg].details[tc.name] = 0; });
      }
      parsed.targetColumns.forEach(tc => {
        const val = Math.round(Number(row[tc.name]) || 0);
        const cat = getPillarCategory(tc.name);
        if (map[cbg][cat] !== undefined) {
          map[cbg][cat] += val;
        }
        map[cbg].details[tc.name] += val;
        if (cat !== 'Lainnya' && cat !== 'TARGET SALES') {
          map[cbg].total += val;
        }
      });
    }
    return Object.values(map).map(item => {
      item['On Hand'] = Math.round(item['On Hand']);
      item['VESSEL'] = Math.round(item['VESSEL']);
      item['TO'] = Math.round(item['TO']);
      item['PLAN LOADING'] = Math.round(item['PLAN LOADING']);
      item.total = Math.round(item.total);
      return item;
    }).sort((a, b) => b.total - a.total);
  }, [parsed, filtered, colCabang, selectedCabangForChart]);

  // Weekly Grouped Data with Category Breakdown (Stacked TO vs Vessel W1-W4)
  const weeklyGroupedData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const weeks = [1, 2, 3, 4];
    const activeCategories = categories.filter(c => c !== 'All');

    return weeks.map(w => {
      const item: Record<string, any> = { week: `Week ${w}` };
      activeCategories.forEach(cat => {
        item[`${cat} (TO)`] = 0;
        item[`${cat} (Vessel)`] = 0;
      });

      for (const row of filtered) {
        const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
        if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;
        
        const cat = colCategory ? (row[colCategory] || 'Umum') : 'Umum';

        parsed.targetColumns.forEach(tc => {
          const name = tc.name.toLowerCase();
          if (name.includes(`week ${w}`) || name.endsWith(`w${w}`) || name.includes(`wk ${w}`) || name.includes(`minggu ${w}`)) {
            const val = Math.round(Number(row[tc.name]) || 0);
            if (name.includes('to') || name.startsWith('to') || name.includes('transfer')) {
              item[`${cat} (TO)`] = (item[`${cat} (TO)`] || 0) + val;
            } else if (name.includes('vessel') || name.includes('kapal') || name.includes('laut')) {
              item[`${cat} (Vessel)`] = (item[`${cat} (Vessel)`] || 0) + val;
            }
          }
        });
      }
      return item;
    });
  }, [parsed, filtered, colCabang, colCategory, selectedCabangForChart, categories]);

  // On Hand detail per Category
  const onHandByCategoryData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      const cat = colCategory ? (row[colCategory] || 'Umum') : 'Umum';
      if (!map[cat]) {
        map[cat] = { category: cat, 'On Hand': 0 };
      }
      parsed.targetColumns.forEach(tc => {
        if (getPillarCategory(tc.name) === 'On Hand') {
          map[cat]['On Hand'] += Math.round(Number(row[tc.name]) || 0);
        }
      });
    }
    return Object.values(map).sort((a, b) => b['On Hand'] - a['On Hand']);
  }, [parsed, filtered, colCabang, colCategory, selectedCabangForChart]);

  // Detailed Table Data per Cabang per Category with Condition Logic
  const detailedTableData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'Unknown';
      const cat = colCategory ? (row[colCategory] || 'Umum') : 'Umum';
      const key = `${cbg}___${cat}`;

      if (!map[key]) {
        map[key] = {
          key,
          cabang: cbg,
          category: cat,
          'On Hand': 0,
          'VESSEL': 0,
          'TO': 0,
          'PLAN LOADING': 0,
          'Outstanding Target Sales': 0
        };
      }

      parsed.targetColumns.forEach(tc => {
        const val = Math.round(Number(row[tc.name]) || 0);
        const pillar = getPillarCategory(tc.name);
        if (pillar === 'TARGET SALES') {
          map[key]['Outstanding Target Sales'] += val;
        } else if (map[key][pillar] !== undefined) {
          map[key][pillar] += val;
        }
      });

      if (colTargetSales && !parsed.targetColumns.some(t => t.name === colTargetSales)) {
        map[key]['Outstanding Target Sales'] += Math.round(Number(row[colTargetSales]) || 0);
      }
    }

    return Object.values(map).map(item => {
      const totalInbound = item['VESSEL'] + item['TO'] + item['PLAN LOADING'];
      const totalSupply = (item['On Hand'] || 0) + (item['TO'] || 0) + (item['VESSEL'] || 0);
      const cond = calculateStockCondition(item['On Hand'], item['TO'], item['VESSEL'], item['Outstanding Target Sales']);
      return {
        ...item,
        totalInbound,
        totalSupply,
        ratio: cond.ratio,
        status: cond.status,
        badge: cond.badge,
        badgeColor: cond.color
      };
    }).sort((a, b) => {
      if (a.cabang === b.cabang) {
        return (b['On Hand'] + b.totalInbound) - (a['On Hand'] + a.totalInbound);
      }
      return a.cabang.localeCompare(b.cabang);
    });
  }, [parsed, filtered, colCabang, colCategory, colTargetSales]);

  // Pie Chart Data (% Category per Total On Hand + TO + Vessel) - Wajib mengikuti filter Cabang, Kategori & Sorot
  const pieCategoryData = useMemo(() => {
    if (!detailedTableData || detailedTableData.length === 0) return [];
    const map: Record<string, number> = {};

    for (const row of detailedTableData) {
      if (selectedCabangForChart !== 'All' && row.cabang !== selectedCabangForChart) continue;
      const cat = row.category || 'Umum';
      if (!map[cat]) map[cat] = 0;
      map[cat] += (row.totalSupply || 0);
    }

    const grandTotal = Object.values(map).reduce((a, b) => a + b, 0);
    if (grandTotal === 0) return [];

    return Object.entries(map)
      .filter(([_, val]) => val > 0)
      .map(([cat, val], idx) => ({
        name: cat,
        value: val,
        percentage: Number(((val / grandTotal) * 100).toFixed(1)),
        color: COLORS[idx % COLORS.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [detailedTableData, selectedCabangForChart]);

  // Pillar KPIs
  const pillarKpis = useMemo(() => {
    if (!pivotData || pivotData.length === 0) return [];
    return PILLAR_ORDER.map(pillar => {
      const total = pivotData.reduce((a, r) => a + (r[pillar] || 0), 0);
      const cols = pillarColumnsMap[pillar]?.length || 0;
      return { name: pillar, total, cols, color: PILLAR_COLORS[pillar] };
    });
  }, [pivotData, pillarColumnsMap]);

  const totalOnHand = useMemo(() => {
    return pivotData.reduce((a, r) => a + (r['On Hand'] || 0), 0);
  }, [pivotData]);

  const totalInbound = useMemo(() => {
    return pivotData.reduce((a, r) => a + (r['VESSEL'] || 0) + (r['TO'] || 0) + (r['PLAN LOADING'] || 0), 0);
  }, [pivotData]);

  const criticalCount = useMemo(() => {
    return pivotData.filter(r => (r['On Hand'] || 0) < 2000).length;
  }, [pivotData]);

  // Executive Calculation Summary & Condition Breakdown
  const calculationSummary = useMemo(() => {
    if (!detailedTableData || detailedTableData.length === 0) {
      return { totalOH: 0, totalTO: 0, totalVessel: 0, totalSupply: 0, totalTarget: 0, globalRatio: 0, globalStatus: 'N/A', badgeColor: 'bg-slate-700/50 text-slate-300 border-slate-600', countAman: 0, countHati: 0, countBahaya: 0 };
    }
    let totalOH = 0;
    let totalTO = 0;
    let totalVessel = 0;
    let totalTarget = 0;
    let countAman = 0;
    let countHati = 0;
    let countBahaya = 0;

    for (const row of detailedTableData) {
      totalOH += (row['On Hand'] || 0);
      totalTO += (row['TO'] || 0);
      totalVessel += (row['VESSEL'] || 0);
      totalTarget += (row['Outstanding Target Sales'] || 0);
      if (row.status === 'Aman') countAman++;
      else if (row.status === 'Hati-Hati') countHati++;
      else if (row.status === 'Bahaya') countBahaya++;
    }

    const totalSupply = totalOH + totalTO + totalVessel;
    const globalRatio = totalTarget > 0 ? Number((totalSupply / totalTarget).toFixed(2)) : 0;
    let globalStatus = '⚪ N/A (Target 0)';
    let badgeColor = 'bg-slate-700/50 text-slate-300 border border-slate-600';
    if (globalRatio > 1.25) {
      globalStatus = '🟢 AMAN (Rasio > 1.25)';
      badgeColor = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
    } else if (globalRatio >= 1.0) {
      globalStatus = '🟡 HATI-HATI (Rasio 1.0 - 1.25)';
      badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
    } else if (totalTarget > 0) {
      globalStatus = '🔴 BAHAYA (Rasio < 1.0)';
      badgeColor = 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse';
    }

    return {
      totalOH: Math.round(totalOH),
      totalTO: Math.round(totalTO),
      totalVessel: Math.round(totalVessel),
      totalSupply: Math.round(totalSupply),
      totalTarget: Math.round(totalTarget),
      globalRatio,
      globalStatus,
      badgeColor,
      countAman,
      countHati,
      countBahaya,
      totalItems: detailedTableData.length
    };
  }, [detailedTableData]);

  const handleExport = () => {
    if (!parsed || !parsed.data || detailedTableData.length === 0) return;
    const header = [
      'Cabang',
      'Kategori Item',
      'On Hand (SOH)',
      'Total TO (W1-W4)',
      'Total Vessel (W1-W4)',
      'Total Pasokan (OH+TO+Vessel)',
      'Plan Loading',
      'Outstanding Target Sales',
      'Hasil Hitungan (Rasio Pasokan vs Target)',
      'Kesimpulan Kondisi'
    ].map(h => `"${h}"`).join(',');
    const lines = [header];

    detailedTableData.forEach(row => {
      const line = [
        `"${String(row.cabang).replace(/"/g, '""')}"`,
        `"${String(row.category).replace(/"/g, '""')}"`,
        Math.round(row['On Hand'] || 0),
        Math.round(row['TO'] || 0),
        Math.round(row['VESSEL'] || 0),
        Math.round(row.totalSupply || (row['On Hand'] + row['TO'] + row['VESSEL']) || 0),
        Math.round(row['PLAN LOADING'] || 0),
        Math.round(row['Outstanding Target Sales'] || 0),
        row.ratio || 0,
        `"${row.status}"`
      ].join(',');
      lines.push(line);
    });

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getStandardFilename(`SOH_TO_Komparatif_Detail_${activeScenario}`, new Date().toISOString(), 'csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📊 Hasil Analisis SOH & TO Detail Berhasil Diekspor!');
  };

  return (
    <div className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HEADER SECTION ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-6 sm:p-8 border border-emerald-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
              <ClipboardList className="w-3.5 h-3.5" /> Dashboard Data Harian • SOH-TO-Vessel
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              SOH-TO-Vessel <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-teal-300">(Weekly Grouping Analytics)</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Analisis persediaan terstruktur dengan pengelompokan mingguan: <b>On Hand ➔ TO Week 1-4 ➔ Vessel Week 1-4 ➔ Plan Loading</b>.
              Dilengkapi evaluasi ketahanan stok dan grafik perbandingan TO vs Vessel.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TimestampBadge timestamp={parsed?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN, TEMPLATE & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-emerald-500/30 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Panduan Raw Data & Upload SOH (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-cyan-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo 5-Pilar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-white">📌 Pengelompakan 5 Pilar Inbound:</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-400">
                <li><b>On Hand:</b> Stok fisik siap jual di gudang masing-masing cabang.</li>
                <li><b>Vessel (Kapal):</b> Stok yang sedang dalam perjalanan muat laut/kapal barang.</li>
                <li><b>TO (Transfer Order):</b> Stok dalam pengiriman darat antar cabang atau gudang pusat.</li>
                <li><b>Plan Loading & Ready:</b> Stok dalam tahap konfirmasi dan perencanaan bongkar muat.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">⚙️ Fitur Pembacaan Excel Pintar (XLSX):</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Modul ini kini dilengkapi engine parsing <b>XLSX & CSV ArrayBuffer</b>. Anda bebas mengunggah file Excel (.xlsx) maupun CSV hasil unduhan ERP/Google Sheet tanpa keraguan error karakter atau salah baca angka!
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Unggah File Data SOH Anda (Excel / CSV):</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data SOH (Sheet: On Hand)"
              description="Drag & drop file Excel/CSV di sini. Sistem otomatis memetakan kolom mingguan ke 5 grup pilar SOH."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Evaluasi & Simulasi SOH:
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk menguji ketahanan stok fisik secara instan!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-emerald-500/25 scale-[1.02]`
                    : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-emerald-400'}`} />
                    {sc.title}
                  </span>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-black uppercase tracking-wider">
                      Aktif
                    </span>
                  )}
                </div>
                <p className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'text-slate-100 font-medium' : 'text-slate-400'}`}>
                  {sc.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── EXECUTIVE KPI SUMMARY CHIPS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <KPICard
          title="Total On Hand Fisik"
          value={`${totalOnHand.toLocaleString('id-ID')} Qty`}
          trend="Siap Jual Gudang Cabang"
          icon={<Package className="w-5 h-5 text-emerald-400" />}
          className="border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition"
        />
        <KPICard
          title="Total Inbound (On Order)"
          value={`${totalInbound.toLocaleString('id-ID')} Qty`}
          trend="Gabungan Vessel + TO + Loading"
          icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
          className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
        />
      </div>

      {/* ─── FILTER CONTROLS & SELECTION (EXPANDED & OVERFLOW-VISIBLE) ─── */}
      <GlassCard allowOverflow={true} className="p-6 border-slate-800 bg-slate-900/90 backdrop-blur-xl mb-10 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mb-1 block uppercase tracking-wider">🏢 Filter Cabang:</label>
            <MultiSelect
              options={cabangs}
              selected={selectedCabang}
              onChange={setSelectedCabang}
              selectAllLabel="Semua Cabang"
              placeholder="Pilih Cabang..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mb-1 block uppercase tracking-wider">📦 Filter Kategori:</label>
            <MultiSelect
              options={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
              selectAllLabel="Semua Kategori"
              placeholder="Pilih Kategori..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mb-1 block uppercase tracking-wider">📍 Sorot Grafik Cabang:</label>
            <select
              value={selectedCabangForChart}
              onChange={(e) => setSelectedCabangForChart(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-950/90 px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 outline-none transition font-semibold cursor-pointer shadow-md"
            >
              <option value="All">📊 Semua Cabang (Gabungan)</option>
              {cabangs.filter(c => c !== 'All').map(c => (
                <option key={c} value={c}>📍 Fokus: {c}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── VISUALIZATION CHART: WEEKLY & PIVOT PER CABANG ─── */}
      {pivotData && pivotData.length > 0 && (
        <GlassCard className="p-6 border-emerald-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                {chartMode === 'weekly' ? 'Grafik Grouping Mingguan: TO vs Vessel per Kategori (W1 - W4)' : chartMode === 'stock' ? 'Detail On Hand (Fisik) per Kategori Barang' : 'Grafik Komparasi Pilar SOH & Inbound per Cabang'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Sorotan: <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b> • Skenario Aktif: <b className="text-amber-300">{activeScenario.toUpperCase()}</b>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700 shrink-0">
              <button
                onClick={() => setChartMode('weekly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'weekly' ? 'bg-gradient-to-r from-orange-500 to-blue-600 text-white shadow-md scale-105' : 'text-slate-300 hover:text-white'
                }`}
              >
                📅 Grouping per Week (W1-W4)
              </button>
              <button
                onClick={() => setChartMode('summary')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'summary' ? 'bg-emerald-500 text-white shadow-md scale-105' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Summary Cabang
              </button>
              <button
                onClick={() => setChartMode('stock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'stock' ? 'bg-emerald-600 text-white shadow-md scale-105' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                📦 On Hand
              </button>
            </div>
          </div>

          {chartMode === 'weekly' && (
            <div className="mb-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-300 flex items-center gap-2 font-medium">
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                <b>Batang Kembar per Minggu:</b> Batang Kiri = Stack Transfer Order (TO) | Batang Kanan (Garis Biru) = Stack On Vessel (Kapal)
              </span>
              <span className="text-slate-400 text-[11px] italic">Warna segmen mewakili breakdown per kategori barang</span>
            </div>
          )}

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'weekly' ? (
                <BarChart data={weeklyGroupedData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="week" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 13, fontWeight: 700 }} height={40} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#f97316', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', fontSize: '12px' }}
                    labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '11px', fontWeight: 'bold' }} />
                  {categories.filter(c => c !== 'All').map((cat, idx) => (
                    <Bar key={`to-${cat}`} dataKey={`${cat} (TO)`} name={`${cat} (TO)`} stackId="TO" fill={TO_COLORS[idx % TO_COLORS.length]} maxBarSize={45} />
                  ))}
                  {categories.filter(c => c !== 'All').map((cat, idx) => (
                    <Bar key={`vessel-${cat}`} dataKey={`${cat} (Vessel)`} name={`${cat} (Vessel)`} stackId="Vessel" fill={VESSEL_COLORS[idx % VESSEL_COLORS.length]} stroke="#e2e8f0" strokeWidth={1} maxBarSize={45} opacity={0.9} />
                  ))}
                </BarChart>
              ) : chartMode === 'stock' ? (
                <BarChart data={onHandByCategoryData} margin={{ top: 20, right: 30, left: 10, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="category" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#10b981', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                    labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                    formatter={(value: any) => [`${Number(value).toLocaleString('id-ID')} Qty`, 'On Hand Fisik']}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                  <Bar dataKey="On Hand" name="On Hand (Fisik) per Kategori" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    {onHandByCategoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart data={pivotData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="cabang" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={50} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#10b981', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                    labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                  <Bar dataKey="On Hand" name="On Hand (Fisik)" fill="#10b981" stackId="a" />
                  <Bar dataKey="VESSEL" name="Total Vessel (W1-W4)" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="TO" name="Total TO (W1-W4)" fill="#f97316" stackId="a" />
                  <Bar dataKey="PLAN LOADING" name="Plan Loading" fill="#a855f7" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── NEW: PIE CHART % CATEGORY PER TOTAL (ON HAND + TO + VESSEL) ─── */}
      {pieCategoryData && pieCategoryData.length > 0 && (
        <GlassCard className="p-6 border-purple-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-400" />
                Pie Chart Kontribusi Kategori (% per Total On Hand + Semua TO + Semua Vessel)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Persentase proporsional total stok (Fisik & Dalam Perjalanan W1-W4) untuk tiap kategori barang di <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="h-[350px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieCategoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percentage }) => `${name.length > 15 ? name.slice(0, 14) + '..' : name} (${percentage}%)`}
                    outerRadius={115}
                    innerRadius={45}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any, props: any) => [
                      `${Number(value).toLocaleString('id-ID')} Qty (${props.payload.percentage}%)`,
                      `Kategori: ${name}`
                    ]}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#a855f7', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
              <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                📊 Rincian Porsi Stok per Kategori (OH + TO + Vessel):
              </h4>
              <div className="space-y-2">
                {pieCategoryData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition">
                    <div className="flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: item.color }} />
                      <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[170px] sm:max-w-[220px]" title={item.name}>
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-extrabold text-slate-300">
                        {item.value.toLocaleString('id-ID')} Qty
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-black text-white shadow-sm font-mono" style={{ backgroundColor: item.color }}>
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── HASIL KESIMPULAN HITUNGAN (EXECUTIVE CALCULATION CONCLUSION) ─── */}
      <GlassCard className="p-6 border-amber-500/40 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 shadow-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2.5">
              <Sparkles className="w-3.5 h-3.5" /> Hasil Kesimpulan Hitungan Otomatis
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              Kesimpulan Rasio Pasokan vs Outstanding Target Sales
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Rumus Hitungan: <code className="px-2 py-0.5 bg-slate-800 text-amber-300 font-mono rounded font-bold">(On Hand + Semua TO + Semua Vessel) ÷ Outstanding Target Sales</code>
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Kesimpulan Kondisi Keseluruhan:</span>
            <span className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-xl ${calculationSummary.badgeColor}`}>
              {calculationSummary.globalStatus}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 shadow-inner">
            <span className="text-xs font-bold text-slate-400 block mb-1">📦 Total Pasokan (OH+TO+Vessel)</span>
            <span className="text-base sm:text-xl font-black font-mono text-emerald-400">
              {calculationSummary.totalSupply.toLocaleString('id-ID')} Qty
            </span>
            <span className="text-[11px] text-slate-400 block mt-1">Stok Fisik + Muatan W1-W4</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 shadow-inner">
            <span className="text-xs font-bold text-slate-400 block mb-1">🎯 Outstanding Target Sales</span>
            <span className="text-base sm:text-xl font-black font-mono text-amber-300">
              {calculationSummary.totalTarget.toLocaleString('id-ID')} Qty
            </span>
            <span className="text-[11px] text-slate-400 block mt-1">Total Kuota Target Penjualan</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 shadow-inner">
            <span className="text-xs font-bold text-slate-400 block mb-1">⚖️ Hasil Hitungan (Rasio)</span>
            <span className="text-base sm:text-xl font-black font-mono text-white">
              {calculationSummary.globalRatio}x
            </span>
            <span className="text-[11px] text-cyan-400 font-medium block mt-1">Indeks Ketersediaan Pasokan</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 shadow-inner">
            <span className="text-xs font-bold text-slate-400 block mb-1">📊 Rincian Kesimpulan Baris</span>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 font-mono text-[11px] font-black">
              <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" title="Aman (>1.25)">🟢 {calculationSummary.countAman} Aman</span>
              <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Hati-Hati (1.0-1.25)">🟡 {calculationSummary.countHati} Hati-Hati</span>
              <span className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30" title="Bahaya (<1.0)">🔴 {calculationSummary.countBahaya} Bahaya</span>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span><b>Logika Evaluasi Kondisi:</b> 🟢 <b>Aman</b> = Rasio &gt; 1.25 | 🟡 <b>Hati-Hati</b> = Rasio 1.00 s/d 1.25 | 🔴 <b>Bahaya</b> = Rasio &lt; 1.00 (Stok Tidak Mencukupi Target)</span>
          </span>
        </div>
      </GlassCard>

      {/* ─── TABEL ANALISIS KOMPARATIF SOH & TO — DETAIL CABANG PER KATEGORI ─── */}
      <GlassCard className="p-6 border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
              Tabel Analisis Komparatif SOH & TO — Detail Cabang per Kategori
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Menampilkan rincian kuota persediaan untuk <b>setiap kombinasi Cabang dan Kategori Barang ({detailedTableData.length} baris)</b> dengan kesimpulan hitungan rasio secara lengkap.
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[650px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1150px]">
            <thead className="bg-slate-950/95 text-slate-300 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-800 text-[11px] tracking-wider text-center">
                <th className="py-3.5 px-4 text-left">Cabang & Lokasi</th>
                <th className="py-3.5 px-3.5 border-l border-slate-800 text-left text-cyan-400">🏷️ Kategori Item</th>
                <th className="py-3.5 px-3 border-l border-slate-800 text-emerald-400">📦 On Hand</th>
                <th className="py-3.5 px-3 border-l border-slate-800 text-orange-400">🚚 TO (W1-W4)</th>
                <th className="py-3.5 px-3 border-l border-slate-800 text-blue-400">🚢 Vessel (W1-W4)</th>
                <th className="py-3.5 px-3.5 border-l border-slate-800 bg-emerald-950/40 text-emerald-300 font-extrabold">🧮 Total Pasokan (OH+TO+Vessel)</th>
                <th className="py-3.5 px-3 border-l border-slate-800 text-purple-400">⚙️ Plan Loading</th>
                <th className="py-3.5 px-3.5 border-l border-slate-800 bg-slate-900 text-amber-300">🎯 Outstanding Target</th>
                <th className="py-3.5 px-3.5 border-l border-slate-800 text-cyan-300">📈 Hasil Hitungan (Rasio)</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-white">🛡️ Kesimpulan Kondisi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300 text-center font-medium">
              {detailedTableData.map((row) => (
                <tr
                  key={row.key}
                  className="hover:bg-slate-800/60 transition cursor-pointer"
                  onClick={() => setSelectedCabangForChart(row.cabang === selectedCabangForChart ? 'All' : row.cabang)}
                >
                  <td className="py-3 px-4 text-left align-middle font-black text-white text-sm">
                    {row.cabang}
                  </td>
                  <td className="py-3 px-3.5 border-l border-slate-800 text-left align-middle">
                    <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/50 truncate max-w-[200px]" title={row.category}>
                      {row.category}
                    </span>
                  </td>
                  <td className="py-3 px-3 border-l border-slate-800 font-extrabold text-emerald-400 text-sm font-mono">
                    {Math.round(row['On Hand'] || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-800 font-mono text-orange-300 font-bold">
                    {Math.round(row['TO'] || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-800 font-mono text-blue-300 font-bold">
                    {Math.round(row['VESSEL'] || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3.5 border-l border-slate-800 bg-emerald-950/20 font-black font-mono text-emerald-300 text-sm">
                    {(row.totalSupply || (row['On Hand'] + row['TO'] + row['VESSEL']) || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-800 font-mono text-purple-300">
                    {Math.round(row['PLAN LOADING'] || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3.5 border-l border-slate-800 font-extrabold text-amber-300 font-mono text-sm bg-slate-950/40">
                    {row['Outstanding Target Sales'] > 0 ? Math.round(row['Outstanding Target Sales']).toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="py-3 px-3.5 border-l border-slate-800 font-black font-mono text-sm text-cyan-300">
                    {row['Outstanding Target Sales'] > 0 ? `${row.ratio}x` : 'N/A'}
                  </td>
                  <td className="py-3 px-4 border-l border-slate-800">
                    <div className="flex items-center justify-center">
                      <span className={`px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider shadow-sm ${row.badgeColor}`}>
                        {row.badge}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
