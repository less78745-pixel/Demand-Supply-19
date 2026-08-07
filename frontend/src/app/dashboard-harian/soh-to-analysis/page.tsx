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
  Layers, HelpCircle, Sparkles, FileSpreadsheet, Zap, AlertTriangle, CheckCircle2, TrendingUp,
  Filter, Search, X, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';
import * as XLSX from 'xlsx';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1', '#f43f5e', '#84cc16'];
const TO_COLORS = ['#f97316', '#ef4444', '#eab308', '#ec4899', '#f43f5e', '#d946ef', '#fb923c', '#fde047']; // Warm tones
const VESSEL_COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#6366f1', '#14b8a6', '#84cc16', '#38bdf8', '#10b981']; // Cool tones

const getPillarCategory = (colName: string): 'On Hand' | 'VESSEL' | 'TO' | 'PLAN LOADING' | 'TARGET SALES' | 'OUTSTANDING TARGET' | 'SALES BERJALAN' | 'Lainnya' => {
  const lower = colName.toLowerCase().trim();
  if (lower.includes('outstanding') || lower === 'outstanding target') return 'OUTSTANDING TARGET';
  if (lower.includes('berjalan') || lower === 'sales berjalan') return 'SALES BERJALAN';
  if (lower === 'target sales' || lower === 'target' || lower.includes('target_sales')) return 'TARGET SALES';
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

// ===== PRECISION & ACCURACY COMPUTATION ENGINE =====
export const parseHighPrecision = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  if (!str) return 0;
  let cleaned = str;
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      cleaned = str.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    cleaned = str.replace(/,/g, '.');
  }
  const parsed = parseFloat(cleaned.replace(/[^0-9.-]+/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

export const toExactFloat = (num: number, decimals: number = 2): number => {
  if (isNaN(num) || !isFinite(num)) return 0;
  return Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals);
};

export interface StockCondition {
  ratio: number;
  status: string;
  badge: string;
  color: string;
}

const calculateStockCondition = (onHand: number, totalTO: number, totalVessel: number, outstandingTarget: number, salesBerjalan: number): StockCondition => {
  const totalSupply = toExactFloat(onHand + totalTO + totalVessel, 4);
  const effectiveTarget = Math.max(0, toExactFloat((outstandingTarget || 0) - (salesBerjalan || 0), 4));
  if (!effectiveTarget || effectiveTarget <= 0) {
    return { ratio: 0, status: 'N/A (Target <= 0)', badge: '⚪ N/A (Target <= 0)', color: 'bg-slate-700/50 text-slate-700 border border-slate-600' };
  }
  const exactRatio = totalSupply / effectiveTarget;
  const ratio = toExactFloat(exactRatio, 2);
  if (ratio > 1.5 || exactRatio > 1.500001) {
    return { ratio, status: 'Overstock', badge: '🟣 OVERSTOCK', color: 'bg-purple-100 text-purple-800 border border-purple-300 shadow-sm shadow-purple-500/10' };
  }
  if (ratio > 1.25 || exactRatio > 1.250001) {
    return { ratio, status: 'Aman', badge: '🟢 AMAN', color: 'bg-emerald-100 text-emerald-800 border border-emerald-300' };
  }
  if ((ratio >= 1.0 && ratio <= 1.25) || (exactRatio >= 0.99999 && exactRatio <= 1.250001)) {
    return { ratio, status: 'Hati-Hati', badge: '🟡 HATI-HATI', color: 'bg-amber-100 text-amber-800 border border-amber-300' };
  }
  return { ratio, status: 'Bahaya', badge: '🔴 BAHAYA', color: 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse' };
};

function generateDemoSOH(): ParsedData {
  const cabangs = ['Surabaya', 'Jakarta', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar'];
  const grups = ['Food & Beverage', 'Home Care', 'Personal Care'];
  const categories = ['Minyak Goreng Premium', 'Beras Setra Ramos', 'Gula Pasir Kristal', 'Tepung Terigu Serbaguna', 'Kopi Bubuk Murni', 'Susu Kental Manis'];
  const insentifTiers = ['Tier 1 (High Performance)', 'Tier 2 (Core Growth)', 'Tier 3 (Standard)', 'Non-Insentif'];
  const doiStatuses = ['ACTIVE', 'FAST MOVING', 'SLOW MOVING', 'NEW ITEM'];

  const headers = [
    'cabang', 'Grup', 'Category', 'Description', 'Status Insentif', 'Status DOI',
    'On Hand', 'TO Week 1', 'TO Week 2', 'TO Week 3', 'TO Week 4',
    'Vessel Week 1', 'Vessel Week 2', 'Vessel Week 3', 'Vessel Week 4',
    'Plan Loading', 'Target Sales', 'Outstanding Target', 'Sales Berjalan'
  ];

  const targetColumns = [
    { index: 6, name: 'On Hand' },
    { index: 7, name: 'TO Week 1' },
    { index: 8, name: 'TO Week 2' },
    { index: 9, name: 'TO Week 3' },
    { index: 10, name: 'TO Week 4' },
    { index: 11, name: 'Vessel Week 1' },
    { index: 12, name: 'Vessel Week 2' },
    { index: 13, name: 'Vessel Week 3' },
    { index: 14, name: 'Vessel Week 4' },
    { index: 15, name: 'Plan Loading' },
    { index: 16, name: 'Target Sales' },
    { index: 17, name: 'Outstanding Target' },
    { index: 18, name: 'Sales Berjalan' }
  ];

  const qtyData: any[] = [];
  const valueData: any[] = [];

  let count = 0;
  cabangs.forEach((cab, cIdx) => {
    categories.forEach((cat, idx) => {
      count++;
      const grup = grups[(cIdx + idx) % grups.length];
      const insentif = insentifTiers[(count + idx) % insentifTiers.length];
      const doi = doiStatuses[(count + cIdx) % doiStatuses.length];
      const desc = `${cat} - Kemasan Karton Penuh (${cab})`;

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
      const targetSales = Math.round(3500 + Math.random() * 5000);
      const outstandingTarget = Math.round(targetSales * (0.6 + Math.random() * 0.3));
      const salesBerjalan = Math.round(outstandingTarget * (0.15 + Math.random() * 0.35));

      const unitPrice = (Math.floor(Math.random() * 25) + 10) * 10000; // Rp 100rb - 350rb

      qtyData.push({
        cabang: cab,
        Grup: grup,
        Category: cat,
        Description: desc,
        'Status Insentif': insentif,
        'Status DOI': doi,
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
        'Target Sales': targetSales,
        'Outstanding Target': outstandingTarget,
        'Sales Berjalan': salesBerjalan
      });

      valueData.push({
        cabang: cab,
        Grup: grup,
        Category: cat,
        Description: desc,
        'Status Insentif': insentif,
        'Status DOI': doi,
        'On Hand': onHand * unitPrice,
        'TO Week 1': to1 * unitPrice,
        'TO Week 2': to2 * unitPrice,
        'TO Week 3': to3 * unitPrice,
        'TO Week 4': to4 * unitPrice,
        'Vessel Week 1': v1 * unitPrice,
        'Vessel Week 2': v2 * unitPrice,
        'Vessel Week 3': v3 * unitPrice,
        'Vessel Week 4': v4 * unitPrice,
        'Plan Loading': planLoading * unitPrice,
        'Target Sales': targetSales * unitPrice,
        'Outstanding Target': outstandingTarget * unitPrice,
        'Sales Berjalan': salesBerjalan * unitPrice
      });
    });
  });

  const sheetNames = ['Nilai Qty', 'Nilai Value'];
  const sheets = {
    'Nilai Qty': { headers, targetColumns, data: qtyData },
    'Nilai Value': { headers, targetColumns, data: valueData }
  };

  return {
    headers,
    targetColumns,
    data: qtyData,
    processed_at: new Date().toISOString(),
    sheetNames,
    sheets
  };
}

export default function SOHAnalysisPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('Nilai Qty');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chartMode, setChartMode] = useState<'weekly' | 'summary' | 'stock'>('weekly');
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('base');
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedInsentif, setSelectedInsentif] = useState<string[]>(['All']);
  const [selectedDoi, setSelectedDoi] = useState<string[]>(['All']);

  // Excel AutoFilter state for SOH TO table
  const [activeSohColModal, setActiveSohColModal] = useState<{ key: string; name: string } | null>(null);
  const [sohModalSearchInput, setSohModalSearchInput] = useState<string>('');
  const [sohColFilters, setSohColFilters] = useState<Record<string, { search?: string; selected?: string[] }>>({});

  useEffect(() => {
    get('last_soh_data').then(saved => {
      if (saved && saved.data && saved.data.length > 0 && saved.sheetNames && saved.sheetNames.length > 1) {
        setParsed(saved);
        if (saved.sheetNames && saved.sheetNames.length > 0) {
          setSelectedSheetName(saved.sheetNames[0]);
        }
      } else {
        const demo = generateDemoSOH();
        setParsed(demo);
        if (demo.sheetNames && demo.sheetNames.length > 0) {
          setSelectedSheetName(demo.sheetNames[0]);
        }
      }
    }).catch(err => {
      console.warn('Failed to load SOH state from IndexDB', err);
      const demo = generateDemoSOH();
      setParsed(demo);
      if (demo.sheetNames && demo.sheetNames.length > 0) {
        setSelectedSheetName(demo.sheetNames[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (parsed && parsed.sheetNames && parsed.sheetNames.length > 0) {
      if (!selectedSheetName || !parsed.sheetNames.includes(selectedSheetName)) {
        setSelectedSheetName(parsed.sheetNames[0]);
      }
    }
  }, [parsed, selectedSheetName]);

  const currentData: ParsedData | null = useMemo(() => {
    if (!parsed) return null;
    if (selectedSheetName && parsed.sheets && parsed.sheets[selectedSheetName]) {
      return {
        ...parsed.sheets[selectedSheetName],
        processed_at: parsed.processed_at,
        sheetNames: parsed.sheetNames,
        sheets: parsed.sheets
      };
    }
    return parsed;
  }, [parsed, selectedSheetName]);

  const handleGenerateDemo = () => {
    const demo = generateDemoSOH();
    setParsed(demo);
    if (demo.sheetNames && demo.sheetNames.length > 0) {
      setSelectedSheetName(demo.sheetNames[0]);
    }
    toast.success('🎉 Data Demo SOH-TO-Vessel (2 Sheet: Qty & Value) Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    try {
      const demo = generateDemoSOH();
      const wb = XLSX.utils.book_new();
      if (demo.sheetNames && demo.sheets) {
        demo.sheetNames.forEach(name => {
          const ws = XLSX.utils.json_to_sheet(demo.sheets![name].data, { header: demo.headers });
          XLSX.utils.book_append_sheet(wb, ws, name);
        });
      } else {
        const ws = XLSX.utils.json_to_sheet(demo.data, { header: demo.headers });
        XLSX.utils.book_append_sheet(wb, ws, "Nilai Qty");
      }
      XLSX.writeFile(wb, "template_soh_to_vessel_2_sheet.xlsx");
      toast.success("📁 Template Excel (2 Sheet: Qty & Value) Berhasil Diunduh");
    } catch (err: any) {
      toast.error("Gagal mengunduh template: " + (err.message || String(err)));
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca file SOH & TO (Excel/CSV)...', { id: 'soh' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      if (parsedData.sheetNames && parsedData.sheetNames.length > 0) {
        setSelectedSheetName(parsedData.sheetNames[0]);
      }
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

  // Identify column names dynamically using currentData
  const colCabang = useMemo(() => currentData ? findColumn(currentData.headers, ['cabang', 'branch_name', 'branch', 'cab', 'regional', 'region']) : undefined, [currentData]);
  const colGrup = useMemo(() => currentData ? findColumn(currentData.headers, ['grup', 'group']) : undefined, [currentData]);
  const colCategory = useMemo(() => currentData ? findColumn(currentData.headers, ['category', 'kategori item', 'kategori', 'item category']) : undefined, [currentData]);
  const colDescription = useMemo(() => currentData ? findColumn(currentData.headers, ['description', 'desc', 'nama barang', 'deskripsi']) : undefined, [currentData]);
  const colInsentif = useMemo(() => currentData ? findColumn(currentData.headers, ['status insentif', 'insentif', 'kategori insentif']) : undefined, [currentData]);
  const colDoi = useMemo(() => currentData ? findColumn(currentData.headers, ['status doi', 'doi', 'doi status']) : undefined, [currentData]);
  const colTargetSales = useMemo(() => currentData ? findColumn(currentData.headers, ['target sales', 'target_sales', 'target sales bulanan', 'target']) : undefined, [currentData]);
  const colOutstandingTarget = useMemo(() => currentData ? findColumn(currentData.headers, ['outstanding target', 'outstanding target sales', 'target sales outstanding']) : undefined, [currentData]);
  const colSalesBerjalan = useMemo(() => currentData ? findColumn(currentData.headers, ['sales berjalan', 'penjualan berjalan', 'actual sales']) : undefined, [currentData]);

  // Filter options
  const cabangs = useMemo(() => currentData && colCabang ? ['All', ...Array.from(new Set(currentData.data.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()] : [], [currentData, colCabang]);
  const categories = useMemo(() => currentData && colCategory ? ['All', ...Array.from(new Set(currentData.data.map(d => d[colCategory]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()] : [], [currentData, colCategory]);
  const insentifs = useMemo(() => currentData && colInsentif ? ['All', ...Array.from(new Set(currentData.data.map(d => d[colInsentif]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua insentif'))).sort()] : [], [currentData, colInsentif]);
  const dois = useMemo(() => currentData && colDoi ? ['All', ...Array.from(new Set(currentData.data.map(d => d[colDoi]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua doi'))).sort()] : [], [currentData, colDoi]);

  // Filtered Data with Scenario Multiplier applied to numerical metrics
  const filtered = useMemo(() => {
    if (!currentData) return [];
    const sc = SCENARIOS.find(s => s.id === activeScenario) || SCENARIOS[0];
    return currentData.data
      .filter(d =>
        (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
        (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
        (!colInsentif || selectedInsentif.includes('All') || selectedInsentif.includes(d[colInsentif])) &&
        (!colDoi || selectedDoi.includes('All') || selectedDoi.includes(d[colDoi]))
      )
      .map(row => {
        const copy = { ...row };
        currentData.targetColumns.forEach(tc => {
          copy[tc.name] = Math.round((row[tc.name] || 0) * sc.multiplier);
        });
        return copy;
      });
  }, [currentData, selectedCabang, selectedCategory, selectedInsentif, selectedDoi, colCabang, colCategory, colInsentif, colDoi, activeScenario]);

  // Pillar mapping
  const pillarColumnsMap = useMemo(() => {
    if (!currentData) return { 'On Hand': [], 'VESSEL': [], 'TO': [], 'PLAN LOADING': [], 'Lainnya': [] };
    const map: Record<string, string[]> = { 'On Hand': [], 'VESSEL': [], 'TO': [], 'PLAN LOADING': [], 'Lainnya': [] };
    currentData.targetColumns.forEach(tc => {
      const cat = getPillarCategory(tc.name);
      if (map[cat]) map[cat].push(tc.name);
    });
    return map;
  }, [currentData]);

  // Grouped Pivot Data per Cabang
  const pivotData = useMemo(() => {
    if (!currentData || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      if (!map[cbg]) {
        map[cbg] = { cabang: cbg, 'On Hand': 0, 'VESSEL': 0, 'TO': 0, 'PLAN LOADING': 0, 'Lainnya': 0, total: 0, details: {} };
        currentData.targetColumns.forEach(tc => { map[cbg].details[tc.name] = 0; });
      }
      currentData.targetColumns.forEach(tc => {
        const val = Math.round(Number(row[tc.name]) || 0);
        const cat = getPillarCategory(tc.name);
        if (map[cbg][cat] !== undefined) {
          map[cbg][cat] += val;
        }
        map[cbg].details[tc.name] = (map[cbg].details[tc.name] || 0) + val;
        if (cat !== 'Lainnya' && cat !== 'TARGET SALES' && cat !== 'OUTSTANDING TARGET' && cat !== 'SALES BERJALAN') {
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
  }, [currentData, filtered, colCabang, selectedCabangForChart]);

  // Weekly Grouped Data with Category Breakdown (Stacked TO vs Vessel W1-W4)
  const weeklyGroupedData = useMemo(() => {
    if (!currentData || filtered.length === 0) return [];
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

        currentData.targetColumns.forEach(tc => {
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
  }, [currentData, filtered, colCabang, colCategory, selectedCabangForChart, categories]);

  // On Hand detail per Category
  const onHandByCategoryData = useMemo(() => {
    if (!currentData || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      const cat = colCategory ? (row[colCategory] || 'Umum') : 'Umum';
      if (!map[cat]) {
        map[cat] = { category: cat, 'On Hand': 0 };
      }
      currentData.targetColumns.forEach(tc => {
        if (getPillarCategory(tc.name) === 'On Hand') {
          map[cat]['On Hand'] += Math.round(Number(row[tc.name]) || 0);
        }
      });
    }
    return Object.values(map).sort((a, b) => b['On Hand'] - a['On Hand']);
  }, [currentData, filtered, colCabang, colCategory, selectedCabangForChart]);

  // Detailed Table Data per Cabang per Category with Condition Logic
  const detailedTableData = useMemo(() => {
    if (!currentData || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'Unknown';
      const grp = colGrup ? (row[colGrup] || 'Umum') : 'Umum';
      const cat = colCategory ? (row[colCategory] || 'Umum') : 'Umum';
      const desc = colDescription ? (row[colDescription] || '-') : '-';
      const ins = colInsentif ? (row[colInsentif] || 'Non-Insentif') : 'Non-Insentif';
      const doi = colDoi ? (row[colDoi] || 'ACTIVE') : 'ACTIVE';
      const key = `${cbg}___${grp}___${cat}___${ins}___${doi}`;

      if (!map[key]) {
        map[key] = {
          key,
          cabang: cbg,
          grup: grp,
          category: cat,
          description: desc,
          statusInsentif: ins,
          statusDoi: doi,
          'On Hand': 0,
          'VESSEL': 0,
          'TO': 0,
          'PLAN LOADING': 0,
          'Target Sales': 0,
          'Outstanding Target': 0,
          'Sales Berjalan': 0
        };
      }

      currentData.targetColumns.forEach(tc => {
        const val = Math.round(Number(row[tc.name]) || 0);
        const pillar = getPillarCategory(tc.name);
        if (colTargetSales && tc.name === colTargetSales) {
          map[key]['Target Sales'] += val;
        } else if (colOutstandingTarget && tc.name === colOutstandingTarget) {
          map[key]['Outstanding Target'] += val;
        } else if (colSalesBerjalan && tc.name === colSalesBerjalan) {
          map[key]['Sales Berjalan'] += val;
        } else if (pillar === 'OUTSTANDING TARGET') {
          map[key]['Outstanding Target'] += val;
        } else if (pillar === 'SALES BERJALAN') {
          map[key]['Sales Berjalan'] += val;
        } else if (pillar === 'TARGET SALES') {
          map[key]['Target Sales'] += val;
        } else if (map[key][pillar] !== undefined && pillar !== 'Lainnya') {
          map[key][pillar] += val;
        }
      });
    }

    return Object.values(map).map(item => {
      const totalInbound = (item['VESSEL'] || 0) + (item['TO'] || 0) + (item['PLAN LOADING'] || 0);
      const totalSupply = (item['On Hand'] || 0) + (item['TO'] || 0) + (item['VESSEL'] || 0);
      const effectiveTarget = Math.max(0, (item['Outstanding Target'] || 0) - (item['Sales Berjalan'] || 0));
      const cond = calculateStockCondition(item['On Hand'], item['TO'], item['VESSEL'], item['Outstanding Target'], item['Sales Berjalan']);
      return {
        ...item,
        totalInbound,
        totalSupply,
        effectiveTarget,
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
  }, [currentData, filtered, colCabang, colGrup, colCategory, colDescription, colInsentif, colDoi, colTargetSales, colOutstandingTarget, colSalesBerjalan]);

  const getSohColVal = (row: any, colKey: string): string => {
    if (colKey === 'cabang') return String(row.cabang || '');
    if (colKey === 'grup') return String(row.grup || '');
    if (colKey === 'category') return String(row.category || '');
    if (colKey === 'statusDoi') return String(row.statusDoi || '');
    if (colKey === 'statusInsentif') return String(row.statusInsentif || '');
    if (colKey === 'onHand') return String(Math.round(row['On Hand'] || 0).toLocaleString('id-ID'));
    if (colKey === 'to') return String(Math.round(row['TO'] || 0).toLocaleString('id-ID'));
    if (colKey === 'vessel') return String(Math.round(row['VESSEL'] || 0).toLocaleString('id-ID'));
    if (colKey === 'totalSupply') return String(Math.round(row.totalSupply || (row['On Hand'] + row['TO'] + row['VESSEL']) || 0).toLocaleString('id-ID'));
    if (colKey === 'planLoading') return String(Math.round(row['PLAN LOADING'] || 0).toLocaleString('id-ID'));
    if (colKey === 'targetSales') return row['Target Sales'] > 0 ? String(Math.round(row['Target Sales']).toLocaleString('id-ID')) : '-';
    if (colKey === 'target') return row['Outstanding Target'] > 0 ? String(Math.round(row['Outstanding Target']).toLocaleString('id-ID')) : '-';
    if (colKey === 'salesBerjalan') return row['Sales Berjalan'] > 0 ? String(Math.round(row['Sales Berjalan']).toLocaleString('id-ID')) : '-';
    if (colKey === 'effectiveTarget') return row.effectiveTarget > 0 ? String(Math.round(row.effectiveTarget).toLocaleString('id-ID')) : '-';
    if (colKey === 'ratio') return row.effectiveTarget > 0 ? `${row.ratio}x` : 'N/A';
    if (colKey === 'badge') return String(row.badge || '');
    return '';
  };

  const currentSohUniqueValues = useMemo(() => {
    if (!activeSohColModal) return [];
    const set = new Set<string>();
    detailedTableData.forEach(r => {
      const val = getSohColVal(r, activeSohColModal.key);
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [detailedTableData, activeSohColModal]);

  const displayedSohTableData = useMemo(() => {
    return detailedTableData.filter(row => {
      for (const [key, filter] of Object.entries(sohColFilters)) {
        if (!filter) continue;
        const val = getSohColVal(row, key);
        if (filter.selected && filter.selected.length > 0 && !filter.selected.includes(val)) {
          return false;
        }
        if (filter.search && !val.toLowerCase().includes(filter.search.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [detailedTableData, sohColFilters]);

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

  // Pie Chart Data (% Status DOI per Total On Hand + TO + Vessel)
  const pieDoiData = useMemo(() => {
    if (!detailedTableData || detailedTableData.length === 0) return [];
    const map: Record<string, number> = {};

    for (const row of detailedTableData) {
      if (selectedCabangForChart !== 'All' && row.cabang !== selectedCabangForChart) continue;
      const doi = row.statusDoi || 'ACTIVE / UMUM';
      if (!map[doi]) map[doi] = 0;
      map[doi] += (row.totalSupply || 0);
    }

    const grandTotal = Object.values(map).reduce((a, b) => a + b, 0);
    if (grandTotal === 0) return [];

    const DOI_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'];

    return Object.entries(map)
      .filter(([_, val]) => val > 0)
      .map(([doi, val], idx) => ({
        name: doi,
        value: val,
        percentage: Number(((val / grandTotal) * 100).toFixed(1)),
        color: DOI_COLORS[idx % DOI_COLORS.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [detailedTableData, selectedCabangForChart]);

  // Pie Chart Data (% Status Insentif per Total On Hand + TO + Vessel)
  const pieInsentifData = useMemo(() => {
    if (!detailedTableData || detailedTableData.length === 0) return [];
    const map: Record<string, number> = {};

    for (const row of detailedTableData) {
      if (selectedCabangForChart !== 'All' && row.cabang !== selectedCabangForChart) continue;
      const ins = row.statusInsentif || 'Non-Insentif / Umum';
      if (!map[ins]) map[ins] = 0;
      map[ins] += (row.totalSupply || 0);
    }

    const grandTotal = Object.values(map).reduce((a, b) => a + b, 0);
    if (grandTotal === 0) return [];

    const INS_COLORS = ['#a855f7', '#ec4899', '#f97316', '#3b82f6', '#10b981', '#eab308'];

    return Object.entries(map)
      .filter(([_, val]) => val > 0)
      .map(([ins, val], idx) => ({
        name: ins,
        value: val,
        percentage: Number(((val / grandTotal) * 100).toFixed(1)),
        color: INS_COLORS[idx % INS_COLORS.length]
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
      return { totalOH: 0, totalTO: 0, totalVessel: 0, totalSupply: 0, totalTargetSales: 0, totalOutstanding: 0, totalSalesBerjalan: 0, totalEffectiveTarget: 0, globalRatio: 0, globalStatus: 'N/A', badgeColor: 'bg-slate-700/50 text-slate-700 border-slate-600', countOverstock: 0, countAman: 0, countHati: 0, countBahaya: 0, totalItems: 0 };
    }
    let totalOH = 0;
    let totalTO = 0;
    let totalVessel = 0;
    let totalTargetSales = 0;
    let totalOutstanding = 0;
    let totalSalesBerjalan = 0;
    let countOverstock = 0;
    let countAman = 0;
    let countHati = 0;
    let countBahaya = 0;

    for (const row of detailedTableData) {
      totalOH += (row['On Hand'] || 0);
      totalTO += (row['TO'] || 0);
      totalVessel += (row['VESSEL'] || 0);
      totalTargetSales += (row['Target Sales'] || 0);
      totalOutstanding += (row['Outstanding Target'] || 0);
      totalSalesBerjalan += (row['Sales Berjalan'] || 0);
      if (row.status === 'Overstock') countOverstock++;
      else if (row.status === 'Aman') countAman++;
      else if (row.status === 'Hati-Hati') countHati++;
      else if (row.status === 'Bahaya') countBahaya++;
    }

    const totalSupply = totalOH + totalTO + totalVessel;
    const totalEffectiveTarget = Math.max(0, totalOutstanding - totalSalesBerjalan);
    const globalRatio = totalEffectiveTarget > 0 ? Number((totalSupply / totalEffectiveTarget).toFixed(2)) : 0;
    
    let globalStatus = '⚪ N/A (Target <= 0)';
    let badgeColor = 'bg-slate-100 text-slate-800 border border-slate-300';
    if (globalRatio > 1.5) {
      globalStatus = '🟣 OVERSTOCK (Rasio > 1.50)';
      badgeColor = 'bg-purple-100 text-purple-800 border border-purple-300 shadow-lg shadow-purple-500/20';
    } else if (globalRatio > 1.25) {
      globalStatus = '🟢 AMAN (Rasio 1.25 - 1.50)';
      badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-300';
    } else if (globalRatio >= 1.0) {
      globalStatus = '🟡 HATI-HATI (Rasio 1.0 - 1.25)';
      badgeColor = 'bg-amber-100 text-amber-800 border border-amber-300';
    } else if (totalEffectiveTarget > 0) {
      globalStatus = '🔴 BAHAYA (Rasio < 1.0)';
      badgeColor = 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse';
    }

    return {
      totalOH: Math.round(totalOH),
      totalTO: Math.round(totalTO),
      totalVessel: Math.round(totalVessel),
      totalSupply: Math.round(totalSupply),
      totalTargetSales: Math.round(totalTargetSales),
      totalOutstanding: Math.round(totalOutstanding),
      totalSalesBerjalan: Math.round(totalSalesBerjalan),
      totalEffectiveTarget: Math.round(totalEffectiveTarget),
      globalRatio,
      globalStatus,
      badgeColor,
      countOverstock,
      countAman,
      countHati,
      countBahaya,
      totalItems: detailedTableData.length
    };
  }, [detailedTableData]);

  // Calculation Insights for Ratio from detailedTableData
  const ratioInsights = useMemo(() => {
    if (!detailedTableData || detailedTableData.length === 0) return null;
    const totalItems = detailedTableData.length;
    let overstockCount = 0;
    let amanCount = 0;
    let hatiCount = 0;
    let bahayaCount = 0;
    let totalSurplusQty = 0;
    let totalDefisitQty = 0;

    const criticalItems: any[] = [];
    const overstockItems: any[] = [];

    detailedTableData.forEach(item => {
      const diff = (item.totalSupply || 0) - (item.effectiveTarget || 0);
      if (item.status === 'Overstock') {
        overstockCount++;
        totalSurplusQty += Math.max(0, diff);
        overstockItems.push({ ...item, surplus: diff });
      } else if (item.status === 'Aman') {
        amanCount++;
      } else if (item.status === 'Hati-Hati') {
        hatiCount++;
      } else if (item.status === 'Bahaya') {
        bahayaCount++;
        totalDefisitQty += Math.abs(Math.min(0, diff));
        criticalItems.push({ ...item, defisit: Math.abs(diff) });
      }
    });

    criticalItems.sort((a, b) => (a.ratio - b.ratio) || (b.defisit - a.defisit));
    overstockItems.sort((a, b) => (b.ratio - a.ratio) || (b.surplus - a.surplus));

    const topCritical = criticalItems.slice(0, 3);
    const topOverstock = overstockItems.slice(0, 3);
    const bahayaPct = Number(((bahayaCount / totalItems) * 100).toFixed(1));
    const overstockPct = Number(((overstockCount / totalItems) * 100).toFixed(1));

    return {
      totalItems,
      overstockCount,
      amanCount,
      hatiCount,
      bahayaCount,
      bahayaPct,
      overstockPct,
      totalSurplusQty,
      totalDefisitQty,
      topCritical,
      topOverstock
    };
  }, [detailedTableData]);

  const handleExport = () => {
    if (!currentData || !currentData.data || displayedSohTableData.length === 0) return;
    const header = [
      'Cabang',
      'Grup',
      'Kategori Item',
      'Status DOI',
      'Status Insentif',
      'On Hand (SOH)',
      'Total TO (W1-W4)',
      'Total Vessel (W1-W4)',
      'Total Pasokan (OH+TO+Vessel)',
      'Plan Loading',
      'Target Sales',
      'Outstanding Target',
      'Sales Berjalan',
      'Target Efektif (Outstanding - Sales Berjalan)',
      'Hasil Hitungan (Rasio Pasokan vs Target Efektif)',
      'Kesimpulan Kondisi'
    ].map(h => `"${h}"`).join(',');
    const lines = [header];

    displayedSohTableData.forEach(row => {
      const line = [
        `"${String(row.cabang || '').replace(/"/g, '""')}"`,
        `"${String(row.grup || '').replace(/"/g, '""')}"`,
        `"${String(row.category || '').replace(/"/g, '""')}"`,
        `"${String(row.statusDoi || '').replace(/"/g, '""')}"`,
        `"${String(row.statusInsentif || '').replace(/"/g, '""')}"`,
        Math.round(row['On Hand'] || 0),
        Math.round(row['TO'] || 0),
        Math.round(row['VESSEL'] || 0),
        Math.round(row.totalSupply || 0),
        Math.round(row['PLAN LOADING'] || 0),
        Math.round(row['Target Sales'] || 0),
        Math.round(row['Outstanding Target'] || 0),
        Math.round(row['Sales Berjalan'] || 0),
        Math.round(row.effectiveTarget || 0),
        row.ratio || 0,
        `"${row.status}"`
      ].join(',');
      lines.push(line);
    });

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getStandardFilename(`SOH_TO_Komparatif_Detail_${selectedSheetName}_${activeScenario}`, new Date().toISOString(), 'csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📊 Hasil Analisis SOH & TO Detail Berhasil Diekspor!');
  };

  const isValueMode = Boolean(currentData?.sheetNames && selectedSheetName && (selectedSheetName.toLowerCase().includes('val') || selectedSheetName.toLowerCase().includes('rp')));
  const unitLabel = isValueMode ? 'Rp / Value' : 'Qty';

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
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
              SOH-TO-Vessel <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-teal-300">(Weekly Grouping Analytics)</span>
            </h1>
            <p className="text-slate-700 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
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
        <GlassCard className="p-6 border-emerald-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Panduan Raw Data & Upload SOH (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-cyan-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo 5-Pilar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">📌 Pengelompakan 5 Pilar Inbound:</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-600">
                <li><b>On Hand:</b> Stok fisik siap jual di gudang masing-masing cabang.</li>
                <li><b>Vessel (Kapal):</b> Stok yang sedang dalam perjalanan muat laut/kapal barang.</li>
                <li><b>TO (Transfer Order):</b> Stok dalam pengiriman darat antar cabang atau gudang pusat.</li>
                <li><b>Plan Loading & Ready:</b> Stok dalam tahap konfirmasi dan perencanaan bongkar muat.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">⚙️ Fitur Pembacaan Excel Pintar (XLSX):</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Modul ini kini dilengkapi engine parsing <b>XLSX & CSV ArrayBuffer</b>. Anda bebas mengunggah file Excel (.xlsx) maupun CSV hasil unduhan ERP/Google Sheet tanpa keraguan error karakter atau salah baca angka!
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Unggah File Data SOH Anda (Excel / CSV):</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data SOH (Sheet: On Hand)"
              description="Drag & drop file Excel/CSV di sini. Sistem otomatis memetakan kolom mingguan ke 5 grup pilar SOH."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── SHEET SWITCHER (NILAI QTY VS NILAI VALUE) ─── */}
      {parsed?.sheetNames && parsed.sheetNames.length > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-emerald-500/30 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Pilih Sumber Data / Sheet Evaluasi ({unitLabel}):
            </h3>
            <p className="text-xs text-slate-600">
              Beralih secara instan antara sheet <span className="text-emerald-400 font-bold">Nilai QTY</span> dan <span className="text-cyan-400 font-bold">Nilai VALUE (Rp)</span> untuk analisis komparatif pasokan terhadap target penjualan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {parsed.sheetNames.map((sheet: string) => {
              const isActive = selectedSheetName === sheet;
              const isValue = sheet.toLowerCase().includes('val') || sheet.toLowerCase().includes('rp');
              return (
                <button
                  key={sheet}
                  onClick={() => {
                    setSelectedSheetName(sheet);
                    toast.success(`Beralih ke Sheet: ${sheet}`);
                  }}
                  className={`flex-1 sm:flex-none px-5 py-3 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2.5 shadow-xl border ${
                    isActive
                      ? isValue
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-slate-900 border-cyan-400 scale-105 shadow-cyan-500/25'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-900 border-emerald-400 scale-105 shadow-emerald-500/25'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <FileSpreadsheet className={`w-4 h-4 ${isActive ? 'text-slate-900' : isValue ? 'text-cyan-400' : 'text-emerald-400'}`} />
                  {sheet}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Evaluasi & Simulasi SOH:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk menguji ketahanan stok fisik secara instan!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-slate-900 border-transparent ring-2 ring-white/20 shadow-emerald-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-emerald-400'}`} />
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

      {/* ─── EXECUTIVE KPI SUMMARY CHIPS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <KPICard
          title="Total On Hand Fisik"
          value={`${totalOnHand.toLocaleString('id-ID')} ${unitLabel}`}
          trend="Siap Jual Gudang Cabang"
          icon={<Package className="w-5 h-5 text-emerald-400" />}
          className="border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition"
        />
        <KPICard
          title="Total Inbound (On Order)"
          value={`${totalInbound.toLocaleString('id-ID')} ${unitLabel}`}
          trend="Gabungan Vessel + TO + Loading"
          icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
          className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
        />
      </div>

      {/* ─── FILTER CONTROLS & SELECTION (EXPANDED & OVERFLOW-VISIBLE) ─── */}
      <GlassCard allowOverflow={true} className="p-6 border-slate-200 bg-white backdrop-blur-xl mb-10 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🏢 Filter Cabang:</label>
            <MultiSelect
              options={cabangs}
              selected={selectedCabang}
              onChange={setSelectedCabang}
              selectAllLabel="Semua Cabang"
              placeholder="Pilih Cabang..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📦 Filter Kategori:</label>
            <MultiSelect
              options={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
              selectAllLabel="Semua Kategori"
              placeholder="Pilih Kategori..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🔖 Filter Status DOI:</label>
            <MultiSelect
              options={dois}
              selected={selectedDoi}
              onChange={setSelectedDoi}
              selectAllLabel="Semua Status DOI"
              placeholder="Pilih DOI..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🏆 Filter Insentif:</label>
            <MultiSelect
              options={insentifs}
              selected={selectedInsentif}
              onChange={setSelectedInsentif}
              selectAllLabel="Semua Insentif"
              placeholder="Pilih Insentif..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📍 Sorot Grafik Cabang:</label>
            <select
              value={selectedCabangForChart}
              onChange={(e) => setSelectedCabangForChart(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 outline-none transition font-semibold cursor-pointer shadow-md"
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                {chartMode === 'weekly' ? 'Grafik Grouping Mingguan: TO vs Vessel per Kategori (W1 - W4)' : chartMode === 'stock' ? 'Detail On Hand (Fisik) per Kategori Barang' : 'Grafik Komparasi Pilar SOH & Inbound per Cabang'}
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Sorotan: <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b> • Skenario Aktif: <b className="text-amber-300">{activeScenario.toUpperCase()}</b> • Satuan: <b className="text-emerald-400">{unitLabel}</b>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setChartMode('weekly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'weekly' ? 'bg-gradient-to-r from-orange-500 to-blue-600 text-slate-900 shadow-md scale-105' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                📅 Grouping per Week (W1-W4)
              </button>
              <button
                onClick={() => setChartMode('summary')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'summary' ? 'bg-emerald-500 text-slate-900 shadow-md scale-105' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Summary Cabang
              </button>
              <button
                onClick={() => setChartMode('stock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'stock' ? 'bg-emerald-600 text-slate-900 shadow-md scale-105' : 'text-slate-600 hover:text-emerald-400'
                }`}
              >
                📦 On Hand
              </button>
            </div>
          </div>

          {chartMode === 'weekly' && (
            <div className="mb-4 p-3 rounded-xl bg-slate-100 border border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-700 flex items-center gap-2 font-medium">
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                <b>Batang Kembar per Minggu:</b> Batang Kiri = Stack Transfer Order (TO) | Batang Kanan (Garis Biru) = Stack On Vessel (Kapal)
              </span>
              <span className="text-slate-600 text-[11px] italic">Warna segmen mewakili breakdown per kategori barang</span>
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
                    cursor={{ fill: 'rgba(255, 255, 255, 0.08)', stroke: '#f97316', strokeWidth: 1 }}
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#f97316', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.9)', color: '#ffffff', opacity: 1, padding: '12px', zIndex: 100 }}
                    labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '6px', marginBottom: '6px' }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 700, padding: '2px 0' }}
                    formatter={(value: any, name: any) => [`${Number(value || 0).toLocaleString('id-ID')} ${unitLabel}`, name || '']}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '11px', fontWeight: 'bold' }} />
                  {categories.filter(c => c !== 'All').map((cat, idx) => (
                    <Bar key={`to-${cat}`} dataKey={`${cat} (TO)`} name={`${cat} (TO)`} stackId="TO" fill={TO_COLORS[idx % TO_COLORS.length]} maxBarSize={45} />
                  ))}
                  {categories.filter(c => c !== 'All').map((cat, idx) => (
                    <Bar key={`vessel-${cat}`} dataKey={`${cat} (Vessel)`} name={`${cat} (Vessel)`} stackId="Vessel" fill={VESSEL_COLORS[idx % VESSEL_COLORS.length]} stroke="#e2e8f0" strokeWidth={1} maxBarSize={45} opacity={0.95} />
                  ))}
                </BarChart>
              ) : chartMode === 'stock' ? (
                <BarChart data={onHandByCategoryData} margin={{ top: 20, right: 30, left: 10, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="category" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255, 255, 255, 0.08)', stroke: '#10b981', strokeWidth: 1 }}
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#10b981', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.9)', color: '#ffffff', opacity: 1, padding: '12px', zIndex: 100 }}
                    labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '6px', marginBottom: '6px' }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 700 }}
                    formatter={(value: any) => [`${Number(value).toLocaleString('id-ID')} ${unitLabel}`, 'On Hand Fisik']}
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
                    cursor={{ fill: 'rgba(255, 255, 255, 0.08)', stroke: '#10b981', strokeWidth: 1 }}
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#10b981', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.9)', color: '#ffffff', opacity: 1, padding: '12px', zIndex: 100 }}
                    labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '6px', marginBottom: '6px' }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 700, padding: '2px 0' }}
                    formatter={(value: any, name: any) => [`${Number(value || 0).toLocaleString('id-ID')} ${unitLabel}`, name || '']}
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

      {/* ─── PIE CHARTS: PROPORSIONAL PASOKAN (KATEGORI, STATUS DOI, & STATUS INSENTIF) ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-400" />
              Analisis Kontribusi & Proporsi Pasokan (Kategori Item, Status DOI & Status Insentif)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Proporsi total stok pasokan (On Hand + Semua TO + Semua Vessel) dalam satuan <b className="text-emerald-400">{unitLabel}</b> di <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* PIE 1: KATEGORI */}
          {pieCategoryData && pieCategoryData.length > 0 && (
            <GlassCard className="p-5 border-purple-500/30 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-2xl flex flex-col">
              <h3 className="text-sm font-black text-purple-300 border-b border-slate-200 pb-3 mb-3 flex items-center gap-2">
                🏷️ Porsi per Kategori Item
              </h3>
              <div className="h-[240px] w-full shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieCategoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percentage }: any) => `${String(name || '').length > 12 ? String(name || '').slice(0, 10) + '..' : (name || 'Umum')} (${percentage || 0}%)`}
                      outerRadius={78}
                      innerRadius={35}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieCategoryData.map((entry, index) => (
                        <Cell key={`cell-cat-${index}`} fill={entry.color} stroke="#030712" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => [
                        `${Number(value).toLocaleString('id-ID')} ${unitLabel} (${props.payload.percentage}%)`,
                        `Kategori: ${name}`
                      ]}
                      contentStyle={{ backgroundColor: '#030712', borderColor: '#a855f7', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.8)', padding: '10px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-3 flex-1 overflow-y-auto max-h-[220px] pr-1">
                {pieCategoryData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 border border-slate-200/50 hover:border-slate-600 transition text-xs">
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-bold text-slate-900 truncate" title={item.name}>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-extrabold text-slate-700">{item.value.toLocaleString('id-ID')}</span>
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black text-slate-900 font-mono" style={{ backgroundColor: item.color }}>{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* PIE 2: STATUS DOI */}
          {pieDoiData && pieDoiData.length > 0 && (
            <GlassCard className="p-5 border-blue-500/30 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-2xl flex flex-col">
              <h3 className="text-sm font-black text-blue-300 border-b border-slate-200 pb-3 mb-3 flex items-center gap-2">
                🔖 Porsi per Status DOI
              </h3>
              <div className="h-[240px] w-full shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieDoiData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percentage }: any) => `${String(name || '').length > 12 ? String(name || '').slice(0, 10) + '..' : (name || 'Umum')} (${percentage || 0}%)`}
                      outerRadius={78}
                      innerRadius={35}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieDoiData.map((entry, index) => (
                        <Cell key={`cell-doi-${index}`} fill={entry.color} stroke="#030712" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => [
                        `${Number(value).toLocaleString('id-ID')} ${unitLabel} (${props.payload.percentage}%)`,
                        `Status DOI: ${name}`
                      ]}
                      contentStyle={{ backgroundColor: '#030712', borderColor: '#3b82f6', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.8)', padding: '10px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-3 flex-1 overflow-y-auto max-h-[220px] pr-1">
                {pieDoiData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 border border-slate-200/50 hover:border-slate-600 transition text-xs">
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-bold text-slate-900 truncate" title={item.name}>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-extrabold text-slate-700">{item.value.toLocaleString('id-ID')}</span>
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black text-slate-900 font-mono" style={{ backgroundColor: item.color }}>{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* PIE 3: STATUS INSENTIF */}
          {pieInsentifData && pieInsentifData.length > 0 && (
            <GlassCard className="p-5 border-emerald-500/30 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-2xl flex flex-col">
              <h3 className="text-sm font-black text-emerald-300 border-b border-slate-200 pb-3 mb-3 flex items-center gap-2">
                🏆 Porsi per Status Insentif
              </h3>
              <div className="h-[240px] w-full shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieInsentifData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percentage }: any) => `${String(name || '').length > 12 ? String(name || '').slice(0, 10) + '..' : (name || 'Umum')} (${percentage || 0}%)`}
                      outerRadius={78}
                      innerRadius={35}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieInsentifData.map((entry, index) => (
                        <Cell key={`cell-ins-${index}`} fill={entry.color} stroke="#030712" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => [
                        `${Number(value).toLocaleString('id-ID')} ${unitLabel} (${props.payload.percentage}%)`,
                        `Status Insentif: ${name}`
                      ]}
                      contentStyle={{ backgroundColor: '#030712', borderColor: '#10b981', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.8)', padding: '10px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-3 flex-1 overflow-y-auto max-h-[220px] pr-1">
                {pieInsentifData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 border border-slate-200/50 hover:border-slate-600 transition text-xs">
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-bold text-slate-900 truncate" title={item.name}>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-extrabold text-slate-700">{item.value.toLocaleString('id-ID')}</span>
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black text-slate-900 font-mono" style={{ backgroundColor: item.color }}>{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* ─── HASIL KESIMPULAN HITUNGAN (EXECUTIVE CALCULATION CONCLUSION) ─── */}
      <GlassCard className="p-6 border-amber-500/40 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 shadow-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2.5">
              <Sparkles className="w-3.5 h-3.5" /> Hasil Kesimpulan Hitungan Otomatis ({unitLabel})
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
              Kesimpulan Rasio Pasokan vs Target Efektif (Outstanding - Sales Berjalan)
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Rumus Hitungan: <code className="px-2 py-0.5 bg-slate-100 text-amber-300 font-mono rounded font-bold">(On Hand + Semua TO + Semua Vessel) ÷ (Outstanding Target - Sales Berjalan)</code>
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end shrink-0">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Kesimpulan Kondisi Keseluruhan:</span>
            <span className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-xl ${calculationSummary.badgeColor}`}>
              {calculationSummary.globalStatus}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200/60 shadow-inner">
            <span className="text-xs font-bold text-slate-600 block mb-1">📦 Total Pasokan (SOH+TO+Vessel)</span>
            <span className="text-base sm:text-lg font-black font-mono text-emerald-400">
              {calculationSummary.totalSupply.toLocaleString('id-ID')} {unitLabel}
            </span>
            <span className="text-[11px] text-slate-600 block mt-1">Stok Fisik + Dalam Perjalanan</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200/60 shadow-inner">
            <span className="text-xs font-bold text-slate-600 block mb-1">🎯 Outstanding Target</span>
            <span className="text-base sm:text-lg font-black font-mono text-amber-300">
              {calculationSummary.totalOutstanding.toLocaleString('id-ID')} {unitLabel}
            </span>
            <span className="text-[11px] text-slate-600 block mt-1">Target Belum Tercapai Awal</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200/60 shadow-inner">
            <span className="text-xs font-bold text-slate-600 block mb-1">🛒 Sales Berjalan</span>
            <span className="text-base sm:text-lg font-black font-mono text-cyan-400">
              {calculationSummary.totalSalesBerjalan.toLocaleString('id-ID')} {unitLabel}
            </span>
            <span className="text-[11px] text-slate-600 block mt-1">Penjualan Aktual Berlangsung</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200/60 shadow-inner">
            <span className="text-xs font-bold text-slate-600 block mb-1">⚖️ Hasil Rasio vs Target Efektif</span>
            <span className="text-base sm:text-xl font-black font-mono text-slate-900">
              {calculationSummary.globalRatio}x
            </span>
            <span className="text-[11px] text-cyan-300 font-medium block mt-1">Target Efektif: {calculationSummary.totalEffectiveTarget.toLocaleString('id-ID')}</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200/60 shadow-inner">
            <span className="text-xs font-bold text-slate-600 block mb-1">📊 Rincian Kesimpulan Baris</span>
            <div className="flex flex-wrap items-center gap-1 mt-1 font-mono text-[11px] font-black">
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30" title="Overstock (>1.50)">🟣 {calculationSummary.countOverstock}</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" title="Aman (1.25-1.50)">🟢 {calculationSummary.countAman}</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Hati-Hati (1.0-1.25)">🟡 {calculationSummary.countHati}</span>
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30" title="Bahaya (<1.0)">🔴 {calculationSummary.countBahaya}</span>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span><b>Logika Evaluasi Kondisi:</b> 🟣 <b>Overstock</b> = Rasio &gt; 1.50 | 🟢 <b>Aman</b> = Rasio 1.25 s/d 1.50 | 🟡 <b>Hati-Hati</b> = Rasio 1.00 s/d 1.25 | 🔴 <b>Bahaya</b> = Rasio &lt; 1.00 (Pasokan Tidak Mencukupi Sisa Target)</span>
          </span>
        </div>
      </GlassCard>

      {/* ─── TABEL ANALISIS KOMPARATIF SOH & TO — DETAIL CABANG PER KATEGORI ─── */}
      <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2.5">
                <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                Tabel Analisis Komparatif SOH & TO — Detail Cabang per Kategori ({displayedSohTableData.length} dari {detailedTableData.length} baris)
              </h3>
              {Object.keys(sohColFilters).some(k => sohColFilters[k]?.search || (sohColFilters[k]?.selected && sohColFilters[k]?.selected.length > 0)) && (
                <button
                  onClick={() => { setSohColFilters({}); toast.success('Semua filter kolom dibersihkan!'); }}
                  className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset Filter Kolom
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Dilengkapi <b className="text-emerald-400">Filter Kolom ala Excel</b> (klik ikon filter di setiap header untuk cari & pilih data) guna menganalisis rincian persediaan dan kesimpulan hitungan rasio secara mandiri.
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-900 font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV ({displayedSohTableData.length} baris)
          </button>
        </div>

        {/* Excel Filter Modal Popover */}
        {activeSohColModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-slate-800">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-emerald-400" /> Filter Kolom: <span className="text-emerald-400">{activeSohColModal.name}</span>
                </h4>
                <button onClick={() => setActiveSohColModal(null)} className="text-slate-600 hover:text-slate-900 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-600" />
                  <input
                    type="text"
                    value={sohModalSearchInput}
                    onChange={e => setSohModalSearchInput(e.target.value)}
                    placeholder={`Cari dalam ${activeSohColModal.name}...`}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  {sohModalSearchInput && (
                    <button onClick={() => setSohModalSearchInput('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-900 text-xs">
                      Hapus
                    </button>
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-2 space-y-1 text-xs">
                  <div className="text-[11px] font-semibold text-slate-600 mb-1 px-1 flex justify-between">
                    <span>Daftar Nilai Unik ({currentSohUniqueValues.length}):</span>
                  </div>
                  {currentSohUniqueValues.filter(val => !sohModalSearchInput || val.toLowerCase().includes(sohModalSearchInput.toLowerCase())).slice(0, 50).map((val, idx) => {
                    const isChecked = !sohColFilters[activeSohColModal.key]?.selected?.length || sohColFilters[activeSohColModal.key]?.selected?.includes(val);
                    return (
                      <label
                        key={idx}
                        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer text-slate-700 truncate"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const curSelected = sohColFilters[activeSohColModal.key]?.selected?.length ? [...(sohColFilters[activeSohColModal.key]?.selected || [])] : [...currentSohUniqueValues];
                            let nextSelected: string[];
                            if (curSelected.includes(val)) {
                              nextSelected = curSelected.filter(item => item !== val);
                            } else {
                              nextSelected = [...curSelected, val];
                            }
                            if (nextSelected.length === currentSohUniqueValues.length) {
                              nextSelected = [];
                            }
                            setSohColFilters({
                              ...sohColFilters,
                              [activeSohColModal.key]: { ...sohColFilters[activeSohColModal.key], selected: nextSelected }
                            });
                          }}
                          className="rounded border-slate-200 bg-white text-emerald-500 focus:ring-emerald-500/30"
                        />
                        <span className="truncate" title={val}>{val || '(Kosong)'}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    onClick={() => {
                      const next = { ...sohColFilters };
                      delete next[activeSohColModal.key];
                      setSohColFilters(next);
                      setSohModalSearchInput('');
                      toast.success(`Filter kolom ${activeSohColModal.name} direset!`);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-700 font-bold text-xs text-slate-700 hover:text-slate-900 transition"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => {
                      setSohColFilters({
                        ...sohColFilters,
                        [activeSohColModal.key]: { ...sohColFilters[activeSohColModal.key], search: sohModalSearchInput }
                      });
                      setActiveSohColModal(null);
                      toast.success('Filter diterapkan!');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-bold text-xs text-slate-950 transition shadow-lg shadow-emerald-500/20"
                  >
                    Terapkan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── INSIGHT DARI HASIL HITUNGAN RATIO ─── */}
        {ratioInsights && (
          <div className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900/90 to-slate-950/95 border border-emerald-500/30 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center gap-2.5 border-b border-emerald-500/20 pb-3 mb-4">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </span>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-wide flex items-center gap-2">
                  Insight Strategis Evaluasi Rasio Ketersediaan (SOH & TO vs Target)
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-600">
                  Analisis otomatis keseimbangan stok berdasarkan rasio pasokan terhadap sisa target operasional.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Box 1: Distribusi Status Rasio */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div>
                  <span className="text-slate-600 font-bold uppercase tracking-wider text-[10px] mb-2 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-blue-400" /> Distribusi Kondisi Stok
                  </span>
                  <div className="space-y-1.5 mt-2">
                    <div className="flex justify-between items-center text-slate-700">
                      <span>🟢 Aman (1.25 - 1.50x):</span>
                      <strong className="text-emerald-400 font-mono">{ratioInsights.amanCount} Item</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>🟡 Hati-Hati (1.00 - 1.25x):</span>
                      <strong className="text-amber-400 font-mono">{ratioInsights.hatiCount} Item</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>🟣 Overstock (&gt;1.50x):</span>
                      <strong className="text-purple-300 font-mono">{ratioInsights.overstockCount} ({ratioInsights.overstockPct}%)</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>🔴 Bahaya (&lt;1.00x):</span>
                      <strong className="text-rose-400 font-mono">{ratioInsights.bahayaCount} ({ratioInsights.bahayaPct}%)</strong>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 text-[11px] text-slate-600">
                  Total Surplus Qty: <strong className="text-purple-300">{ratioInsights.totalSurplusQty.toLocaleString('id-ID')}</strong> | Defisit: <strong className="text-rose-400">{ratioInsights.totalDefisitQty.toLocaleString('id-ID')}</strong>
                </div>
              </div>

              {/* Box 2: Sorotan Kritis (Bahaya / Defisit) */}
              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col justify-between">
                <div>
                  <span className="text-rose-300 font-bold uppercase tracking-wider text-[10px] mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Cabang & Kategori Defisit Kritis (Rasio &lt; 1.0x)
                  </span>
                  {ratioInsights.topCritical.length > 0 ? (
                    <div className="space-y-2 mt-2">
                      {ratioInsights.topCritical.map((item, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/20 flex flex-col gap-0.5">
                          <div className="flex justify-between items-center font-bold text-slate-900 text-[11px]">
                            <span>📍 {item.cabang}</span>
                            <span className="text-rose-400 font-mono px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">{item.ratio}x</span>
                          </div>
                          <div className="text-[10px] text-slate-700 truncate">📦 {item.category}</div>
                          <div className="text-[10px] text-rose-300 font-mono">Defisit Pasokan: -{item.defisit.toLocaleString('id-ID')} Unit</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-emerald-400 font-bold flex flex-col items-center gap-1">
                      <CheckCircle2 className="w-6 h-6" />
                      <span>Semua cabang & kategori memiliki pasokan mencukupi!</span>
                    </div>
                  )}
                </div>
                {ratioInsights.topCritical.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-rose-500/20 text-[10px] text-rose-300">
                    ⚠️ <strong>Action Required:</strong> Segera percepat jadwal Vessel & Plan Loading untuk item di atas!
                  </div>
                )}
              </div>

              {/* Box 3: Sorotan Overstock & Rekomendasi Rebalancing */}
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 flex flex-col justify-between">
                <div>
                  <span className="text-purple-300 font-bold uppercase tracking-wider text-[10px] mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" /> Potensi Rebalancing (Overstock &gt; 1.5x)
                  </span>
                  {ratioInsights.topOverstock.length > 0 ? (
                    <div className="space-y-2 mt-2">
                      {ratioInsights.topOverstock.map((item, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-purple-950/40 border border-purple-500/20 flex flex-col gap-0.5">
                          <div className="flex justify-between items-center font-bold text-slate-900 text-[11px]">
                            <span>📍 {item.cabang}</span>
                            <span className="text-purple-300 font-mono px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">{item.ratio}x</span>
                          </div>
                          <div className="text-[10px] text-slate-700 truncate">📦 {item.category}</div>
                          <div className="text-[10px] text-purple-300 font-mono">Surplus Pasokan: +{item.surplus.toLocaleString('id-ID')} Unit</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-600 font-semibold">
                      Tidak ditemukan penumpukan stok ekstrem.
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2.5 border-t border-purple-500/20 text-[10px] text-purple-300">
                  💡 <strong>Rekomendasi:</strong> Lakukan <b>Transfer Order (TO)</b> antar-cabang dari area surplus ke cabang yang defisit guna menekan holding cost.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[650px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1650px]">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 z-20 shadow-md text-[11px] tracking-wider text-center">
              <tr className="border-b border-slate-200">
                <th className="py-3.5 px-3 text-left">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span>Cabang & Lokasi</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'cabang', name: 'Cabang' }); setSohModalSearchInput(sohColFilters['cabang']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5 text-emerald-400" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-2.5 border-l border-slate-200 text-left text-purple-400">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span>👥 Grup</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'grup', name: 'Grup' }); setSohModalSearchInput(sohColFilters['grup']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5 text-purple-400" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-3 border-l border-slate-200 text-left text-cyan-400">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span>🏷️ Kategori Item</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'category', name: 'Kategori Item' }); setSohModalSearchInput(sohColFilters['category']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5 text-cyan-400" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-2.5 border-l border-slate-200 text-left text-emerald-300">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span>🏆 Status Insentif</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'statusInsentif', name: 'Status Insentif' }); setSohModalSearchInput(sohColFilters['statusInsentif']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5 text-emerald-300" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-2.5 border-l border-slate-200 text-left text-blue-300">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span>🔖 Status DOI</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'statusDoi', name: 'Status DOI' }); setSohModalSearchInput(sohColFilters['statusDoi']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5 text-blue-300" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-2.5 border-l border-slate-200 text-emerald-400">
                  <div className="flex items-center gap-1 justify-between">
                    <span>📦 On Hand</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'onHand', name: 'On Hand' }); setSohModalSearchInput(sohColFilters['onHand']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-2.5 border-l border-slate-200 text-orange-400">
                  <div className="flex items-center gap-1 justify-between">
                    <span>🚚 TO (W1-W4)</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'to', name: 'TO' }); setSohModalSearchInput(sohColFilters['to']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-2.5 border-l border-slate-200 text-blue-400">
                  <div className="flex items-center gap-1 justify-between">
                    <span>🚢 Vessel (W1-W4)</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'vessel', name: 'Vessel' }); setSohModalSearchInput(sohColFilters['vessel']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-3 border-l border-slate-200 bg-emerald-950/40 text-emerald-300 font-extrabold">
                  <div className="flex items-center gap-1 justify-between">
                    <span>🧮 Total Pasokan (OH+TO+Vessel)</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'totalSupply', name: 'Total Pasokan' }); setSohModalSearchInput(sohColFilters['totalSupply']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-2.5 border-l border-slate-200 text-purple-400">
                  <div className="flex items-center gap-1 justify-between">
                    <span>⚙️ Plan Loading</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'planLoading', name: 'Plan Loading' }); setSohModalSearchInput(sohColFilters['planLoading']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-3 border-l border-slate-200 bg-white text-amber-300">
                  <div className="flex items-center gap-1 justify-between">
                    <span>🎯 Outstanding Target</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'target', name: 'Outstanding Target' }); setSohModalSearchInput(sohColFilters['target']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-3 border-l border-slate-200 bg-white text-cyan-300">
                  <div className="flex items-center gap-1 justify-between">
                    <span>🛒 Sales Berjalan</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'salesBerjalan', name: 'Sales Berjalan' }); setSohModalSearchInput(sohColFilters['salesBerjalan']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-3 border-l border-slate-200 bg-amber-950/30 text-amber-300 font-extrabold">
                  <div className="flex items-center gap-1 justify-between">
                    <span>📊 Target Efektif</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'effectiveTarget', name: 'Target Efektif' }); setSohModalSearchInput(sohColFilters['effectiveTarget']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-3 border-l border-slate-200 text-cyan-300">
                  <div className="flex items-center gap-1 justify-between">
                    <span>📈 Hasil Hitungan (Rasio)</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'ratio', name: 'Rasio' }); setSohModalSearchInput(sohColFilters['ratio']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
                <th className="py-3.5 px-3 border-l border-slate-200 text-slate-900">
                  <div className="flex items-center gap-1 justify-between">
                    <span>🛡️ Kesimpulan Kondisi</span>
                    <button onClick={() => { setActiveSohColModal({ key: 'badge', name: 'Kesimpulan Kondisi' }); setSohModalSearchInput(sohColFilters['badge']?.search || ''); }} className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition"><Filter className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-700 text-center font-medium">
              {displayedSohTableData.map((row) => (
                <tr
                  key={row.key}
                  className="hover:bg-slate-100 transition cursor-pointer"
                  onClick={() => setSelectedCabangForChart(row.cabang === selectedCabangForChart ? 'All' : row.cabang)}
                >
                  <td className="py-3 px-3 text-left align-middle font-black text-slate-900 text-sm">
                    {row.cabang}
                  </td>
                  <td className="py-3 px-2.5 border-l border-slate-200 text-left align-middle font-semibold text-purple-300">
                    {row.grup || '-'}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-200 text-left align-middle">
                    <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/50 truncate max-w-[180px]" title={row.category}>
                      {row.category}
                    </span>
                  </td>
                  <td className="py-3 px-2.5 border-l border-slate-200 text-left align-middle">
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 truncate max-w-[140px]" title={row.statusInsentif}>
                      {row.statusInsentif || '-'}
                    </span>
                  </td>
                  <td className="py-3 px-2.5 border-l border-slate-200 text-left align-middle">
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-blue-300 bg-blue-950/40 border border-blue-800/40 truncate max-w-[140px]" title={row.statusDoi}>
                      {row.statusDoi || '-'}
                    </span>
                  </td>
                  <td className="py-3 px-2.5 border-l border-slate-200 font-extrabold text-emerald-400 text-sm font-mono">
                    {Math.round(row['On Hand'] || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-2.5 border-l border-slate-200 font-mono text-orange-300 font-bold">
                    {Math.round(row['TO'] || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-2.5 border-l border-slate-200 font-mono text-blue-300 font-bold">
                    {Math.round(row['VESSEL'] || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-200 bg-emerald-950/20 font-black font-mono text-emerald-300 text-sm">
                    {(row.totalSupply || (row['On Hand'] + row['TO'] + row['VESSEL']) || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-2.5 border-l border-slate-200 font-mono text-purple-300">
                    {Math.round(row['PLAN LOADING'] || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-200 font-bold text-amber-300 font-mono text-sm bg-slate-50">
                    {row['Outstanding Target'] > 0 ? Math.round(row['Outstanding Target']).toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-200 font-bold text-cyan-300 font-mono text-sm bg-slate-50">
                    {row['Sales Berjalan'] > 0 ? Math.round(row['Sales Berjalan']).toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-200 bg-amber-950/20 font-black font-mono text-amber-300 text-sm">
                    {row.effectiveTarget > 0 ? Math.round(row.effectiveTarget).toLocaleString('id-ID') : (row.effectiveTarget < 0 ? `(${Math.round(Math.abs(row.effectiveTarget)).toLocaleString('id-ID')})` : '-')}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-200 font-black font-mono text-sm text-slate-900">
                    {row.effectiveTarget > 0 ? `${row.ratio}x` : 'N/A'}
                  </td>
                  <td className="py-3 px-3 border-l border-slate-200">
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
