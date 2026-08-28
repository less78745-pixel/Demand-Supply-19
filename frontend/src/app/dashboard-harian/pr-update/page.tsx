/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import LZString from 'lz-string';

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  FileBarChart, Info, Calendar, BarChart3, Clock, Table as TableIcon, Download,
  Sparkles, Layers, HelpCircle, FileSpreadsheet, Zap, AlertTriangle, CheckCircle2,
  TrendingUp, Truck, AlertCircle, ExternalLink, Globe, Filter, Search, X, Check, RefreshCw,
  Package, Timer, ShieldAlert, Cloud } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Line
} from 'recharts';
import { get, set } from 'idb-keyval';
import { supabase } from '@/lib/supabase';
import { parseDynamicCSV, findColumn, parseIndonesianNumber, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';
import { ExportHtmlButton } from '@/components/ui/ExportHtmlButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { ModuleExportConfig } from '@/utils/offlineExport';

// Validated categorical palette (dataviz skill, dark-surface steps) - chosen for
// max adjacent contrast so stacked-bar categories stay distinguishable, unlike
// the previous ad-hoc Tailwind picks which had several low-contrast neighbors.
const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

type ScenarioType = 'current' | 'expedite' | 'delay';

const SCENARIOS = [
  {
    id: 'current' as ScenarioType,
    title: 'Jalur 1: Evaluasi Aktual PR & Status Compile',
    desc: 'Pemantauan posisi terkini dari dokumen Purchase Requisition, PO Vendor, dan status bongkar muat secara live.',
    color: 'from-purple-600 to-indigo-500',
    icon: FileBarChart,
    multiplier: 1.0,
    statusModifier: 'normal'
  },
  {
    id: 'expedite' as ScenarioType,
    title: 'Jalur 2: Simulasi Percepatan Lead Time (-7 Hari)',
    desc: 'Estimasi percepatan kedatangan kapal (Vessel) dan konversi status dari Hold menjadi Ready untuk amankan stok.',
    color: 'from-emerald-600 to-teal-500',
    icon: TrendingUp,
    multiplier: 1.1,
    statusModifier: 'expedite'
  },
  {
    id: 'delay' as ScenarioType,
    title: 'Jalur 3: Simulasi Delay Port / Hold Vendor (+15 Hari)',
    desc: 'Uji ketahanan gudang terhadap risiko kemacetan pelabuhan atau penahanan pengiriman dari pihak pabrik/vendor.',
    color: 'from-rose-600 to-orange-500',
    icon: AlertTriangle,
    multiplier: 0.85,
    statusModifier: 'delay'
  }
];

function parseEtaRank(etaStr: string): number {
  if (!etaStr || etaStr.toLowerCase().includes('unscheduled') || etaStr.toLowerCase().includes('tanpa')) return -1;
  const lower = etaStr.toLowerCase();
  const months: Record<string, number> = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'mei': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'agu': 8, 'sep': 9, 'oct': 10, 'okt': 10, 'nov': 11, 'dec': 12, 'des': 12
  };
  let monthVal = 0;
  for (const [key, val] of Object.entries(months)) {
    if (lower.includes(key)) {
      monthVal = val;
      break;
    }
  }
  let weekVal = 0;
  const matchW = lower.match(/w(eek)?\s*(\d+)/i) || lower.match(/minggu\s*(\d+)/i) || lower.match(/ke\s*(\d+)/i);
  if (matchW && matchW[2]) {
    weekVal = parseInt(matchW[2], 10);
  }
  if (monthVal > 0) {
    return monthVal * 100 + weekVal;
  }
  return 9999 + weekVal;
}

const CustomStackedTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const validItems = payload.filter((item: any) => Number(item.value || 0) > 0);
    const totalQty = validItems.reduce((sum: number, item: any) => sum + Number(item.value || 0), 0);

    return (
      <div className="bg-popover text-popover-foreground p-3.5 rounded-xl border border-border shadow-xl z-[999999] opacity-100 max-h-[300px] overflow-y-auto max-w-[340px] pointer-events-auto">
        <div className="border-b border-border pb-2 mb-2 sticky -top-3.5 bg-popover pt-1 z-10 flex items-center justify-between gap-3">
          <span className="text-primary font-extrabold text-sm tracking-wide">{label}</span>
          <span className="text-xs px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-md font-bold text-primary shadow-sm">
            Total: {totalQty.toLocaleString('id-ID')} Qty
          </span>
        </div>
        {validItems.length === 0 ? (
          <div className="text-xs text-muted-foreground font-medium py-2">Tidak ada data kuantitas (0 Qty)</div>
        ) : (
          <div className="space-y-1.5 text-xs">
            {validItems.map((entry: any, index: number) => (
              <div key={index} className="flex items-start justify-between gap-3 py-1 border-b border-border/60 last:border-0 font-medium">
                <span className="flex items-center gap-2 text-foreground flex-1 min-w-0">
                  <span className="w-3 h-3 rounded-full inline-block shrink-0 border border-border shadow-sm mt-0.5" style={{ backgroundColor: entry.color }}></span>
                  <span className="whitespace-normal leading-tight font-semibold text-foreground" title={entry.name}>{entry.name}</span>
                </span>
                <span className="font-extrabold text-foreground shrink-0 bg-muted px-2 py-0.5 rounded border border-border">
                  {Number(entry.value).toLocaleString('id-ID')} Qty
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
};

const CustomContainerTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const poList: string[] = data.poList || [];
    const statusBreakdown: { status: string; count: number }[] = data.statusBreakdown || [];
    return (
      <div className="bg-popover text-popover-foreground p-4 rounded-xl border border-border shadow-xl z-[999999] max-h-[380px] overflow-y-auto max-w-[340px] pointer-events-auto">
        <div className="border-b border-border pb-2 mb-2 sticky -top-4 bg-popover pt-1 flex items-center justify-between gap-3">
          <span className="text-cyan-600 font-extrabold text-sm tracking-wide">🏢 {label}</span>
          <span className="text-xs px-2 py-0.5 bg-cyan-50 border border-cyan-200 rounded-md font-bold text-cyan-700 shadow-sm">
            {data["Jumlah Container"]} Dokumen
          </span>
        </div>
        <div className="text-xs text-muted-foreground font-medium space-y-2">
          <div className="flex items-center justify-between bg-muted px-3 py-2 rounded-lg border border-border">
            <span className="text-foreground font-semibold">Total Dokumen (Distinct):</span>
            <span className="font-extrabold text-cyan-700 text-sm bg-cyan-50 px-2.5 py-0.5 rounded border border-cyan-200">
              {data["Jumlah Container"]} Unit
            </span>
          </div>
          {statusBreakdown.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-muted-foreground mb-1">Rincian per Status Compile:</div>
              <div className="space-y-1">
                {statusBreakdown.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 bg-muted/60 px-2 py-1 rounded border border-border">
                    <span className="truncate font-semibold text-foreground" title={s.status}>{s.status}</span>
                    <span className="font-mono font-bold text-emerald-600 shrink-0">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {poList.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-muted-foreground mb-1">Daftar No. Dokumen di Cabang Ini:</div>
              <div className="max-h-[140px] overflow-y-auto bg-muted/60 p-2 rounded-lg border border-border space-y-1 font-mono text-[11px] text-amber-700">
                {poList.slice(0, 10).map((po, i) => (
                  <div key={i} className="truncate">• {po}</div>
                ))}
                {poList.length > 10 && (
                  <div className="text-muted-foreground font-sans italic text-[10px]">...+ {poList.length - 10} dokumen lainnya</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Recharts' built-in <Legend> lays out inside the ResponsiveContainer's fixed
// height - once category count grows past a couple of rows, entries get
// squeezed/cut off instead of scrolling, no matter what wrapperStyle overflow
// is set to. Rendering the legend ourselves, in normal document flow below the
// chart with a real overflow-y-auto div, makes it reliably scrollable.
const ScrollableLegend = ({ payload }: any) => {
  if (!payload || payload.length === 0) return null;
  return (
    <div className="mt-3 max-h-32 overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-muted/40 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1.5">
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="truncate max-w-[180px]" title={entry.value}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

const INDONESIAN_MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7,
  agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8,
  sep: 9, okt: 10, nov: 11, des: 12,
};

function parseDateVal(val: any): Date | null {
  if (val === undefined || val === null || val === '' || val === '-') return null;
  const str = String(val).trim();
  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
    const parts = str.split('T')[0].split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setHours(0, 0, 0, 0);
    return !isNaN(d.getTime()) ? d : null;
  }
  // DD/MM/YYYY, and DD/MM/YY (2-digit year) - a Tanggal ETA exported as
  // "18/08/26" previously fell all the way through to the native Date
  // fallback below, which reads it as US MM/DD/YY, gets an invalid month
  // (18), and returns null - silently dropping that row from every insight
  // downstream (this is the same 2-digit-year gap already fixed for the
  // backend forecast module's date parser; see utils/imputation.py).
  const matchIndo = str.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})$/);
  if (matchIndo) {
    let year = Number(matchIndo[3]);
    if (year < 100) year += year <= 68 ? 2000 : 1900;
    const d = new Date(year, Number(matchIndo[2]) - 1, Number(matchIndo[1]));
    d.setHours(0, 0, 0, 0);
    return !isNaN(d.getTime()) ? d : null;
  }
  // "18 Agustus 2026" / "18-Agu-2026" - native Date.parse doesn't understand
  // Indonesian month names at all, so this always returned null before.
  const lower = str.toLowerCase();
  const monthMatch = Object.keys(INDONESIAN_MONTHS).find(m => new RegExp(`\\b${m}\\b`).test(lower));
  if (monthMatch) {
    const dayYear = lower.match(/(\d{1,2}).*?(\d{2,4})/);
    if (dayYear) {
      let year = Number(dayYear[2]);
      if (year < 100) year += year <= 68 ? 2000 : 1900;
      const d = new Date(year, INDONESIAN_MONTHS[monthMatch] - 1, Number(dayYear[1]));
      d.setHours(0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const dFallback = new Date(str);
  if (!isNaN(dFallback.getTime())) {
    dFallback.setHours(0, 0, 0, 0);
    return dFallback;
  }
  return null;
}

function getDirectTrackingUrl(containerNo?: string, carrierName?: string): { url: string; carrier: string } {
  const no = (containerNo || "").trim().toUpperCase();
  let carrier = (carrierName || "").toLowerCase().trim();

  if (!no || no === '-' || no === '0' || no === '#N/A' || no === 'N/A' || no === 'NULL') {
    return { url: "", carrier: "-" };
  }

  // Auto-detect carrier by container prefix if carrier not explicit or generic
  if (!carrier || carrier === '-' || carrier.includes('agregator') || carrier.includes('custom') || carrier === 'all') {
    if (no.startsWith('MRTU') || no.startsWith('MTRU')) carrier = 'meratus';
    else if (no.startsWith('TEMU') || no.startsWith('TMSU')) carrier = 'temas';
    else if (no.startsWith('SPIL') || no.startsWith('SPU') || no.startsWith('SUL')) carrier = 'spil';
    else if (no.startsWith('MAEU') || no.startsWith('MSKU') || no.startsWith('MRKU')) carrier = 'maersk';
    else if (no.startsWith('MSCU') || no.startsWith('MEDU')) carrier = 'msc';
    else if (no.startsWith('CMAU') || no.startsWith('CGMU') || no.startsWith('APZU')) carrier = 'cma cgm';
    else if (no.startsWith('ONEU') || no.startsWith('ONEY')) carrier = 'one';
    else if (no.startsWith('EGLV') || no.startsWith('EVER') || no.startsWith('EMCU')) carrier = 'evergreen';
    else if (no.startsWith('HLCU') || no.startsWith('HPGU')) carrier = 'hapag-lloyd';
    else if (no.startsWith('COSU') || no.startsWith('CCLU') || no.startsWith('OOCL')) carrier = 'cosco';
    else if (no.startsWith('ZIMU')) carrier = 'zim';
  }

  // 1. Shipping Line Aktif (Pelacakan Langsung)
  if (carrier.includes("anl")) return { url: "https://www.anl.com.au/tracking/", carrier: "ANL" };
  if (carrier.includes("apl")) return { url: "https://www.apl.com/tracking/", carrier: "APL" };
  if (carrier.includes("cma") || carrier.includes("cgm")) return { url: "https://www.cma-cgm.com/ebusiness/tracking", carrier: "CMA CGM" };
  if (carrier.includes("cosco") || carrier.includes("china shipping") || carrier.includes("cscl")) return { url: "https://lines.coscoshipping.com/home/Services/tracking", carrier: carrier.includes("china") ? "China Shipping (COSCO)" : "COSCO" };
  if (carrier.includes("evergreen")) return { url: "https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do", carrier: "EVERGREEN" };
  if (carrier.includes("hapag") || carrier.includes("lloyd") || carrier.includes("llyod") || carrier.includes("uasc")) return { url: "https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html", carrier: carrier.includes("uasc") ? "UASC (Hapag-Lloyd)" : "HAPAG-LLOYD" };
  if (carrier.includes("hmm") || carrier.includes("hyundai")) return { url: "https://www.hmm21.com/", carrier: "HMM (Track & Trace)" };
  if (carrier.includes("interasia") || carrier.includes("ial")) return { url: "https://www.interasia.cc/", carrier: "Interasia" };
  if (carrier.includes("kmtc")) return { url: "http://www.ekmtc.com/", carrier: "KMTC" };
  if (carrier.includes("maersk")) return { url: "https://www.maersk.com/tracking/", carrier: "MAERSK" };
  if (carrier.includes("meratus")) return { url: "https://www.meratusline.com/", carrier: "Meratus Line" };
  if (carrier.includes("msc")) return { url: "https://www.msc.com/en/track-a-shipment", carrier: "MSC" };
  if (carrier.includes("one") || carrier.includes("ocean network") || carrier.includes("k-line") || carrier.includes("k line") || carrier.includes("kline") || carrier.includes("mol") || carrier.includes("nyk")) {
    let label = "ONE (Ocean Network Express)";
    if (carrier.includes("k-line") || carrier.includes("k line") || carrier.includes("kline")) label = "K-LINE (ONE)";
    else if (carrier.includes("mol")) label = "MOL (ONE)";
    return { url: "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking", carrier: label };
  }
  if (carrier.includes("oocl")) return { url: "https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx", carrier: "OOCL" };
  if (carrier.includes("pil") || carrier.includes("pacific int") || carrier.includes("pilship")) return { url: "https://www.pilship.com/en-our-track-and-trace/120.html", carrier: "PilShip (Pacific Int'l Lines)" };
  if (carrier.includes("sinokor")) return { url: "http://www.sinokor.co.kr/", carrier: "SINOKOR" };
  if (carrier.includes("wan hai") || carrier.includes("wanhai")) return { url: "https://www.wanhai.com/", carrier: "Wan Hai (Cargo Tracking)" };
  if (carrier.includes("yang ming") || carrier.includes("yangming")) return { url: "https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx", carrier: "YANG MING" };

  // Domestic & Other Shipping Lines
  if (carrier.includes("temas") || carrier.includes("kliktemas")) return { url: "https://apps.kliktemas.com/", carrier: "Temas Line (KlikTemas)" };
  if (carrier.includes("spil") || carrier.includes("salam pacific") || carrier.includes("myspil")) return { url: "https://www.myspil.com/", carrier: "SPIL (mySPIL)" };
  if (carrier.includes("samudera")) return { url: "https://samuderaconnect.com/", carrier: "Samudera Indonesia" };
  if (carrier.includes("tanto")) return { url: "https://www.tantonet.com/", carrier: "Tanto Intim Line" };
  if (carrier.includes("zim")) return { url: `https://www.zim.com/tools/track-a-shipment?consignmentNumber=${no}`, carrier: "ZIM" };

  // 3. Container Leasing Companies (Perusahaan Penyewaan - Direct Official Website)
  if (carrier.includes("seaco") || carrier.includes("seacube")) return { url: "https://www.seacoglobal.com/equipment/unit-enquiry/", carrier: "Seaco (Unit Enquiry)" };
  if (carrier.includes("triton")) return { url: "https://www.tritoncontainer.com/unit-inquiry", carrier: "TRITON" };
  if (carrier.includes("cai")) return { url: "https://www.caiintl.com/", carrier: "CAI International" };
  if (carrier.includes("beacon")) return { url: "https://www.beaconintermodal.com/", carrier: "Beacon Intermodal" };
  if (carrier.includes("florens")) return { url: "http://www.florens.com/", carrier: "Florens" };
  if (carrier.includes("textainer")) return { url: "https://www.textainer.com/equipment/unit-inquiry", carrier: "Textainer" };
  if (carrier.includes("ues")) return { url: "https://www.ues-int.com/", carrier: "UES International" };
  if (carrier.includes("leasing")) return { url: `https://www.searates.com/container/tracking/?number=${no}`, carrier: carrierName || "Container Leasing" };

  // Default Universal Container Tracking
  return { url: `https://www.searates.com/container/tracking/?number=${no}`, carrier: carrierName && carrierName !== '-' ? carrierName : "Container Tracking" };
}

const syncToTrackingContainer = async (parsed: ParsedData) => {
  const colCont = findColumn(parsed.headers, ['no container', 'nocontainer', 'no. container', 'no_kontainer', 'no kontainer', 'container', 'nomor container']);
  const colBranch = findColumn(parsed.headers, ['branch name', 'branch_name', 'branchname', 'branch', 'cabang', 'cab', 'regional', 'region']);
  const colStatus = findColumn(parsed.headers, ['status compile', 'status', 'state']);
  const colEta = findColumn(parsed.headers, ['tanggal eta', 'week eta', 'eta']);
  const colDesc = findColumn(parsed.headers, ['description', 'deskripsi', 'grup', 'nama barang']);
  const colPo = findColumn(parsed.headers, ['po', 'po no', 'no po', 'nomor po']);
  const colPr = findColumn(parsed.headers, ['nopr', 'no pr', 'pr no', 'pr', 'nomor pr']);
  const colBl = findColumn(parsed.headers, ['bill of lading', 'no bl', 'no. bl', 'no_bl', 'nomor bl', 'b/l', 'no b/l', 'bl no', 'bl_no', 'no booking', 'booking', 'nomor booking', 'bl']);
  const colCarrier = findColumn(parsed.headers, ['shipping line', 'shipping_line', 'shippingline', 'pelayaran', 'carrier', 'maskapai', 'shipping', 'line']);

  if (!colCont) return;
  
  const containers = parsed.data
    .filter(row => row[colCont] && String(row[colCont]).trim() !== '' && String(row[colCont]).trim() !== '-' && String(row[colCont]).trim() !== '0' && String(row[colCont]).toUpperCase() !== 'N/A')
    .map((row, index) => {
      const no = String(row[colCont]).trim().toUpperCase();
      const carrierRaw = colCarrier ? String(row[colCarrier] || '') : '';
      // isEmptyDocVal (defined in the main component below) also treats the
      // literal "(blank)" placeholder text as empty -- this standalone sync
      // helper duplicates just that one check so it doesn't leak "(blank)"
      // as a literal BL value into the tracking container list.
      const blRaw = colBl ? String(row[colBl] || '').trim() : '';
      const blVal = /^\(?\s*blank\s*\)?$/i.test(blRaw) ? '' : blRaw;
      const info = getDirectTrackingUrl(no, carrierRaw);
      return {
        id: 'sync-' + Date.now() + '-' + index,
        no: no,
        bl: blVal,
        carrier: info.carrier,
        cabang: colBranch ? String(row[colBranch] || 'Unknown') : 'Unknown',
        status: colStatus ? String(row[colStatus] || 'Sedang Berlayar') : 'Sedang Berlayar',
        pol: '',
        pod: colBranch ? `Gudang ${String(row[colBranch])}` : '',
        etd: '',
        eta: colEta ? String(row[colEta] || '') : '',
        notes: `Sinkronisasi PR Update: PO ${colPo ? row[colPo] : '-'} | PR ${colPr ? row[colPr] : '-'} | ${colDesc ? row[colDesc] : ''}`,
        lastChecked: new Date().toISOString().slice(0, 10)
      };
    });

  if (containers.length > 0) {
    const payload = {
      processed_at: new Date().toISOString(),
      containers
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_tracking_containers', JSON.stringify(payload));
    }
    try {
      await set('last_tracking_containers_v3', payload);
    } catch (e) {
      console.warn("Failed syncing to tracking containers IndexDB", e);
    }
  }
};

function generateDemoPRUpdate(): ParsedData {
  const cabangs = ['Surabaya', 'Jakarta', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar'];
  const grups = ['Minyak Goreng Premium', 'Beras Setra Ramos', 'Gula Pasir Kristal', 'Tepung Terigu Serbaguna', 'Kopi Bubuk Murni', 'Susu Kental Manis'];
  const categories = ['Food Basic', 'Beverages & Dairy', 'Baking Ingredients', 'Groceries Premium'];
  // Ditambahkan status SPJM, PO ON PROCESS & PR BELUM RELEASE sesuai permintaan
  // pengguna - dua status terakhir belum punya No. PO sama sekali, untuk
  // mensimulasikan celah "PR Belum Ada PO" yang harus tetap terhitung sebagai
  // dokumen (lihat getDocKey/PR Belum Ada PO fix).
  const statuses = ['ON VESSEL', 'HOLD DELIVERY', 'SPJM', 'READY', 'PLAN LOADING', 'IN PROCESS', 'PO ON PROCESS', 'PR BELUM RELEASE'];
  const etas = ['Week 1 Agu', 'Week 2 Agu', 'Week 3 Agu', 'Week 4 Agu'];
  const containers = ['MRTU1234567', 'TEMU7654321', 'SPIL8899001', 'MAEU9988776', 'MSCU4455667', 'CMAU1122334', 'ONEY7788990', 'EGLV3344556'];
  const carriers = ['Meratus Line', 'Temas Line', 'SPIL (mySPIL)', 'Maersk', 'MSC', 'CMA CGM', 'ONE', 'Evergreen Line'];
  const bls = ['BL-MRT-9988', 'BL-TMS-7766', 'BL-SPL-5544', 'BL-MAE-3322', 'BL-MSC-1100', 'BL-CMA-8899', 'BL-ONE-6677', 'BL-EVG-4455'];
  const pis = ['PI-2026-9001', 'PI-2026-9002', 'PI-2026-9003', 'PI-2026-9004', 'PI-2026-9005', 'PI-2026-9006', 'PI-2026-9007', 'PI-2026-9008'];
  
  const data: any[] = [];
  let poCounter = 1001;

  cabangs.forEach((cab, cIdx) => {
    grups.forEach((grp, idx) => {
      const stat = statuses[(idx + cIdx) % statuses.length];
      const eta = etas[(idx + Math.floor(cIdx / 2)) % etas.length];
      const qty = Math.round(500 + Math.random() * 3500);
      const cat = categories[idx % categories.length];
      const cont = (stat === 'ON VESSEL' || stat === 'READY' || stat === 'SPJM') ? containers[(idx + cIdx) % containers.length] : '-';
      const bl = (stat === 'ON VESSEL' || stat === 'READY' || stat === 'SPJM') ? bls[(idx + cIdx) % bls.length] : '-';
      const carrier = (stat === 'ON VESSEL' || stat === 'READY' || stat === 'SPJM') ? carriers[(idx + cIdx) % carriers.length] : '-';
      // 'PLAN LOADING', 'PO ON PROCESS' and 'PR BELUM RELEASE' simulate a PR
      // raised before a PO is cut, 'IN PROCESS' simulates a PO placed before
      // a PI is issued - so the demo data has real examples of the
      // PR-without-PO and PO-without-PI gaps to show.
      const poNum = poCounter++;
      const po = (stat === 'PLAN LOADING' || stat === 'PO ON PROCESS' || stat === 'PR BELUM RELEASE') ? '-' : `PO-2026-${poNum}`;
      const pi = (stat === 'ON VESSEL' || stat === 'READY' || stat === 'SPJM' || stat === 'HOLD DELIVERY') ? pis[(idx + cIdx) % pis.length] : '-';

      const isOverdueTarget = (stat === 'SPJM' || stat === 'HOLD DELIVERY' || stat === 'ON VESSEL') && ((idx + cIdx) % 2 === 0 || cIdx <= 2);
      const dayOffset = isOverdueTarget ? -((idx * 3 + cIdx * 2) % 25 + 3) : ((idx + 1) * 4 + (cIdx % 3));
      const tglEta = new Date(Date.now() + dayOffset * 86400000).toISOString().slice(0, 10);

      data.push({
        'PO': po,
        'NoPR': `PR-08-${poNum + 1}`,
        'Branch Name': cab,
        'GRUP': grp,
        'Category': cat,
        'Description': `${grp} - ${cat} (Kemasan Karton 24x)`,
        'STATUS Compile': stat,
        'No Container': cont,
        'PI': pi,
        'bl': bl,
        'Shipping Line': carrier,
        'Tanggal ETA': tglEta,
        'Week ETA': eta,
        'Qty': qty,
        // Dedicated "Total" column, distinct from Qty - exercises colTotal
        // detection so demo mode also demonstrates the SUM-kolom-total fix.
        'Total': qty
      });
    });
  });

  const parsedDemoHeaders = ['PO', 'NoPR', 'Branch Name', 'GRUP', 'Category', 'Description', 'STATUS Compile', 'No Container', 'PI', 'bl', 'Shipping Line', 'Tanggal ETA', 'Week ETA', 'Qty', 'Total'];
  const parsedDemo: ParsedData = {
    headers: parsedDemoHeaders,
    targetColumns: [
      { index: 13, name: 'Qty' },
      { index: 14, name: 'Total' }
    ],
    data,
    processed_at: new Date().toISOString(),
    sheetNames: ['PR Update', 'Lead Time'],
    sheets: {
      'PR Update': {
        headers: parsedDemoHeaders,
        targetColumns: [{ index: 13, name: 'Qty' }, { index: 14, name: 'Total' }],
        data: data
      },
      'Lead Time': {
        headers: ['YEAR ETA', 'MONTH ETA', 'REGION RCPT', 'BRANCH RCPT BRANCH', 'CONTAINER', 'TGL SPPB', 'TGL ETA BY PIB', 'TOR DATE', 'DAYS SPPB - ETA', 'DAYS BONGKAR - SPPB - 1', 'TOTAL DAYS'],
        targetColumns: [],
        data: [
          { 'YEAR ETA': 2026, 'MONTH ETA': '08. Aug', 'REGION RCPT': 'REG-1', 'BRANCH RCPT BRANCH': 'Surabaya', 'CONTAINER': 'MRTU1234567', 'TGL SPPB': '2026-08-01', 'TGL ETA BY PIB': '2026-07-25', 'TOR DATE': '2026-08-05', 'DAYS SPPB - ETA': 7, 'DAYS BONGKAR - SPPB - 1': 3, 'TOTAL DAYS': 10 },
          { 'YEAR ETA': 2026, 'MONTH ETA': '08. Aug', 'REGION RCPT': 'REG-2', 'BRANCH RCPT BRANCH': 'Jakarta', 'CONTAINER': 'TEMU7654321', 'TGL SPPB': '2026-08-02', 'TGL ETA BY PIB': '2026-07-28', 'TOR DATE': '2026-08-06', 'DAYS SPPB - ETA': 5, 'DAYS BONGKAR - SPPB - 1': 3, 'TOTAL DAYS': 8 },
          { 'YEAR ETA': 2026, 'MONTH ETA': '08. Aug', 'REGION RCPT': 'REG-3', 'BRANCH RCPT BRANCH': 'Bandung', 'CONTAINER': 'SPIL8899001', 'TGL SPPB': '2026-08-03', 'TGL ETA BY PIB': '2026-07-20', 'TOR DATE': '2026-08-10', 'DAYS SPPB - ETA': 14, 'DAYS BONGKAR - SPPB - 1': 6, 'TOTAL DAYS': 20 },
        ]
      }
    }
  };

  syncToTrackingContainer(parsedDemo);
  return parsedDemo;
}

type ColFilterRule = { search: string; selected: string[] };
type ColFilters = Record<string, ColFilterRule>;

function applyColumnFilters<T>(rows: T[], filters: ColFilters, getVal: (row: T, col: string) => any): T[] {
  const activeRules = Object.entries(filters).filter(([, rule]) => rule && (rule.search.trim() !== '' || (rule.selected && rule.selected.length > 0)));
  if (activeRules.length === 0) return rows;
  return rows.filter(row => {
    for (const [col, rule] of activeRules) {
      let val = getVal(row, col);
      if (val === undefined || val === null) val = '-';
      const strVal = String(val).trim();
      if (rule.search && rule.search.trim() !== '' && !strVal.toLowerCase().includes(rule.search.toLowerCase().trim())) return false;
      if (rule.selected && rule.selected.length > 0 && !rule.selected.includes(strVal)) return false;
    }
    return true;
  });
}

function getUniqueColumnValues<T>(rows: T[], col: string, getVal: (row: T, col: string) => any): string[] {
  const set = new Set<string>();
  rows.forEach(row => {
    let val = getVal(row, col);
    if (val === undefined || val === null || val === '') val = '-';
    set.add(String(val).trim());
  });
  return Array.from(set).sort();
}

function ExcelFilterModal({
  columnLabel,
  uniqueValues,
  searchInput,
  onSearchInputChange,
  isChecked,
  onToggleValue,
  onReset,
  onApply,
  onClose,
}: {
  columnLabel: string;
  uniqueValues: string[];
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  isChecked: (val: string) => boolean;
  onToggleValue: (val: string) => void;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" /> Filter Kolom: <span className="text-emerald-700">{columnLabel}</span>
          </h4>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-600" />
            <input
              type="text"
              value={searchInput}
              onChange={e => onSearchInputChange(e.target.value)}
              placeholder={`Cari teks dalam ${columnLabel}...`}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {searchInput && (
              <button onClick={() => onSearchInputChange('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-900 text-xs">
                Hapus
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-2 space-y-1 text-xs">
            <div className="text-[11px] font-semibold text-slate-600 mb-1 px-1 flex justify-between">
              <span>Daftar Nilai Unik ({uniqueValues.length}):</span>
            </div>
            {uniqueValues.filter(val => !searchInput || val.toLowerCase().includes(searchInput.toLowerCase())).slice(0, 50).map((val, idx) => (
              <label
                key={idx}
                className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer text-slate-700 truncate"
                onClick={(e) => { e.preventDefault(); onToggleValue(val); }}
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${isChecked(val) ? 'bg-emerald-500 border-emerald-500 text-slate-900' : 'border-slate-600 bg-white'}`}>
                  {isChecked(val) && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </div>
                <span className="truncate">{val}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={onReset}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-700 text-slate-700 hover:text-white text-xs font-semibold transition"
            >
              Reset Kolom Ini
            </button>
            <button
              onClick={onApply}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20"
            >
              Terapkan Filter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PRUpdatePage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'pr_update' | 'lead_time'>('pr_update');
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('current');
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedEta, setSelectedEta] = useState<string[]>(['All']);
  const [selectedStatusCompile, setSelectedStatusCompile] = useState<string[]>(['All']);
  const [chartViewMode, setChartViewMode] = useState<'eta' | 'cabang' | 'container'>('eta');

  // Filter states for the Analisa Lead Time tab
  const [selectedLtRegion, setSelectedLtRegion] = useState<string[]>(['All']);
  const [selectedLtCabang, setSelectedLtCabang] = useState<string[]>(['All']);
  const [selectedLtMonth, setSelectedLtMonth] = useState<string[]>(['All']);

  
  // Raw, unfiltered Lead Time sheet rows - kept separate from leadTimeData so
  // the Region/Cabang/Month ETA filter dropdown options always list every
  // value in the sheet, regardless of what's currently selected.
  const leadTimeRawAll = useMemo(() => {
    if (!parsed || !parsed.sheets) return null;
    const ltKey = Object.keys(parsed.sheets).find(k => k.toLowerCase().includes('lead time'));
    if (!ltKey) return null;
    const data = parsed.sheets[ltKey].data || [];
    return data.length > 0 ? data : null;
  }, [parsed]);

  const ltRegions = useMemo(() => {
    if (!leadTimeRawAll) return ['All'];
    return ['All', ...Array.from(new Set(leadTimeRawAll.map((r: any) => String(r['REGION RCPT'] || '').trim()).filter(v => v && v !== '-'))).sort()];
  }, [leadTimeRawAll]);

  const ltCabangs = useMemo(() => {
    if (!leadTimeRawAll) return ['All'];
    return ['All', ...Array.from(new Set(leadTimeRawAll.map((r: any) => String(r['BRANCH RCPT BRANCH'] || '').trim()).filter(v => v && v !== '-'))).sort()];
  }, [leadTimeRawAll]);

  const ltMonths = useMemo(() => {
    if (!leadTimeRawAll) return ['All'];
    return ['All', ...Array.from(new Set(leadTimeRawAll.map((r: any) => String(r['MONTH ETA'] || '').trim()).filter(v => v && v !== '-'))).sort()];
  }, [leadTimeRawAll]);

  const leadTimeData = useMemo(() => {
    if (!leadTimeRawAll) return null;

    const data = leadTimeRawAll.filter((r: any) =>
      (selectedLtRegion.includes('All') || selectedLtRegion.includes(String(r['REGION RCPT'] || '').trim())) &&
      (selectedLtCabang.includes('All') || selectedLtCabang.includes(String(r['BRANCH RCPT BRANCH'] || '').trim())) &&
      (selectedLtMonth.includes('All') || selectedLtMonth.includes(String(r['MONTH ETA'] || '').trim()))
    );

    let totalDaysSum = 0;
    let bongkarDaysSum = 0;
    let sppbEtaDaysSum = 0;
    let countTotal = 0;
    let countBongkar = 0;
    let countSppbEta = 0;

    const trendByMonth: Record<string, { totalDays: number, sppbEta: number, bongkar: number, countTotal: number, countSppbEta: number, countBongkar: number }> = {};
    const branchComparison: Record<string, { totalDays: number, count: number }> = {};

    data.forEach(r => {
      const td = Number(r['TOTAL DAYS']);
      if (!isNaN(td)) {
        totalDaysSum += td;
        countTotal++;
      }
      
      const bongkar = Number(r['DAYS BONGKAR - SPPB - 1']);
      if (!isNaN(bongkar)) {
        bongkarDaysSum += bongkar;
        countBongkar++;
      }
      
      const sppbEta = Number(r['DAYS SPPB - ETA']);
      if (!isNaN(sppbEta)) {
        sppbEtaDaysSum += sppbEta;
        countSppbEta++;
      }

      const month = String(r['YEAR ETA/MONTH ETA'] || r['MONTH ETA'] || 'Unknown');
      if (!trendByMonth[month]) trendByMonth[month] = { totalDays: 0, sppbEta: 0, bongkar: 0, countTotal: 0, countSppbEta: 0, countBongkar: 0 };
      if (!isNaN(td)) {
        trendByMonth[month].totalDays += td;
        trendByMonth[month].countTotal++;
      }
      if (!isNaN(sppbEta)) {
        trendByMonth[month].sppbEta += sppbEta;
        trendByMonth[month].countSppbEta++;
      }
      if (!isNaN(bongkar)) {
        trendByMonth[month].bongkar += bongkar;
        trendByMonth[month].countBongkar++;
      }

      const branch = String(r['BRANCH RCPT BRANCH'] || 'Unknown');
      if (!branchComparison[branch]) branchComparison[branch] = { totalDays: 0, count: 0 };
      if (!isNaN(td)) {
        branchComparison[branch].totalDays += td;
        branchComparison[branch].count++;
      }
    });

    // Per-branch average Total Days (Tunggu), excluding branches with no
    // valid TOTAL DAYS rows at all (they'd otherwise show a misleading 0).
    const branchEntries = Object.entries(branchComparison)
      .filter(([, v]) => v.count > 0)
      .map(([k, v]) => ({ branch: k, avgDays: Math.round((v.totalDays / v.count) * 10) / 10 }));

    return {
      avgTotalDays: countTotal ? (totalDaysSum / countTotal).toFixed(1) : '0',
      avgBongkarDays: countBongkar ? (bongkarDaysSum / countBongkar).toFixed(1) : '0',
      avgSppbEtaDays: countSppbEta ? (sppbEtaDaysSum / countSppbEta).toFixed(1) : '0',
      trendData: Object.entries(trendByMonth).map(([k, v]) => ({
        month: k,
        avgDays: v.countTotal ? Math.round((v.totalDays / v.countTotal) * 10) / 10 : 0,
        avgSppbEta: v.countSppbEta ? Math.round((v.sppbEta / v.countSppbEta) * 10) / 10 : 0,
        avgBongkar: v.countBongkar ? Math.round((v.bongkar / v.countBongkar) * 10) / 10 : 0
      })).sort((a, b) => a.month.localeCompare(b.month)),
      branchData: [...branchEntries].sort((a, b) => b.avgDays - a.avgDays),
      topSlowestBranches: [...branchEntries].sort((a, b) => b.avgDays - a.avgDays).slice(0, 10),
      topFastestBranches: [...branchEntries].sort((a, b) => a.avgDays - b.avgDays).slice(0, 10),
      raw: data
    };
  }, [leadTimeRawAll, selectedLtRegion, selectedLtCabang, selectedLtMonth]);


  // Excel-like column filters for Table Detail
  const [colFilters, setColFilters] = useState<Record<string, { search: string; selected: string[] }>>({});
  const [activeFilterModalCol, setActiveFilterModalCol] = useState<string | null>(null);
  const [modalSearchInput, setModalSearchInput] = useState<string>('');

  // Excel-like column filters for the Insight PO Overdue table
  const [overdueColFilters, setOverdueColFilters] = useState<ColFilters>({});
  const [activeOverdueFilterCol, setActiveOverdueFilterCol] = useState<string | null>(null);
  const [overdueModalSearchInput, setOverdueModalSearchInput] = useState<string>('');

  useEffect(() => {
    const fetchGlobalData = async () => {
      const { data, error } = await supabase
        .from('processed_results')
        .select('*')
        .eq('module', 'pr_update')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data && data.result_json) {
        let parsedData = JSON.parse(data.result_json);
        if (parsedData.compressed && parsedData.data) {
          const decompressed = LZString.decompressFromBase64(parsedData.data);
          if (decompressed) parsedData = JSON.parse(decompressed);
        }
        setParsed(parsedData);
      } else {
        get('last_pr_update').then(saved => {
          if (saved && saved.data && saved.data.length > 0) {
            setParsed(saved);
          } else {
            handleGenerateDemo();
          }
        }).catch(err => {
          console.warn('Failed to load state from IndexDB', err);
          handleGenerateDemo();
        });
      }
    };

    fetchGlobalData();

    const channel = supabase
      .channel('pr_update_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: "module=eq.pr_update" },
        (payload) => {
          const timestampStr = sessionStorage.getItem('last_processed_at_pr_update');
          if (payload.new && payload.new.result_json) {
            let parsedData = JSON.parse(payload.new.result_json);
            if (parsedData.compressed && parsedData.data) {
              const decompressed = LZString.decompressFromBase64(parsedData.data);
              if (decompressed) parsedData = JSON.parse(decompressed);
            }
            if (!timestampStr || parsedData.processed_at !== timestampStr) {
              setParsed(parsedData);
              toast.success('🔄 Pembaruan data dari pengguna lain diterima!', {
                icon: '🔄',
                style: { background: '#10B981', color: '#fff' },
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSaveToGlobal = async () => {
    if (!parsed) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }
    toast.loading('Menyimpan ke Global DB...', { id: 'save-global' });
    const timestamp = new Date().toISOString();
    const dataCopy = { ...parsed, processed_at: timestamp };
        const { error } = await supabase.from('processed_results').insert([{ module: 'pr_update', result_json: JSON.stringify({ compressed: true, data: LZString.compressToBase64(JSON.stringify(dataCopy)) }) }]);
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    const demo = generateDemoPRUpdate();
    setParsed(demo);
    setColFilters({});
    toast.success('🎉 Data Demo PR Update & Status SPJM Berhasil Dimuat!');
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Sheet 1: PR Update
    const ws1Data = [
      ['PO','NoPR','Branch Name','GRUP','Category','Description','STATUS Compile','No Container','PI','bl','Shipping Line','Tanggal ETA','Week ETA','Qty'],
      ['PO-2026-101','PR-08-01','Surabaya','Minyak Goreng Premium','Food Basic','Minyak Goreng 2L','ON VESSEL','MRTU1234567','PI-2026-9001','BL-MRT-9988','Meratus Line','2026-08-10','Week 2 Agu',2500],
      ['PO-2026-102','PR-08-02','Jakarta','Beras Setra Ramos','Groceries Premium','Beras Premium 5kg','SPJM','TEMU7654321','PI-2026-9002','BL-TMS-7766','Temas Line','2026-08-15','Week 3 Agu',1800],
      ['PO-2026-103','PR-08-03','Bandung','Gula Pasir Kristal','Baking Ingredients','Gula Kristal 1kg','HOLD DELIVERY','-','PI-2026-9003','-','-','2026-08-18','Week 3 Agu',3200]
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    XLSX.utils.book_append_sheet(wb, ws1, "PR Update");

    // Sheet 2: Lead Time
    const ws2Data = [
      ['YEAR ETA','MONTH ETA','REGION RCPT','BRANCH RCPT BRANCH','CONTAINER','TGL SPPB','TGL ETA BY PIB','TOR DATE','DAYS SPPB - ETA','DAYS BONGKAR - SPPB - 1','TOTAL DAYS'],
      [2026,'08. Aug','REG-1','Surabaya','MRTU1234567','2026-08-01','2026-07-25','2026-08-05',7,3,10],
      [2026,'08. Aug','REG-2','Jakarta','TEMU7654321','2026-08-02','2026-07-28','2026-08-06',5,3,8],
      [2026,'08. Aug','REG-3','Bandung','SPIL8899001','2026-08-03','2026-07-20','2026-08-10',14,6,20]
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb, ws2, "Lead Time");

    XLSX.writeFile(wb, "template_pr_update_leadtime.xlsx");
    toast.success('📁 Template Excel PR Update & Lead Time Berhasil Diunduh');
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca file PR Update (Excel/CSV)...', { id: 'pr' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      setColFilters({});
      try {
        await set('last_pr_update', parsedData);
        await syncToTrackingContainer(parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('✅ Data PR Update Berhasil Diproses!', { id: 'pr' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'pr' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically & distinctly
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['branch name', 'branch_name', 'branchname', 'branch', 'cabang', 'cab', 'regional', 'region']) : undefined, [parsed]);
  const colGrup = useMemo(() => parsed ? findColumn(parsed.headers, ['grup', 'group', 'divisi', 'grup barang']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['category', 'kategori', 'item category', 'kategori produk']) : undefined, [parsed]);
  const colPo = useMemo(() => parsed ? findColumn(parsed.headers, ['po', 'no po', 'nomor po', 'po no', 'no_po']) : undefined, [parsed]);
  const colPr = useMemo(() => parsed ? findColumn(parsed.headers, ['nopr', 'no pr', 'pr no', 'pr', 'nomor pr', 'no_pr']) : undefined, [parsed]);
  const colDesc = useMemo(() => parsed ? findColumn(parsed.headers, ['description', 'deskripsi', 'nama barang', 'item description', 'nama produk']) : undefined, [parsed]);
  const colEta = useMemo(() => parsed ? findColumn(parsed.headers, ['week eta', 'eta fix', 'tanggal eta', 'eta_port', 'eta']) : undefined, [parsed]);
  const colStatus = useMemo(() => parsed ? findColumn(parsed.headers, ['status compile', 'status', 'state', 'posisi']) : undefined, [parsed]);
  const colQty = useMemo(() => parsed ? findColumn(parsed.headers, ['qty', 'quantity', 'jumlah', 'qty order', 'kuantitas']) : undefined, [parsed]);
  const colContainer = useMemo(() => parsed ? findColumn(parsed.headers, ['no container', 'nocontainer', 'no. container', 'no_kontainer', 'no kontainer', 'container', 'nomor container']) : undefined, [parsed]);
  const colBl = useMemo(() => parsed ? findColumn(parsed.headers, ['bill of lading', 'no bl', 'no. bl', 'no_bl', 'nomor bl', 'b/l', 'no b/l', 'bl no', 'bl_no', 'no booking', 'booking', 'nomor booking', 'bl']) : undefined, [parsed]);
  const colPi = useMemo(() => parsed ? findColumn(parsed.headers, ['pi', 'no pi', 'no. pi', 'nomor pi', 'pi no', 'pi_no', 'proforma invoice', 'nomor proforma invoice']) : undefined, [parsed]);
  const colCarrier = useMemo(() => parsed ? findColumn(parsed.headers, ['shipping line', 'shipping_line', 'shippingline', 'pelayaran', 'carrier', 'maskapai', 'shipping', 'line']) : undefined, [parsed]);
  // Dedicated "Total" column (grand total qty/value per line) - distinct from
  // colQty. When the source file has both, every Qty-sum metric below (Total
  // Qty Pesanan PR, category breakdown, Week ETA labels) must SUM this column,
  // not colQty, per the manual-Excel reconciliation. Falls back to colQty when
  // the file has no separate Total column (e.g. the demo dataset).
  const colTotal = useMemo(() => parsed ? findColumn(parsed.headers, ['total', 'grand total', 'total qty', 'total pesanan', 'jumlah total', 'nilai total', 'total order', 'total value']) : undefined, [parsed]);

  const colTanggalEta = useMemo(() => {
    if (!parsed) return undefined;
    const explicit = findColumn(parsed.headers, ['tanggal eta', 'tgl eta', 'eta date', 'eta_date', 'tanggal_eta', 'tgl_eta', 'eta fix', 'eta_port']);
    if (explicit) return explicit;
    return parsed.headers.find(h => h.toLowerCase().includes('eta') && !h.toLowerCase().includes('week') && !h.toLowerCase().includes('minggu'));
  }, [parsed]);

  const rawDataProcessingDate = useMemo(() => {
    if (parsed?.processed_at) {
      const d = parseDateVal(parsed.processed_at);
      if (d) return d;
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, [parsed]);

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
    if (!parsed) return [];
    const colToUse = colCategory || colGrup;
    if (!colToUse) return ['All'];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colToUse]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()];
  }, [parsed, colCategory, colGrup, selectedCabang, selectedEta, colCabang, colEta]);

  const etas = useMemo(() => {
    if (!parsed || !colEta) return [];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || (colCategory && selectedCategory.includes(d[colCategory])) || (colGrup && selectedCategory.includes(d[colGrup])))
    );
    return ['All', ...Array.from(new Set(source.map(d => {
      const val = d[colEta];
      if (!val || String(val).trim() === '' || String(val) === '-') return 'Unscheduled / Tanpa ETA';
      return String(val);
    }).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua eta'))).sort()];
  }, [parsed, colEta, selectedCabang, selectedCategory, colCabang, colCategory, colGrup]);

  const statusCompiles = useMemo(() => {
    if (!parsed || !colStatus) return ['All'];
    return ['All', ...Array.from(new Set(parsed.data.map(d => String(d[colStatus] || '').trim()).filter(v => v && !v.includes('#N/A') && !v.includes('#REF!') && v !== '-'))).sort()];
  }, [parsed, colStatus]);

  // Filtered Data with Scenario adjustments
  const filtered = useMemo(() => {
    if (!parsed) return [];
    const sc = SCENARIOS.find(s => s.id === activeScenario) || SCENARIOS[0];
    const colCatUse = colCategory || colGrup;
    return parsed.data
      .filter(d => {
        const valEta = d[colEta!];
        const etaLabel = (!valEta || String(valEta).trim() === '' || String(valEta) === '-') ? 'Unscheduled / Tanpa ETA' : String(valEta);
        return (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
        (!colCatUse || selectedCategory.includes('All') || selectedCategory.includes(d[colCatUse])) &&
        (!colEta || selectedEta.includes('All') || selectedEta.includes(etaLabel)) &&
        (!colStatus || selectedStatusCompile.includes('All') || selectedStatusCompile.includes(String(d[colStatus] || '').trim()));
      })
      .map(row => {
        const copy = { ...row };
        if (colQty && copy[colQty] != null && copy[colQty] !== '') {
          // parseIndonesianNumber (not a bare regex strip) so "2.500" parses
          // as 2500, not 2.5 - a raw digit/dot/minus-only regex leaves the
          // thousands-separator dot in place and Number() then reads it as
          // a decimal point, undercounting every qty >= 1000 by ~1000x.
          copy[colQty] = Math.round(parseIndonesianNumber(copy[colQty]) * sc.multiplier);
        }
        if (colTotal && copy[colTotal] != null && copy[colTotal] !== '') {
          copy[colTotal] = Math.round(parseIndonesianNumber(copy[colTotal]) * sc.multiplier);
        }
        if (colStatus && sc.statusModifier === 'expedite' && String(copy[colStatus]).toUpperCase().includes('HOLD')) {
          copy[colStatus] = 'READY / EXPEDITED';
        }
        if (colStatus && sc.statusModifier === 'delay' && String(copy[colStatus]).toUpperCase().includes('VESSEL')) {
          copy[colStatus] = 'HOLD DELIVERY (DELAY)';
        }
        return copy;
      });
  }, [parsed, selectedCabang, selectedCategory, selectedEta, selectedStatusCompile, colCabang, colCategory, colGrup, colEta, colQty, colTotal, colStatus, activeScenario]);

  // Insight PO Overdue ETA (SPJM, Hold Delivery, On Vessel)
  const overdueInsights = useMemo(() => {
    if (!parsed || filtered.length === 0 || !colTanggalEta) return [];
    const results: any[] = [];

    for (const row of filtered) {
      const stat = colStatus ? (String(row[colStatus] || '').trim().toUpperCase()) : '';
      const isTargetStatus = stat.includes('SPJM') || stat.includes('HOLD') || stat.includes('VESSEL') || stat.includes('DELAY') || stat.includes('SHIP');
      if (!isTargetStatus) continue;

      const rawEta = row[colTanggalEta];
      const etaDate = parseDateVal(rawEta);
      if (!etaDate) continue;

      const diffMillis = rawDataProcessingDate.getTime() - etaDate.getTime();
      const diffDays = Math.floor(diffMillis / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        // row[colQty] is already a parsed number by this point (see the
        // `filtered` memo above), so this is just a null-safe coercion, not
        // a re-parse of raw text - the actual Indonesian thousand-separator
        // parsing happens once, upstream, via parseIndonesianNumber.
        const q = colQty && row[colQty] != null ? Math.round(Number(row[colQty]) || 0) : 0;
        const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'Unknown';
        const po = colPo ? (row[colPo] || '-') : '-';
        const desc = colDesc ? (row[colDesc] || '-') : '-';
        const grup = colGrup ? (row[colGrup] || '-') : '-';
        const cat = colCategory ? (row[colCategory] || '-') : '-';
        const cont = colContainer ? (row[colContainer] || '-') : '-';
        const carrier = colCarrier ? (row[colCarrier] || '-') : '-';
        
        let statusCategory = 'VESSEL';
        if (stat.includes('SPJM')) statusCategory = 'SPJM';
        else if (stat.includes('HOLD') || stat.includes('DELAY')) statusCategory = 'HOLD';
        
        results.push({
          cabang: cbg,
          po: po,
          deskripsi: desc,
          grup: grup,
          category: cat,
          status: stat,
          statusCategory,
          etaRaw: rawEta,
          etaFormatted: etaDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
          overdueDays: diffDays,
          qty: q,
          container: cont,
          carrier: carrier
        });
      }
    }
    return results.sort((a, b) => b.overdueDays - a.overdueDays);
  }, [parsed, filtered, colTanggalEta, colStatus, colQty, colCabang, colPo, colDesc, colGrup, colCategory, colContainer, colCarrier, rawDataProcessingDate]);

  // Columns exposed to the Excel-style filter on the Insight PO Overdue
  // table - keyed by the fixed field names overdueInsights rows use (not the
  // dynamic uploaded-file column names, since these are synthesized rows).
  const OVERDUE_FILTER_COLUMNS: { key: string; label: string }[] = [
    { key: 'cabang', label: 'Cabang' },
    { key: 'po', label: 'No. PO' },
    { key: 'status', label: 'Status Compile' },
    { key: 'etaFormatted', label: 'Tanggal ETA' },
    { key: 'overdueDays', label: 'Durasi Terlewat' },
    { key: 'deskripsi', label: 'Deskripsi' },
    { key: 'qty', label: 'Total Qty' },
  ];

  const displayedOverdueInsights = useMemo(
    () => applyColumnFilters(overdueInsights, overdueColFilters, (row: any, col) => row[col]),
    [overdueInsights, overdueColFilters]
  );

  const currentOverdueModalUniqueValues = useMemo(() => {
    if (!activeOverdueFilterCol) return [];
    return getUniqueColumnValues(overdueInsights, activeOverdueFilterCol, (row: any, col) => row[col]);
  }, [activeOverdueFilterCol, overdueInsights]);

  const handleApplyOverdueModalFilter = (selectedVals: string[]) => {
    if (!activeOverdueFilterCol) return;
    setOverdueColFilters(prev => ({
      ...prev,
      [activeOverdueFilterCol]: {
        search: overdueModalSearchInput,
        selected: selectedVals.length === currentOverdueModalUniqueValues.length ? [] : selectedVals,
      },
    }));
    setActiveOverdueFilterCol(null);
    setOverdueModalSearchInput('');
    toast.success(`Filter kolom ${activeOverdueFilterCol} diaplikasikan!`);
  };

  // Target-status rows (SPJM/Hold Delivery/On Vessel/Delay/Ship) that could
  // NOT be counted in overdueInsights above because their Tanggal ETA is
  // empty or in a format parseDateVal doesn't recognize. Previously these
  // rows were silently `continue`d and vanished from every count with no
  // trace, which reads as "the insight is wrong" - surfacing them here
  // instead makes clear it's a data-completeness gap, not a calculation bug.
  const overdueEtaDataIssues = useMemo(() => {
    if (!parsed || filtered.length === 0 || !colStatus) return [];
    const results: any[] = [];
    for (const row of filtered) {
      const stat = String(row[colStatus] || '').trim().toUpperCase();
      const isTargetStatus = stat.includes('SPJM') || stat.includes('HOLD') || stat.includes('VESSEL') || stat.includes('DELAY') || stat.includes('SHIP');
      if (!isTargetStatus) continue;
      const rawEta = colTanggalEta ? row[colTanggalEta] : undefined;
      if (colTanggalEta && parseDateVal(rawEta)) continue; // has a valid ETA - already counted above
      results.push({
        cabang: colCabang ? (row[colCabang] || 'Unknown') : 'Unknown',
        po: colPo ? (row[colPo] || '-') : '-',
        status: stat,
        etaRaw: rawEta === undefined || rawEta === null || rawEta === '' ? '(kosong)' : String(rawEta),
      });
    }
    return results;
  }, [parsed, filtered, colStatus, colTanggalEta, colCabang, colPo]);

  function isEmptyDocVal(v: any): boolean {
    const s = String(v ?? '').trim();
    if (!s || s === '-' || s === '0') return true;
    const su = s.toUpperCase();
    if (su === 'N/A' || su === '#N/A' || su === 'NA' || su === 'NONE' || su === 'NULL' || su === 'TBA' || su === 'TBD') return true;
    // Real uploads showed two placeholder patterns typed directly INTO a
    // document-number cell instead of leaving it blank, which silently broke
    // every PR->PO->PI->BL gap count (they all read as "document already
    // exists"): literal "(blank)" (an Excel/PivotTable export artifact, seen
    // filling 100% of the BL column) and status phrases like "PO On Process"
    // typed straight into the PO column itself (not the Status Compile column
    // -- that one just says "ON PROCESS" with no PO/PI/BL prefix, so matching
    // only there never catches this). Treat both as empty everywhere a doc
    // column is checked, for any of the four doc types (PR/PO/PI/BL).
    if (/^\(?\s*BLANK\s*\)?$/.test(su)) return true;
    if (/^(PR|PO|PI|BL)?\s*(ON\s*PROCESS|SEDANG\s*PROSES|BELUM\s*RELEASE|BELUM\s*ADA|BELUM\s*TERBIT|PENDING|PROSES)\b/.test(su)) return true;
    return false;
  }

  function countDistinctField(rows: any[], col?: string): number {
    if (!col) return rows.length;
    const set = new Set(rows.map(r => String(r[col] ?? '').trim()).filter(v => !isEmptyDocVal(v)));
    return set.size;
  }

  function countDistinctPo(rows: any[]): number {
    return countDistinctField(rows, colPo);
  }

  // Same as countDistinctField, but for rows that already carry a fixed,
  // normalized key name (e.g. overdueInsights' `po` field) rather than the
  // dynamic uploaded-file column name held in colPo/colPr/etc. Using
  // countDistinctField(rows, colPo) against those rows silently produced 0 -
  // colPo holds the raw header name (e.g. "PO"), which never matches the
  // normalized `po` key those objects actually use.
  function countDistinctByKey(rows: any[], key: string): number {
    const set = new Set(rows.map(r => String(r[key] ?? '').trim()).filter(v => !isEmptyDocVal(v)));
    return set.size;
  }

  // Canonical "one document" key for a raw row: PO number if the PO has
  // already been cut, else the PR number, else the container number, else a
  // per-row fallback. Early-lifecycle statuses ("PR belum release", "PO on
  // Process") have no PO yet - keying distinct-count purely on colPo (as the
  // old logic did everywhere) silently drops every one of those rows from
  // every "Total Dokumen" / "Jumlah Container" metric, which is why a raw
  // file of 129 rows previously surfaced as only ~5 documents.
  function getDocKey(row: any, idx: number): string {
    if (colPo) { const v = String(row[colPo] ?? '').trim(); if (!isEmptyDocVal(v)) return `PO:${v}`; }
    if (colPr) { const v = String(row[colPr] ?? '').trim(); if (!isEmptyDocVal(v)) return `PR:${v}`; }
    if (colContainer) { const v = String(row[colContainer] ?? '').trim(); if (!isEmptyDocVal(v)) return `CT:${v}`; }
    return `ROW:${idx}`;
  }

  // Human-readable counterpart of getDocKey, for display lists (no type prefix).
  function getDocLabel(row: any): string {
    if (colPo) { const v = String(row[colPo] ?? '').trim(); if (!isEmptyDocVal(v)) return v; }
    if (colPr) { const v = String(row[colPr] ?? '').trim(); if (!isEmptyDocVal(v)) return v; }
    if (colContainer) { const v = String(row[colContainer] ?? '').trim(); if (!isEmptyDocVal(v)) return v; }
    return '(Belum Ada No. Dokumen)';
  }

  function countDistinctDocs(rows: any[]): number {
    return new Set(rows.map((r, i) => getDocKey(r, i))).size;
  }

  // "Jumlah dokumen" must count distinct documents (PO -> PR -> Container
  // fallback, see getDocKey), not raw rows and not distinct-PO-only - one
  // document commonly spans several rows here (one per container/shipment),
  // and rows still awaiting a PO number (PR belum release / PO on Process)
  // must still count as one document each instead of being dropped.
  const distinctPoCountFiltered = useMemo(() => countDistinctDocs(filtered), [filtered, colPo, colPr, colContainer]);

  // Distinct document count broken down by Status Compile - answers "how many
  // documents are in each stage" (point 2's requested detail).
  const docCountByStatus = useMemo(() => {
    if (!colStatus || filtered.length === 0) return [];
    const map: Record<string, Set<string>> = {};
    filtered.forEach((row, i) => {
      const stat = String(row[colStatus] || '').trim() || 'Tanpa Status';
      if (!map[stat]) map[stat] = new Set();
      map[stat].add(getDocKey(row, i));
    });
    return Object.entries(map)
      .map(([status, set]) => ({ status, count: set.size }))
      .sort((a, b) => b.count - a.count);
  }, [filtered, colStatus, colPo, colPr, colContainer]);

  // Distinct document count broken down by Week ETA - "Sebaran ETA" (point 3).
  const docCountByEta = useMemo(() => {
    if (!colEta || filtered.length === 0) return [];
    const map: Record<string, Set<string>> = {};
    filtered.forEach((row, i) => {
      const eta = String(row[colEta] || '').trim() || 'Unscheduled / Tanpa ETA';
      if (!map[eta]) map[eta] = new Set();
      map[eta].add(getDocKey(row, i));
    });
    return Object.entries(map)
      .map(([eta, set]) => ({ eta, count: set.size }))
      .sort((a, b) => parseEtaRank(a.eta) - parseEtaRank(b.eta));
  }, [filtered, colEta, colPo, colPr, colContainer]);

  // Top 5 Item Category by summed Total column value (point 1's detail).
  const top5Categories = useMemo(() => {
    const colCatUse = colCategory || colGrup;
    if (!colCatUse || filtered.length === 0) return [];
    const amountCol = colTotal || colQty;
    const map: Record<string, number> = {};
    filtered.forEach(row => {
      const cat = String(row[colCatUse] || 'Umum / No Kategori').trim() || 'Umum / No Kategori';
      const amt = amountCol && row[amountCol] != null && row[amountCol] !== '' ? Number(row[amountCol]) || 0 : 0;
      map[cat] = (map[cat] || 0) + amt;
    });
    return Object.entries(map)
      .map(([category, total]) => ({ category, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filtered, colCategory, colGrup, colTotal, colQty]);

  // Status totals across the WHOLE filtered dataset (not just the overdue
  // subset) - i.e. what you'd get filtering Status Compile = Hold Delivery
  // in the raw file and summing the Total column. The Insight section's
  // overdue table below stays scoped to rows whose ETA has actually passed;
  // these mini cards instead answer "how much Hold/SPJM/On Vessel is there in
  // total", with the overdue subset shown as a secondary figure so neither
  // number is lost.
  const statusOverview = useMemo(() => {
    const empty = { qty: 0, docs: 0 };
    if (!colStatus || filtered.length === 0) return { spjm: empty, hold: empty, vessel: empty };

    const rowsFor = (cat: 'SPJM' | 'HOLD' | 'VESSEL') => filtered.filter(row => {
      const stat = String(row[colStatus] || '').trim().toUpperCase();
      if (cat === 'SPJM') return stat.includes('SPJM');
      if (cat === 'HOLD') return stat.includes('HOLD') || stat.includes('DELAY');
      return stat.includes('VESSEL') || stat.includes('SHIP');
    });

    const amountCol = colTotal || colQty;
    const summarize = (rows: any[]) => ({
      qty: Math.round(rows.reduce((s, r) => s + (amountCol && r[amountCol] != null ? Number(r[amountCol]) || 0 : 0), 0)),
      docs: countDistinctDocs(rows),
    });

    return {
      spjm: summarize(rowsFor('SPJM')),
      hold: summarize(rowsFor('HOLD')),
      vessel: summarize(rowsFor('VESSEL')),
    };
  }, [filtered, colStatus, colQty, colTotal, colPo, colPr, colContainer]);

  // Distinct-PO counterparts of the overdue-only figures (overdueInsights
  // rows are already one-per-container, same as `filtered`).
  const overdueDocCounts = useMemo(() => {
    const byCat = (cat: string) => countDistinctByKey(overdueInsights.filter((x: any) => x.statusCategory === cat), 'po');
    return {
      total: countDistinctByKey(overdueInsights, 'po'),
      spjm: byCat('SPJM'),
      hold: byCat('HOLD'),
      vessel: byCat('VESSEL'),
    };
  }, [overdueInsights]);

  // Top 3 cabang with the most overdue documents, per status category - lets
  // ops immediately see WHERE to escalate instead of just how many overall.
  const topOverdueBranchesByStatus = useMemo(() => {
    const topForCategory = (cat: string) => {
      const rows = overdueInsights.filter((x: any) => x.statusCategory === cat);
      const byBranch: Record<string, any[]> = {};
      rows.forEach((r: any) => {
        const b = r.cabang || 'Unknown';
        if (!byBranch[b]) byBranch[b] = [];
        byBranch[b].push(r);
      });
      return Object.entries(byBranch)
        .map(([branch, branchRows]) => ({ branch, count: countDistinctByKey(branchRows, 'po') }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    };
    return {
      spjm: topForCategory('SPJM'),
      hold: topForCategory('HOLD'),
      vessel: topForCategory('VESSEL'),
    };
  }, [overdueInsights]);

  // Document-chain completeness gaps: PR -> PO -> PI -> BL. A "gap" row is one
  // where the upstream document number exists but the next one in the chain
  // is still blank - i.e. work that's stalled at that handoff.
  // A row counts as "PO belum ada / on process" either because its PO column
  // is literally still blank, OR because Status Compile already says so in
  // words ("PO on Process" / "PO belum release") even when some placeholder
  // value sits in the PO column - the previous version only checked column
  // emptiness, so those two statuses fell out of the "PR Belum Ada PO" count.
  const isPoNotYetReleasedStatus = (stat: string) =>
    /PO\s*ON\s*PROCESS/.test(stat) || /PO\s*(SEDANG\s*)?PROSES/.test(stat) || /PO\s*BELUM\s*RELEASE/.test(stat);

  const documentChainGaps = useMemo(() => {
    const empty = { count: 0, topCabang: [] as { branch: string; count: number }[] };
    if (filtered.length === 0) return { prNoPo: empty, poNoPi: empty, piNoBl: empty, prBelumReleased: empty };

    const buildGap = (fromCol?: string, toCol?: string, extraStatusMatch?: (stat: string) => boolean) => {
      if (!fromCol) return empty;
      const rows = filtered.filter(r => {
        const missingViaColumns = !isEmptyDocVal(r[fromCol]) && isEmptyDocVal(toCol ? r[toCol] : undefined);
        const missingViaStatus = extraStatusMatch && colStatus ? extraStatusMatch(String(r[colStatus] || '').trim().toUpperCase()) : false;
        return missingViaColumns || missingViaStatus;
      });
      const count = countDistinctDocs(rows);
      const byBranch: Record<string, Set<string>> = {};
      rows.forEach((r, i) => {
        const b = colCabang ? String(r[colCabang] || 'Unknown') : 'Unknown';
        if (!byBranch[b]) byBranch[b] = new Set();
        byBranch[b].add(getDocKey(r, i));
      });
      const topCabang = Object.entries(byBranch)
        .map(([branch, set]) => ({ branch, count: set.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      return { count, topCabang };
    };

    // PO Belum Ada PI
    const buildPoNoPi = () => {
      const rows = filtered.filter(r => {
        const poVal = String(colPo ? r[colPo] : '').trim().toUpperCase();
        const hasPo = poVal.startsWith('PO') && !isEmptyDocVal(poVal);
        const missingPi = isEmptyDocVal(colPi ? r[colPi] : undefined);
        return hasPo && missingPi;
      });
      const count = countDistinctField(rows, colPo);
      const byBranch: Record<string, Set<string>> = {};
      rows.forEach(r => {
        const b = colCabang ? String(r[colCabang] || 'Unknown') : 'Unknown';
        const key = colPo ? String(r[colPo] ?? '').trim() : '';
        if (isEmptyDocVal(key) || !key.toUpperCase().startsWith('PO')) return;
        if (!byBranch[b]) byBranch[b] = new Set();
        byBranch[b].add(key);
      });
      const topCabang = Object.entries(byBranch)
        .map(([branch, set]) => ({ branch, count: set.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      return { count, topCabang };
    };

    // PR Belum Released
    const buildPrBelumReleased = () => {
      const rows = filtered.filter(r => {
        const poVal = String(colPo ? r[colPo] : '').trim().toUpperCase();
        const statVal = String(colStatus ? r[colStatus] : '').trim().toUpperCase();
        return poVal.includes('PR BELUM RELEASE') || statVal.includes('PR BELUM RELEASE');
      });
      const count = countDistinctField(rows, colPr);
      const byBranch: Record<string, Set<string>> = {};
      rows.forEach(r => {
        const b = colCabang ? String(r[colCabang] || 'Unknown') : 'Unknown';
        const key = colPr ? String(r[colPr] ?? '').trim() : '';
        if (isEmptyDocVal(key)) return;
        if (!byBranch[b]) byBranch[b] = new Set();
        byBranch[b].add(key);
      });
      const topCabang = Object.entries(byBranch)
        .map(([branch, set]) => ({ branch, count: set.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      return { count, topCabang };
    };

    // PI Belum Ada BL
    const buildPiNoBl = () => {
      const rows = filtered.filter(r => {
        const hasPi = !isEmptyDocVal(colPi ? r[colPi] : undefined);
        const missingBl = isEmptyDocVal(colBl ? r[colBl] : undefined);
        return hasPi && missingBl;
      });
      const count = countDistinctDocs(rows);
      const byBranch: Record<string, Set<string>> = {};
      rows.forEach((r, i) => {
        const b = colCabang ? String(r[colCabang] || 'Unknown') : 'Unknown';
        const key = getDocKey(r, i);
        if (!byBranch[b]) byBranch[b] = new Set();
        byBranch[b].add(key);
      });
      const topCabang = Object.entries(byBranch)
        .map(([branch, set]) => ({ branch, count: set.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      return { count, topCabang };
    };

    return {
      prNoPo: buildGap(colPr, colPo, isPoNotYetReleasedStatus),
      poNoPi: buildPoNoPi(),
      piNoBl: buildPiNoBl(),
      prBelumReleased: buildPrBelumReleased()
    };
  }, [filtered, colPr, colPo, colPi, colBl, colCabang, colStatus, colContainer]);

  // Distinct count of PR "ON PROCESS" whose Tanggal ETA is <= current date + 90 days, or empty.
  const onProcessOverdueInsight = useMemo(() => {
    const empty = { count: 0, topCabang: [] as { branch: string; count: number }[] };
    if (!colStatus || filtered.length === 0) return empty;
    
    const rows = filtered.filter(row => {
      const stat = String(row[colStatus] || '').trim().toUpperCase();
      if (!stat.includes('PROCESS')) return false;
      
      if (!colTanggalEta) return true;
      const etaDate = parseDateVal(row[colTanggalEta]);
      if (!etaDate) return true;
      
      const diffDays = Math.floor((etaDate.getTime() - rawDataProcessingDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 90;
    });
    
    const count = countDistinctField(rows, colPr);
    const byBranch: Record<string, Set<string>> = {};
    rows.forEach(row => {
      const b = colCabang ? String(row[colCabang] || 'Unknown') : 'Unknown';
      const key = colPr ? String(row[colPr] ?? '').trim() : '';
      if (isEmptyDocVal(key)) return;
      if (!byBranch[b]) byBranch[b] = new Set();
      byBranch[b].add(key);
    });
    
    const topCabang = Object.entries(byBranch)
      .map(([branch, set]) => ({ branch, count: set.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return { count, topCabang };
  }, [filtered, colStatus, colTanggalEta, colPr, colCabang, rawDataProcessingDate]);

  // Distinct count of PR already at status READY, plus the top 3 branches
  // holding the most of them (i.e. where stock is ready to be picked up/unloaded).
  const readyPrInsight = useMemo(() => {
    const empty = { count: 0, topCabang: [] as { branch: string; count: number }[] };
    if (!colStatus || filtered.length === 0) return empty;

    const rows = filtered.filter(row => String(row[colStatus] || '').trim().toUpperCase().includes('READY'));
    const count = countDistinctField(rows, colPr);

    const byBranch: Record<string, Set<string>> = {};
    rows.forEach(row => {
      const b = colCabang ? String(row[colCabang] || 'Unknown') : 'Unknown';
      const key = colPr ? String(row[colPr] ?? '').trim() : '';
      if (isEmptyDocVal(key)) return;
      if (!byBranch[b]) byBranch[b] = new Set();
      byBranch[b].add(key);
    });
    const topCabang = Object.entries(byBranch)
      .map(([branch, set]) => ({ branch, count: set.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return { count, topCabang };
  }, [filtered, colStatus, colPr, colCabang]);

  // Chart data: Grouped by Cabang, Week ETA & by Category, Count by STATUS Compile and Category
  const { chartData, chartEtaData, chartContainerData, totalContainers, chartCategoryData, statusList, categoryList, totalQty } = useMemo(() => {
    if (!parsed || filtered.length === 0) return { chartData: [], chartEtaData: [], chartContainerData: [], totalContainers: 0, chartCategoryData: [], statusList: [], categoryList: [], totalQty: 0 };
    const mapCabang: Record<string, any> = {};
    const mapEta: Record<string, any> = {};
    const mapCat: Record<string, any> = {};
    const statuses = new Set<string>();
    const categories = new Set<string>();
    let qtySum = 0;

    const colCatUse = colCategory || colGrup;
    const amountCol = colTotal || colQty;

    for (let rowIdx = 0; rowIdx < filtered.length; rowIdx++) {
      const row = filtered[rowIdx];
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      const cat = colCatUse ? (String(row[colCatUse] || 'Umum / No Kategori').trim()) : 'Umum';
      const eta = colEta ? (row[colEta] || 'Unscheduled / Tanpa ETA') : 'Unscheduled';

      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      const stat = colStatus ? (String(row[colStatus] || 'Unknown').toUpperCase()) : 'TOTAL';
      // row[amountCol] is already a parsed number from the `filtered` memo
      // (colTotal preferred - this is the "kolom total" SUM the Qty metrics
      // must reconcile against; colQty is only a fallback for files with no
      // dedicated Total column). Missing value defaults to 0, NOT 1 - the old
      // "default to 1" here silently turned every row lacking colQty into a
      // fake "1 unit" and inflated/corrupted every downstream Qty total.
      const q = amountCol && row[amountCol] != null && row[amountCol] !== '' ? Math.round(Number(row[amountCol]) || 0) : 0;

      statuses.add(stat);
      categories.add(cat);
      qtySum += q;

      // Group by Cabang
      if (!mapCabang[cbg]) {
        mapCabang[cbg] = { cabang: cbg, distinctPOs: new Map<string, string>(), statusDocSets: {} as Record<string, Set<string>> };
      }
      mapCabang[cbg][stat] = Math.round((mapCabang[cbg][stat] || 0) + q);
      mapCabang[cbg][cat] = Math.round((mapCabang[cbg][cat] || 0) + q);

      // Record distinct document per Cabang (PO -> PR -> Container -> row
      // fallback via getDocKey) instead of distinct-PO-only - a PO-only key
      // silently dropped every row still in an early stage (PR belum
      // release / PO on Process) that has no PO number yet.
      const docKey = getDocKey(row, rowIdx);
      mapCabang[cbg].distinctPOs.set(docKey, getDocLabel(row));
      if (!mapCabang[cbg].statusDocSets[stat]) mapCabang[cbg].statusDocSets[stat] = new Set<string>();
      mapCabang[cbg].statusDocSets[stat].add(docKey);

      // Group by Week ETA
      if (!mapEta[eta]) {
        mapEta[eta] = { eta: eta };
      }
      mapEta[eta][stat] = Math.round((mapEta[eta][stat] || 0) + q);
      mapEta[eta][cat] = Math.round((mapEta[eta][cat] || 0) + q);

      // Group by Category
      if (!mapCat[cat]) {
        mapCat[cat] = { category: cat };
      }
      mapCat[cat][stat] = Math.round((mapCat[cat][stat] || 0) + q);
    }

    const chartContainerData = Object.values(mapCabang).map((item: any) => {
      const statusDocSets: Record<string, Set<string>> = item.statusDocSets || {};
      const statusBreakdown = Object.entries(statusDocSets)
        .map(([status, set]) => ({ status, count: (set as Set<string>).size }))
        .sort((a, b) => b.count - a.count);
      return {
        cabang: item.cabang,
        "Jumlah Container": item.distinctPOs ? item.distinctPOs.size : 0,
        poList: item.distinctPOs ? Array.from((item.distinctPOs as Map<string, string>).values()) : [],
        statusBreakdown,
      };
    }).sort((a: any, b: any) => b["Jumlah Container"] - a["Jumlah Container"]);

    const totalContainers = chartContainerData.reduce((sum, d) => sum + d["Jumlah Container"], 0);

    return {
      chartData: Object.values(mapCabang),
      chartEtaData: Object.values(mapEta).sort((a, b) => parseEtaRank(String(a.eta)) - parseEtaRank(String(b.eta))),
      chartContainerData,
      totalContainers,
      chartCategoryData: Object.values(mapCat),
      statusList: Array.from(statuses),
      categoryList: Array.from(categories),
      totalQty: Math.round(qtySum)
    };
  }, [parsed, filtered, colCabang, colCategory, colGrup, colEta, colStatus, colQty, colTotal, colPo, colPr, colContainer, selectedCabangForChart]);

  // Excel-like Filtered Rows for Table Detail
  const displayedDetailRows = useMemo(() => {
    if (!filtered || filtered.length === 0) return [];
    return applyColumnFilters(filtered, colFilters, (row, col) => row[col]);
  }, [filtered, colFilters]);

  // Unique values for Active Filter Modal
  const currentModalUniqueValues = useMemo(() => {
    if (!activeFilterModalCol || !filtered) return [];
    return getUniqueColumnValues(filtered, activeFilterModalCol, (row, col) => row[col]);
  }, [activeFilterModalCol, filtered]);

  const handleApplyModalFilter = (selectedVals: string[]) => {
    if (!activeFilterModalCol) return;
    setColFilters(prev => ({
      ...prev,
      [activeFilterModalCol]: {
        search: modalSearchInput,
        selected: selectedVals.length === currentModalUniqueValues.length ? [] : selectedVals
      }
    }));
    setActiveFilterModalCol(null);
    setModalSearchInput('');
    toast.success(`Filter kolom ${activeFilterModalCol} diaplikasikan!`);
  };

  const handleExport = () => {
    if (!parsed || !parsed.data) return;
    const header = parsed.headers.map(h => `"${h}"`).join(',');
    const lines = [header];

    displayedDetailRows.forEach(row => {
      const line = parsed.headers.map(h => {
        let val = row[h];
        if (val === undefined || val === null) val = '';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return val;
      }).join(',');
      lines.push(line);
    });

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getStandardFilename(`PR_Update_${activeScenario}`, new Date().toISOString(), 'csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📊 Hasil Analisis PR Update Berhasil Diekspor!');
  };

  // ── Offline HTML export config: normalize dynamic-column data to fixed
  // field names so the export's filters/tables have a stable schema regardless
  // of what headers the uploaded file happened to use. ──
  const normalizedFiltered = useMemo(() => filtered.map((row: any, idx: number) => {
    const amountCol = colTotal || colQty;
    return {
      cabang: colCabang ? row[colCabang] : '-',
      po: colPo ? row[colPo] : '-',
      nopr: colPr ? row[colPr] : '-',
      grup: colGrup ? row[colGrup] : '-',
      category: (colCategory || colGrup) ? row[(colCategory || colGrup) as string] : '-',
      description: colDesc ? row[colDesc] : '-',
      status: colStatus ? row[colStatus] : '-',
      eta: colEta ? row[colEta] : '-',
      tanggal_eta: colTanggalEta ? row[colTanggalEta] : '-',
      qty: colQty ? row[colQty] : 0,
      total: amountCol ? row[amountCol] : 0,
      // Distinct-document key (PO -> PR -> Container -> row fallback) so the
      // offline export's "Total Dokumen" KPI stays consistent with the live
      // dashboard's distinct-document count instead of distinct-PO-only.
      doc_key: getDocKey(row, idx),
      container: colContainer ? row[colContainer] : '-',
      carrier: colCarrier ? row[colCarrier] : '-',
    };
  }), [filtered, colCabang, colPo, colPr, colGrup, colCategory, colDesc, colStatus, colEta, colTanggalEta, colQty, colTotal, colContainer, colCarrier]);

  const holdItemsNormalized = useMemo(
    () => normalizedFiltered.filter((r) => /HOLD|DELAY|TUNDA|SPJM/.test(String(r.status || '').toUpperCase())),
    [normalizedFiltered]
  );

  const leadTimeRawNormalized = useMemo(() => {
    if (!leadTimeData?.raw) return [];
    return leadTimeData.raw.map((r: any) => ({
      branch: r['BRANCH RCPT BRANCH'] || '-',
      container: r['CONTAINER'] || '-',
      month_eta: r['MONTH ETA'] || '-',
      tgl_sppb: r['TGL SPPB'] || '-',
      tgl_eta_pib: r['TGL ETA BY PIB'] || '-',
      days_sppb_eta: r['DAYS SPPB - ETA'],
      days_bongkar: r['DAYS BONGKAR - SPPB - 1'],
      total_days: r['TOTAL DAYS'],
    }));
  }, [leadTimeData]);

  const leadTimeBranches = useMemo(
    () => Array.from(new Set(leadTimeRawNormalized.map((r) => r.branch).filter(Boolean))) as string[],
    [leadTimeRawNormalized]
  );

  // Contextual filter options for the offline HTML export - derived from
  // `normalizedFiltered` itself (the exact array used as `pr_detail.data`
  // below), not from the raw dataset or the cross-linked-but-partial
  // `cabangs`/`categories`/`etas`/`statusCompiles` selector-option lists
  // above (those intentionally ignore some of the active filters so the
  // on-screen dropdowns stay usable for multi-select). Without this, the
  // exported HTML's own re-filter UI could offer values that don't even
  // exist in the exported subset.
  const contextualCabangOptions = useMemo(
    () => Array.from(new Set(normalizedFiltered.map((r) => r.cabang))).filter((v) => v && v !== '-').sort() as string[],
    [normalizedFiltered]
  );
  const contextualCategoryOptions = useMemo(
    () => Array.from(new Set(normalizedFiltered.map((r) => r.category))).filter((v) => v && v !== '-').sort() as string[],
    [normalizedFiltered]
  );
  const contextualEtaOptions = useMemo(
    () => Array.from(new Set(normalizedFiltered.map((r) => r.eta))).filter((v) => v && v !== '-').sort() as string[],
    [normalizedFiltered]
  );
  const contextualStatusOptions = useMemo(
    () => Array.from(new Set(normalizedFiltered.map((r) => r.status))).filter((v) => v && v !== '-').sort() as string[],
    [normalizedFiltered]
  );

  const exportConfig: ModuleExportConfig | undefined = parsed ? {
    moduleName: 'PR_Update_Lead_Time',
    processedAt: parsed.processed_at,
    domElementId: 'export-container',
    filters: activeTab === 'lead_time'
      ? [{ field: 'branch', label: 'Filter Cabang', options: leadTimeBranches }]
      : [
          { field: 'cabang', label: 'Filter Cabang', options: contextualCabangOptions },
          { field: 'category', label: 'Filter Kategori/Grup', options: contextualCategoryOptions },
          { field: 'eta', label: 'Filter Week ETA', options: contextualEtaOptions },
          { field: 'status', label: 'Filter Status Compile', options: contextualStatusOptions },
        ],
    tables: activeTab === 'lead_time'
      ? [{
          id: 'lead_time_raw',
          title: 'Data Lead Time (Detail)',
          filterFields: ['branch'],
          data: leadTimeRawNormalized,
          columns: [
            { key: 'branch', label: 'Cabang' },
            { key: 'container', label: 'Container' },
            { key: 'month_eta', label: 'Bulan ETA' },
            { key: 'tgl_sppb', label: 'Tgl SPPB' },
            { key: 'tgl_eta_pib', label: 'Tgl ETA (PIB)' },
            { key: 'days_sppb_eta', label: 'Hari SPPB-ETA', align: 'right', format: 'number' },
            { key: 'days_bongkar', label: 'Hari Bongkar', align: 'right', format: 'number' },
            { key: 'total_days', label: 'Total Hari', align: 'right', format: 'number', highlight: { above: 14 } },
          ],
        }]
      : [
          {
            id: 'pr_detail',
            title: 'Detail PR Update & Tracking Container',
            filterFields: ['cabang', 'category', 'eta', 'status'],
            data: normalizedFiltered,
            columns: [
              { key: 'cabang', label: 'Cabang' },
              { key: 'po', label: 'No. PO' },
              { key: 'nopr', label: 'No. PR' },
              { key: 'grup', label: 'Grup' },
              { key: 'category', label: 'Category' },
              { key: 'description', label: 'Deskripsi' },
              { key: 'status', label: 'Status Compile' },
              { key: 'eta', label: 'Week ETA' },
              { key: 'tanggal_eta', label: 'Tanggal ETA' },
              { key: 'qty', label: 'Qty', align: 'right', format: 'number' },
              { key: 'total', label: 'Total', align: 'right', format: 'number' },
              { key: 'container', label: 'No. Container' },
              { key: 'carrier', label: 'Shipping Line' },
            ],
          },
          {
            id: 'hold_items',
            title: 'Item Hold Delivery / SPJM / Delay',
            filterFields: ['cabang', 'category', 'eta', 'status'],
            data: holdItemsNormalized,
            emptyLabel: 'Tidak ada item Hold/SPJM/Delay untuk filter yang dipilih.',
            columns: [
              { key: 'cabang', label: 'Cabang' },
              { key: 'po', label: 'No. PO' },
              { key: 'status', label: 'Status Compile' },
              { key: 'eta', label: 'Week ETA' },
              { key: 'qty', label: 'Qty', align: 'right', format: 'number' },
            ],
          },
        ],
    kpis: activeTab === 'lead_time'
      ? [{ id: 'avg_total_days', label: 'Avg Total Days', sourceTableId: 'lead_time_raw', field: 'total_days', agg: 'avg', decimals: 1, suffix: ' hari' }]
      : [
          { id: 'total_qty', label: 'Total Qty Pesanan PR', sourceTableId: 'pr_detail', field: 'total', agg: 'sum', decimals: 0, suffix: ' Qty' },
          { id: 'total_dokumen', label: 'Total Dokumen PO/PR', sourceTableId: 'pr_detail', field: 'doc_key', agg: 'countDistinct', decimals: 0, suffix: ' Dokumen' },
          { id: 'hold_count', label: 'Item Hold/SPJM/Delay', sourceTableId: 'hold_items', field: 'doc_key', agg: 'countDistinct', decimals: 0, suffix: ' Dokumen' },
        ],
  } : undefined;

  // ── Dual-export (HTML + Excel raw data terfilter cabang) wiring ──
  // Excel raw source SENGAJA diambil dari data mentah (sebelum filter
  // category/eta/status, hanya cabang) - bukan dari `normalizedFiltered`/
  // `leadTimeRawNormalized` yang dipakai HTML export - supaya Excel berisi
  // seluruh record cabang terpilih apa adanya, dan filter cabang benar-benar
  // ditegakkan ulang di backend (bukan sekadar meneruskan data yang sudah
  // difilter di client).
  const dualExportCabang = activeTab === 'lead_time' ? selectedLtCabang : selectedCabang;
  const dualExportRawRows = activeTab === 'lead_time' ? (leadTimeRawAll ?? undefined) : (parsed?.data ?? undefined);
  const dualExportCabangField = activeTab === 'lead_time' ? 'BRANCH RCPT BRANCH' : colCabang;

  return (
    <div id="export-container" className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HERO BANNER HEADER ─── */}
      <PageHeader
        icon={FileBarChart}
        eyebrow="Dashboard Data Harian • PR Update & Tracking Container"
        title="PR Update & Tracking Container"
        highlight="(Integrated Tracker)"
        description="Modul gabungan pemantauan Purchase Requisition dan Live Tracking Container kapal (On Vessel, SPJM, Hold)."
        actions={
          <>
            <TimestampBadge timestamp={parsed?.processed_at} label="Olah Terakhir:" />
            {exportConfig
              ? <ExportHtmlButton
                  config={exportConfig}
                  moduleName="PR_Update_Lead_Time"
                  processedAt={parsed?.processed_at}
                  cabang={dualExportCabang}
                  rawRows={dualExportRawRows}
                  cabangField={dualExportCabangField}
                />
              : <ExportHtmlButton elementId="export-container" moduleName="PR_Update_Lead_Time" processedAt={parsed?.processed_at} />}
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="no-export min-h-[44px] w-full sm:w-auto px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </>
        }
      />

      {/* ─── PANDUAN, TEMPLATE & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-purple-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-purple-400" /> Panduan Upload Data PR Update (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo (+ SPJM)
              </button>
              <button
                onClick={handleSaveToGlobal}
                disabled={!parsed}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg"
              >
                <Cloud className="w-4 h-4" /> Simpan ke Global
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">📌 Pelacakan Status Pengadaan & SPJM:</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Modul ini memantau kolom <i>STATUS Compile</i> seperti <i>ON VESSEL, HOLD DELIVERY, SPJM, READY,</i> atau <i>PLAN LOADING</i> untuk mendeteksi bottleneck per cabang dan minggu ETA.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">⚙️ Engine Pembacaan Excel (XLSX & CSV):</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Dilengkapi parsing XLSX ArrayBuffer, Anda dapat mengunggah file Excel (.xlsx) maupun CSV hasil ekstraksi sistem procurement tanpa kendala kerusakan karakter atau format numerik.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Unggah File PR Update Anda:</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data PR Update (Excel / CSV)"
              description="Drag & drop file di sini. Sistem otomatis merekap total Qty dan dokumen per status."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── MAIN MODULE TAB SWITCHER ─── */}
      <div className="flex flex-wrap items-center gap-4 bg-muted p-2 rounded-xl border border-border">
        <button
          onClick={() => setActiveTab('pr_update')}
          className={`flex-1 py-3 px-6 rounded-lg font-bold text-sm transition-colors duration-200 flex items-center justify-center gap-2 ${activeTab === 'pr_update' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-background hover:text-foreground'}`}
        >
          <FileBarChart className="w-4 h-4" /> Analisa PR & Status
        </button>
        <button
          onClick={() => setActiveTab('lead_time')}
          className={`flex-1 py-3 px-6 rounded-lg font-bold text-sm transition-colors duration-200 flex items-center justify-center gap-2 ${activeTab === 'lead_time' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-background hover:text-foreground'}`}
        >
          <Timer className="w-4 h-4" /> Analisa Lead Time
        </button>
      </div>

      {activeTab === 'pr_update' && (
        <div className="space-y-8 animate-fade-in">
          {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
          <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Rantai Pasok PR/PO:
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk memproyeksikan percepatan atau delay lead time!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-purple-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-purple-400'}`} />
                    {sc.title}
                  </span>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-black uppercase tracking-wider">
                      Aktif
                    </span>
                  )}
                </div>
                <p className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'text-white font-medium' : 'text-slate-600'}`}>
                  {sc.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── EXECUTIVE KPI SUMMARY CHIPS (frozen snapshot — a live, filterable copy is generated in the offline export section below) ─── */}
      <div className="no-export grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Total Qty Pesanan PR"
          value={`${totalQty.toLocaleString('id-ID')} Qty`}
          trend={colTotal ? `SUM Kolom "${colTotal}"` : 'Total Kuantitas Order Masuk'}
          icon={<Truck className="w-5 h-5 text-purple-400" />}
          className="border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition"
        />
        <KPICard
          title="Total Dokumen PO/PR"
          value={`${distinctPoCountFiltered.toLocaleString('id-ID')} Dokumen`}
          trend="Distinct Dokumen (PO/PR/Container) • Filter Aktif"
          icon={<FileBarChart className="w-5 h-5 text-blue-400" />}
          className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
        />
        <KPICard
          title="Item Hold Delivery / SPJM"
          value={`${statusOverview.hold.docs + statusOverview.spjm.docs} Dokumen`}
          trend={statusOverview.hold.docs + statusOverview.spjm.docs === 0 ? "Aliran Pasokan Lancar" : "Perlu Tindak Lanjut / Cek Port"}
          isAlert={statusOverview.hold.docs + statusOverview.spjm.docs > 0}
          icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
          className="border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40 transition"
        />
        <KPICard
          title="Sebaran ETA"
          value={`${docCountByEta.reduce((s, d) => s + d.count, 0).toLocaleString('id-ID')} Dokumen`}
          trend={docCountByEta.length > 0 ? `${docCountByEta.length} Periode ETA` : 'Belum ada data Week ETA'}
          icon={<Calendar className="w-5 h-5 text-emerald-400" />}
          className="border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition"
        />
      </div>

      {/* ─── RINCIAN: TOP 5 KATEGORI, DOKUMEN PER STATUS COMPILE, SEBARAN ETA ─── */}
      <div className="no-export grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="p-5 border-purple-500/20 bg-white shadow-md">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-700 flex items-center gap-1.5 mb-3">
            <Package className="w-4 h-4" /> Top 5 Item Category ({colTotal ? 'by Total' : 'by Qty'})
          </h4>
          {top5Categories.length === 0 ? (
            <p className="text-xs text-slate-500">Tidak ada data kategori untuk filter aktif.</p>
          ) : (
            <div className="space-y-2">
              {top5Categories.map((c, i) => (
                <div key={c.category} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-purple-100 text-purple-700 font-black flex items-center justify-center text-[10px]">{i + 1}</span>
                    <span className="truncate font-semibold text-slate-800" title={c.category}>{c.category}</span>
                  </span>
                  <span className="font-mono font-bold text-purple-700 shrink-0">{c.total.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5 border-blue-500/20 bg-white shadow-md">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-blue-700 flex items-center gap-1.5 mb-3">
            <FileBarChart className="w-4 h-4" /> Dokumen per Status Compile (Distinct)
          </h4>
          {docCountByStatus.length === 0 ? (
            <p className="text-xs text-slate-500">Tidak ada data status untuk filter aktif.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {docCountByStatus.map((s) => (
                <div key={s.status} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-slate-800" title={s.status}>{s.status}</span>
                  <span className="font-mono font-bold text-blue-700 shrink-0">{s.count.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5 border-emerald-500/20 bg-white shadow-md">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5 mb-3">
            <Calendar className="w-4 h-4" /> Sebaran ETA (Dokumen per Week ETA)
          </h4>
          {docCountByEta.length === 0 ? (
            <p className="text-xs text-slate-500">Tidak ada data Week ETA untuk filter aktif.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {docCountByEta.map((e) => (
                <div key={e.eta} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-slate-800" title={e.eta}>{e.eta}</span>
                  <span className="font-mono font-bold text-emerald-700 shrink-0">{e.count.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* ─── FILTER CONTROLS & SELECTION (live-only — dead after clone; real offline filters are generated below) ─── */}
      <GlassCard allowOverflow={true} className="no-export p-6 border-slate-200 bg-white backdrop-blur-xl mb-10 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
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
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📦 Filter Kategori / Grup:</label>
            <MultiSelect
              options={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
              selectAllLabel="Semua Kategori"
              placeholder="Pilih Kategori..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🗓️ Filter Week ETA:</label>
            <MultiSelect
              options={etas}
              selected={selectedEta}
              onChange={setSelectedEta}
              selectAllLabel="Semua ETA"
              placeholder="Pilih ETA..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">⚡ Filter Status Compile:</label>
            <MultiSelect
              options={statusCompiles}
              selected={selectedStatusCompile}
              onChange={setSelectedStatusCompile}
              selectAllLabel="Semua Status"
              placeholder="Pilih Status..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📍 Sorot Grafik Cabang:</label>
            <select
              value={selectedCabangForChart}
              onChange={(e) => setSelectedCabangForChart(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-800 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 outline-none transition font-semibold cursor-pointer shadow-md"
            >
              <option value="All">🌐 Seluruh Cabang (All)</option>
              {cabangs.filter(c => c !== 'All').map((cab) => (
                <option key={cab} value={cab}>🏢 {cab}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── VISUALIZATION CHART: TERPADU WEEK ETA & STACKED CATEGORY ─── */}
      {((chartViewMode === 'eta' && chartEtaData.length > 0) || (chartViewMode === 'cabang' && chartData.length > 0) || (chartViewMode === 'container' && chartContainerData.length > 0)) && (
        <GlassCard className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-border pb-4 mb-6 gap-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Grafik Distribusi Status Compile & Persebaran Category ({chartViewMode === 'eta' ? 'per Week ETA' : chartViewMode === 'cabang' ? 'per Cabang' : 'Jumlah Container per Cabang'})
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {chartViewMode === 'container' ? (
                  <>Sumbu X: <b className="text-emerald-600">Cabang</b> • Sumbu Y: <b className="text-cyan-700">Jumlah Dokumen</b> (distinct count PO → PR → Container per cabang, termasuk dokumen yang belum punya No. PO).</>
                ) : (
                  <>Sumbu X: <b className="text-emerald-600">{chartViewMode === 'eta' ? 'Week ETA' : 'Cabang'}</b> • Batang bertingkat (Stacked Bar): <b className="text-primary">Category Barang</b> sesuai filter terpilih • Nilai = SUM {colTotal ? `kolom "${colTotal}"` : 'Qty'}.</>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex bg-muted p-1 rounded-xl border border-border shadow-sm">
                <button
                  onClick={() => setChartViewMode('eta')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    chartViewMode === 'eta' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🗓️ Week ETA
                </button>
                <button
                  onClick={() => setChartViewMode('cabang')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    chartViewMode === 'cabang' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🏢 Cabang
                </button>
                <button
                  onClick={() => setChartViewMode('container')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    chartViewMode === 'container' ? 'bg-cyan-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  📦 Jumlah Container
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-cyan-700 bg-cyan-50 px-3.5 py-2 rounded-xl border border-cyan-200 shadow-sm" title="Total dokumen dari distinct count PO → PR → Container per Cabang">
                <Package className="w-4 h-4 text-cyan-600 shrink-0" />
                <span>Jumlah Dokumen: {totalContainers?.toLocaleString('id-ID') || 0} (Distinct)</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-xl border border-border">
                <span>🏷️ Menampilkan {chartViewMode === 'container' ? `${chartContainerData.length} cabang (Distinct Dokumen)` : `${categoryList.length} kategori pada ${chartViewMode === 'eta' ? `${chartEtaData.length} periode ETA` : `${chartData.length} cabang`}`}</span>
              </div>
            </div>
          </div>

          <div className="w-full pb-4" style={{ minHeight: '520px' }}>
            <ResponsiveContainer width="100%" height={460}>
              <BarChart data={chartViewMode === 'eta' ? chartEtaData : chartViewMode === 'container' ? chartContainerData : chartData} margin={{ top: 20, right: 60, left: 40, bottom: 60 }}>
                <defs>
                  <linearGradient id="containerBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey={chartViewMode === 'eta' ? 'eta' : 'cabang'} stroke="#94a3b8" tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} angle={-35} textAnchor="end" height={90} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 12 }} width={100} tickFormatter={(val) => Number(val).toLocaleString('en-US')} />
                <Tooltip
                  content={chartViewMode === 'container' ? <CustomContainerTooltip /> : <CustomStackedTooltip />}
                  wrapperStyle={{ zIndex: 999999, pointerEvents: 'auto', outline: 'none' }}
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                />
                {chartViewMode === 'container' ? (
                  <Bar
                    dataKey="Jumlah Container"
                    name="Jumlah Dokumen (Distinct Count PO → PR → Container per Cabang)"
                    fill="url(#containerBarGradient)"
                    maxBarSize={60}
                    radius={[8, 8, 0, 0]}
                  />
                ) : (
                  categoryList.map((cat, idx) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      name={cat}
                      fill={COLORS[idx % COLORS.length]}
                      stackId="pr_cat_stack"
                      maxBarSize={50}
                    />
                  ))
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Custom scrollable legend - see ScrollableLegend for why this replaces recharts' <Legend> */}
          <ScrollableLegend
            payload={
              chartViewMode === 'container'
                ? [{ value: 'Jumlah Dokumen (Distinct)', color: '#3987e5' }]
                : categoryList.map((cat, idx) => ({ value: cat, color: COLORS[idx % COLORS.length] }))
            }
          />
        </GlassCard>
      )}

      {/* ─── INSIGHT ALERT: PO OVERDUE ETA (SPJM, HOLD DELIVERY & ON VESSEL) ─── */}
      <GlassCard className="p-6 overflow-hidden relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-4 mb-6 gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider mb-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> Warning Supply Chain • Monitoring Keterlambatan Port & Vendor
            </div>
            <h3 className="text-lg sm:text-xl font-black text-foreground flex items-center gap-2.5">
              Insight PO Overdue: SPJM, Hold Delivery & On Vessel
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Mendeteksi dokumen dengan status krusial yang <b className="text-rose-600 underline">sudah melewati Tanggal ETA</b> dari tanggal pengolahan raw data (<b>{rawDataProcessingDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</b>).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {Object.keys(overdueColFilters).some(k => overdueColFilters[k]?.search || overdueColFilters[k]?.selected?.length > 0) && (
              <button
                onClick={() => { setOverdueColFilters({}); toast.success('Semua filter kolom overdue dibersihkan!'); }}
                className="min-h-[44px] px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset Filter Kolom
              </button>
            )}
            <span className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-100 border border-amber-300 font-black text-xs sm:text-sm text-amber-900 shadow-sm flex items-center gap-2">
              <Timer className="w-4 h-4 text-amber-700" />
              Total Overdue: {overdueDocCounts.total} PO
            </span>
          </div>
        </div>

        {overdueEtaDataIssues.length > 0 && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>
              {overdueEtaDataIssues.length} dokumen berstatus SPJM/Hold Delivery/On Vessel <b>tidak ikut dihitung</b> di insight ini karena kolom Tanggal ETA kosong atau formatnya tidak terbaca
              (contoh: {overdueEtaDataIssues.slice(0, 5).map((i: any) => `${i.po} [${i.status}, ETA: ${i.etaRaw}]`).join('; ')}
              {overdueEtaDataIssues.length > 5 ? `, dan ${overdueEtaDataIssues.length - 5} lainnya` : ''}).
              Periksa format tanggal pada kolom Tanggal ETA di file sumber untuk baris-baris ini.
            </span>
          </div>
        )}

        {/* Mini KPI Cards for Overdue Insights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-between transition-shadow hover:shadow-md">
            <div>
              <div className="text-xs text-purple-700 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <span>🟣 SPJM</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-foreground mt-1.5">
                {statusOverview.spjm.docs} <span className="text-xs font-semibold text-purple-700">Dokumen (Distinct PO)</span>
              </div>
              <div className="text-[11px] text-purple-800 font-mono font-bold mt-1 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 inline-block">
                Total Qty: {statusOverview.spjm.qty.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-purple-700/80 font-semibold mt-1">
                Overdue (ETA lewat): {overdueDocCounts.spjm} dokumen
              </div>
              {topOverdueBranchesByStatus.spjm.length > 0 && (
                <div className="text-[10px] text-purple-700/90 font-semibold mt-1.5 space-y-0.5">
                  <div className="uppercase tracking-wider text-purple-600/80">Top 3 Cabang Overdue:</div>
                  {topOverdueBranchesByStatus.spjm.map((b, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-purple-600">{i + 1}.</span> {b.branch} <span className="text-purple-700 font-mono">({b.count})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 text-2xl font-black">
              🟣
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between transition-shadow hover:shadow-md">
            <div>
              <div className="text-xs text-rose-700 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <span>🔴 Hold Delivery</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-foreground mt-1.5">
                {statusOverview.hold.docs} <span className="text-xs font-semibold text-rose-700">Dokumen (Distinct PO)</span>
              </div>
              <div className="text-[11px] text-rose-800 font-mono font-bold mt-1 bg-rose-100 px-2 py-0.5 rounded border border-rose-200 inline-block">
                Total Qty: {statusOverview.hold.qty.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-rose-700/80 font-semibold mt-1">
                Overdue (ETA lewat): {overdueDocCounts.hold} dokumen
              </div>
              {topOverdueBranchesByStatus.hold.length > 0 && (
                <div className="text-[10px] text-rose-700/90 font-semibold mt-1.5 space-y-0.5">
                  <div className="uppercase tracking-wider text-rose-600/80">Top 3 Cabang Overdue:</div>
                  {topOverdueBranchesByStatus.hold.map((b, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-rose-600">{i + 1}.</span> {b.branch} <span className="text-rose-700 font-mono">({b.count})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700 text-2xl font-black">
              🔴
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between transition-shadow hover:shadow-md">
            <div>
              <div className="text-xs text-blue-700 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <span>🔵 On Vessel</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-foreground mt-1.5">
                {statusOverview.vessel.docs} <span className="text-xs font-semibold text-blue-700">Dokumen (Distinct PO)</span>
              </div>
              <div className="text-[11px] text-blue-800 font-mono font-bold mt-1 bg-blue-100 px-2 py-0.5 rounded border border-blue-200 inline-block">
                Total Qty: {statusOverview.vessel.qty.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-blue-700/80 font-semibold mt-1">
                Overdue (ETA lewat): {overdueDocCounts.vessel} dokumen
              </div>
              {topOverdueBranchesByStatus.vessel.length > 0 && (
                <div className="text-[10px] text-blue-700/90 font-semibold mt-1.5 space-y-0.5">
                  <div className="uppercase tracking-wider text-blue-600/80">Top 3 Cabang Overdue:</div>
                  {topOverdueBranchesByStatus.vessel.map((b, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-blue-600">{i + 1}.</span> {b.branch} <span className="text-blue-700 font-mono">({b.count})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 text-2xl font-black">
              🔵
            </div>
          </div>
        </div>

        {/* Table of Overdue POs */}
        <p className="text-xs text-muted-foreground mb-2">
          Menampilkan {displayedOverdueInsights.length} dari {overdueInsights.length} dokumen overdue
          {Object.keys(overdueColFilters).some(k => overdueColFilters[k]?.search || overdueColFilters[k]?.selected?.length > 0) ? ' (terfilter)' : ''}.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border max-h-[420px] overflow-y-auto shadow-inner">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1050px]">
            <thead className="bg-muted text-muted-foreground uppercase font-bold sticky top-0 z-20 shadow-sm text-center text-[11px] tracking-wider">
              <tr className="border-b border-border">
                {OVERDUE_FILTER_COLUMNS.map((col, idx) => {
                  const isFiltered = overdueColFilters[col.key]?.search || (overdueColFilters[col.key]?.selected && overdueColFilters[col.key]?.selected.length > 0);
                  return (
                    <th
                      key={col.key}
                      className={`py-3.5 px-3 border-border align-middle ${idx === 0 ? 'text-left' : 'border-l'} ${
                        col.key === 'po' ? 'text-amber-700' :
                        col.key === 'status' ? 'text-purple-700' :
                        col.key === 'etaFormatted' ? 'text-cyan-700' :
                        col.key === 'overdueDays' ? 'text-rose-700 bg-rose-100 font-extrabold' :
                        col.key === 'deskripsi' ? 'text-left' :
                        col.key === 'qty' ? 'text-emerald-700' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate">{col.key === 'deskripsi' ? 'Deskripsi & Kategori' : col.label}</span>
                        <button
                          onClick={() => {
                            setActiveOverdueFilterCol(col.key);
                            setOverdueModalSearchInput(overdueColFilters[col.key]?.search || '');
                          }}
                          className={`p-1 rounded transition-colors shrink-0 ${
                            isFiltered ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300' : 'text-muted-foreground hover:text-foreground hover:bg-background'
                          }`}
                          title={`Filter Kolom ala Excel: ${col.label}`}
                        >
                          <Filter className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="py-3.5 px-4 border-l border-border">Action & Rekomendasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground text-center font-medium">
              {overdueInsights.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-emerald-700 font-bold bg-emerald-50 text-sm">
                    🎉 Tidak ada dokumen SPJM, Hold Delivery, atau On Vessel yang melewati Tanggal ETA! Seluruh rantai pasok tepat waktu.
                  </td>
                </tr>
              ) : displayedOverdueInsights.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground font-medium">
                    Tidak ada baris yang cocok dengan filter kolom aktif.{' '}
                    <span className="text-rose-600 underline cursor-pointer" onClick={() => setOverdueColFilters({})}>Klik di sini untuk mereset filter</span>.
                  </td>
                </tr>
              ) : displayedOverdueInsights.map((item: any, idx: number) => {
                const isSevere = item.overdueDays >= 14;
                const isMod = item.overdueDays >= 7 && !isSevere;
                return (
                  <tr key={idx} className="hover:bg-muted/60 transition-colors font-semibold">
                    <td className="py-3 px-3 text-left font-extrabold align-middle">
                      <span className="bg-muted text-foreground px-2 py-1 rounded-md">{item.cabang}</span>
                    </td>
                    <td className="py-3 px-3 border-l border-border font-mono font-bold text-amber-700 align-middle text-sm">
                      {item.po}
                    </td>
                    <td className="py-3 px-3 border-l border-border align-middle">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black inline-block ${
                        item.statusCategory === 'SPJM' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                        item.statusCategory === 'HOLD' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                        'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 border-l border-border font-mono text-cyan-700 align-middle font-bold">
                      {item.etaFormatted}
                    </td>
                    <td className="py-3 px-3 border-l border-border bg-rose-50/60 align-middle">
                      <span className={`px-3 py-1 rounded-full text-xs font-black inline-flex items-center gap-1.5 shadow-sm border ${
                        isSevere ? 'bg-rose-600 text-white border-rose-400' :
                        isMod ? 'bg-orange-500 text-white border-orange-300' :
                        'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        <Timer className="w-3.5 h-3.5 shrink-0" />
                        Terlewat {item.overdueDays} Hari
                      </span>
                    </td>
                    <td className="py-3 px-3 border-l border-border text-left align-middle max-w-[240px]">
                      <div className="truncate text-xs" title={item.deskripsi}>
                        <span className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">{item.deskripsi}</span>
                      </div>
                      <div className="mt-1 truncate">
                        <span className="text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-mono border border-purple-200">{item.grup} • {item.category}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 border-l border-border font-mono font-black text-emerald-700 text-base align-middle">
                      {item.qty.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 border-l border-border align-middle">
                      <div className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-muted text-foreground border border-border inline-block">
                        {item.statusCategory === 'SPJM' ? '🚛 Desak Trucking Port' :
                         item.statusCategory === 'HOLD' ? '📞 Eskalasi Vendor/Port' :
                         '⚓ Cek Sandar / Bea Cukai'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {activeOverdueFilterCol && (
          <ExcelFilterModal
            columnLabel={OVERDUE_FILTER_COLUMNS.find(c => c.key === activeOverdueFilterCol)?.label || activeOverdueFilterCol}
            uniqueValues={currentOverdueModalUniqueValues}
            searchInput={overdueModalSearchInput}
            onSearchInputChange={setOverdueModalSearchInput}
            isChecked={(val) => !overdueColFilters[activeOverdueFilterCol]?.selected?.length || overdueColFilters[activeOverdueFilterCol]?.selected?.includes(val)}
            onToggleValue={(val) => {
              const currentSel = overdueColFilters[activeOverdueFilterCol]?.selected?.length
                ? [...overdueColFilters[activeOverdueFilterCol].selected]
                : [...currentOverdueModalUniqueValues];
              const idxPos = currentSel.indexOf(val);
              if (idxPos > -1) currentSel.splice(idxPos, 1);
              else currentSel.push(val);
              handleApplyOverdueModalFilter(currentSel);
            }}
            onReset={() => {
              setOverdueColFilters(prev => {
                const copy = { ...prev };
                delete copy[activeOverdueFilterCol];
                return copy;
              });
              setActiveOverdueFilterCol(null);
              setOverdueModalSearchInput('');
              toast.success(`Filter kolom ${activeOverdueFilterCol} dibersihkan.`);
            }}
            onApply={() => handleApplyOverdueModalFilter(overdueColFilters[activeOverdueFilterCol]?.selected || [])}
            onClose={() => setActiveOverdueFilterCol(null)}
          />
        )}
      </GlassCard>

      {/* ─── TABEL DETAIL PR UPDATE & LIVE TRACKING CONTAINER (DENGAN EXCEL-STYLE COLUMN FILTER) — replaced by the filterable "Detail PR Update" table in the offline export section ─── */}
      {parsed && parsed.headers && (
        <GlassCard className="no-export p-6 border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <Globe className="w-5 h-5 text-sky-400" />
                  Tabel Detail PR & Live Tracking Container ({displayedDetailRows.length} dari {filtered.length} baris)
                </h3>
                {Object.keys(colFilters).some(k => colFilters[k]?.search || colFilters[k]?.selected?.length > 0) && (
                  <button
                    onClick={() => { setColFilters({}); toast.success('Semua filter kolom dibersihkan!'); }}
                    className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reset Filter Kolom
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Dilengkapi <b className="text-emerald-700">Filter Kolom ala Excel</b> (klik ikon filter di setiap header untuk cari & pilih data) dan kolom <b className="text-teal-700">Shipping Line / Pelayarań</b>.
              </p>
            </div>

            <button
              onClick={handleExport}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-sky-600/20 shrink-0"
            >
              <Download className="w-4 h-4" /> Ekspor Data 14 Kolom ({displayedDetailRows.length} baris)
            </button>
          </div>

          {/* ─── INSIGHT: KELENGKAPAN DOKUMEN PR → PO → PI → BL ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            {[
              { key: 'prBelumReleased', label: 'PR Belum Released', emoji: '📄', data: documentChainGaps.prBelumReleased,
                box: 'bg-indigo-50 border-indigo-200', title: 'text-indigo-800', rank: 'text-indigo-700/80', num: 'text-indigo-600' },
              { key: 'prNoPo', label: 'PR Belum Ada PO', emoji: '📄', data: documentChainGaps.prNoPo,
                box: 'bg-amber-50 border-amber-200', title: 'text-amber-800', rank: 'text-amber-700/80', num: 'text-amber-600' },
              { key: 'poNoPi', label: 'PO Belum Ada PI', emoji: '📋', data: documentChainGaps.poNoPi,
                box: 'bg-orange-50 border-orange-200', title: 'text-orange-800', rank: 'text-orange-700/80', num: 'text-orange-600' },
              { key: 'piNoBl', label: 'PI Belum Ada BL', emoji: '🧾', data: documentChainGaps.piNoBl,
                box: 'bg-rose-50 border-rose-200', title: 'text-rose-800', rank: 'text-rose-700/80', num: 'text-rose-600' },
              { key: 'prReady', label: 'PR Status READY', emoji: '✅', data: readyPrInsight,
                box: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-800', rank: 'text-emerald-700/80', num: 'text-emerald-600' },
              { key: 'onProcessOverdue', label: 'PR "On Process" Overdue ETA', emoji: '⏱️', data: onProcessOverdueInsight,
                box: 'bg-cyan-50 border-cyan-200', title: 'text-cyan-800', rank: 'text-cyan-700/80', num: 'text-cyan-600' },
            ].map(card => (
              <div key={card.key} className={`p-4 rounded-2xl border shadow-sm flex flex-col h-full ${card.box}`}>
                <div className={`text-[10px] sm:text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${card.title}`}>
                  <span>{card.emoji} {card.label}</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 mb-2">
                  {card.data.count} <span className="text-[10px] sm:text-xs font-semibold text-slate-600">Dokumen</span>
                </div>
                {card.data.topCabang.length > 0 && (
                  <div className={`mt-auto pt-2 border-t border-black/5 text-[11px] text-slate-700 font-semibold space-y-0.5`}>
                    <div className={`uppercase tracking-wider text-[9px] mb-1 ${card.rank}`}>Top 3 Cabang:</div>
                    {card.data.topCabang.map((b, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className={card.num}>{i + 1}.</span> <span className="truncate">{b.branch}</span> <span className="font-mono text-slate-500 ml-auto">({b.count})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Excel Filter Modal Popover */}
          {activeFilterModalCol && (
            <ExcelFilterModal
              columnLabel={activeFilterModalCol}
              uniqueValues={currentModalUniqueValues}
              searchInput={modalSearchInput}
              onSearchInputChange={setModalSearchInput}
              isChecked={(val) => !colFilters[activeFilterModalCol]?.selected?.length || colFilters[activeFilterModalCol]?.selected?.includes(val)}
              onToggleValue={(val) => {
                const currentSel = colFilters[activeFilterModalCol]?.selected?.length
                  ? [...colFilters[activeFilterModalCol].selected]
                  : [...currentModalUniqueValues];
                const idxPos = currentSel.indexOf(val);
                if (idxPos > -1) currentSel.splice(idxPos, 1);
                else currentSel.push(val);
                handleApplyModalFilter(currentSel);
              }}
              onReset={() => {
                setColFilters(prev => {
                  const copy = { ...prev };
                  delete copy[activeFilterModalCol];
                  return copy;
                });
                setActiveFilterModalCol(null);
                setModalSearchInput('');
                toast.success(`Filter kolom ${activeFilterModalCol} dibersihkan.`);
              }}
              onApply={() => handleApplyModalFilter(colFilters[activeFilterModalCol]?.selected || [])}
              onClose={() => setActiveFilterModalCol(null)}
            />
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[580px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1300px]">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 z-20 shadow-md">
                <tr className="border-b border-slate-200 text-[11px] tracking-wider text-center">
                  {parsed.headers.map((h) => {
                    const isFiltered = colFilters[h]?.search || (colFilters[h]?.selected && colFilters[h]?.selected.length > 0);
                    const isShippingLine = h.toLowerCase().includes('shipping') || h.toLowerCase().includes('carrier') || h.toLowerCase().includes('pelayaran');
                    const isContainer = h.toLowerCase().includes('container') || h.toLowerCase().includes('kontainer');
                    
                    return (
                      <th
                        key={h}
                        className={`py-3 px-3 border-l border-slate-200 whitespace-nowrap align-middle ${
                          isShippingLine ? 'text-teal-700 bg-teal-50' : isContainer ? 'text-sky-700 bg-sky-50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{h}</span>
                          <button
                            onClick={() => {
                              setActiveFilterModalCol(h);
                              setModalSearchInput(colFilters[h]?.search || '');
                            }}
                            className={`p-1 rounded transition ${
                              isFiltered ? 'bg-emerald-500 text-slate-900 shadow-sm ring-2 ring-emerald-400' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title={`Filter Kolom ala Excel: ${h}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {isFiltered && (
                          <div className="text-[9px] text-emerald-700 font-normal normal-case italic mt-0.5 truncate max-w-[100px]">
                            {colFilters[h]?.search ? `"${colFilters[h].search}"` : `Filteraktif`}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="py-3 px-4 border-l border-slate-200 text-sky-700 bg-sky-50 align-middle">🛰️ Action Track</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700 text-center font-medium">
                {displayedDetailRows.length === 0 ? (
                  <tr>
                    <td colSpan={parsed.headers.length + 1} className="py-12 text-center text-slate-600 font-medium">
                      Tidak ada baris yang cocok dengan kombinasi filter kolom aktif. <span className="text-rose-600 underline cursor-pointer" onClick={() => setColFilters({})}>Klik di sini untuk mereset filter</span>.
                    </td>
                  </tr>
                ) : displayedDetailRows.slice(0, 150).map((row, idx) => {
                  const contVal = colContainer ? String(row[colContainer] || '') : '';
                  const carrierVal = colCarrier ? String(row[colCarrier] || '') : '';
                  const hasCont = contVal && contVal.trim() !== '' && contVal.trim() !== '-' && contVal.trim() !== '0' && contVal.toUpperCase() !== 'N/A';
                  const trackInfo = hasCont ? getDirectTrackingUrl(contVal.trim(), carrierVal.trim()) : null;

                  return (
                    <tr key={idx} className="hover:bg-slate-100 transition">
                      {parsed.headers.map((h) => {
                        let val = row[h];
                        const isShippingLine = h.toLowerCase().includes('shipping') || h.toLowerCase().includes('carrier') || h.toLowerCase().includes('pelayaran') || h === colCarrier;
                        const isBl = h === colBl || h.toLowerCase().includes('bl') || h.toLowerCase().includes('lading') || h.toLowerCase().includes('booking');
                        const isDateCol = (h.toLowerCase().includes('eta') && !h.toLowerCase().includes('week')) || h.toLowerCase().includes('tanggal') || h.toLowerCase().includes('date') || h.toLowerCase().includes('tgl') || h.toLowerCase().includes('waktu');
                        
                        if (isDateCol && val != null && val !== '') {
                          const numVal = Number(val);
                          if (!isNaN(numVal) && numVal > 30000 && numVal < 70000) {
                            const d = new Date((numVal - 25569) * 86400 * 1000);
                            const days = String(d.getUTCDate()).padStart(2, '0');
                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                            const month = months[d.getUTCMonth()];
                            val = `${days} ${month} ${d.getUTCFullYear()}`;
                          }
                        } else if (colQty && h === colQty && val != null && val !== '') {
                          val = Math.round(Number(String(val).replace(/[^0-9.-]+/g, '')) || 0).toLocaleString('id-ID');
                        } else if (typeof val === 'number' && h !== colBl && h !== colContainer && h !== colPo && h !== colPr && !isBl && h !== colCabang && !isDateCol) {
                          val = val.toLocaleString('id-ID');
                        }
                        return (
                          <td
                            key={h}
                            className={`py-2.5 px-3 border-l border-slate-200 whitespace-nowrap ${
                              h === colContainer && hasCont ? 'font-mono font-bold text-sky-700' :
                              isShippingLine ? 'font-semibold text-teal-700' :
                              isBl ? 'font-mono text-purple-700 font-medium' :
                              h === colCabang || h.toLowerCase().includes('branch') || h.toLowerCase().includes('cabang') ? 'font-bold text-slate-800' : ''
                            }`}
                          >
                            {h === colContainer && hasCont && trackInfo && trackInfo.url ? (
                              <a href={trackInfo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline hover:text-slate-900 transition group font-bold" title={`Lacak ${val} di ${trackInfo.carrier}`}>
                                <span>{val}</span>
                                <ExternalLink className="w-3 h-3 text-sky-600 group-hover:text-slate-900 inline ml-0.5 shrink-0" />
                              </a>
                            ) : (val !== undefined && val !== null && val !== '' ? val : '-')}
                          </td>
                        );
                      })}
                      <td className="py-2 px-4 border-l border-slate-200 bg-slate-50 whitespace-nowrap">
                        {hasCont && trackInfo && trackInfo.url ? (
                          <a
                            href={trackInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-700 hover:text-slate-900 border border-sky-500/40 font-bold transition shadow-sm"
                            title={`Lacak ${contVal} via ${trackInfo.carrier}`}
                          >
                            <span>Lacak ({trackInfo.carrier.split(' ')[0]})</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Belum Ada Cont</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {displayedDetailRows.length > 150 && (
            <p className="text-xs text-slate-600 mt-4 italic text-center">
              * Menampilkan 150 baris pertama dari total {displayedDetailRows.length} dokumen pesanan yang tersaring...
            </p>
          )}
        </GlassCard>
      )}
      </div>
      )}

      {/* ─── LEAD TIME MODULE ─── */}
      {activeTab === 'lead_time' && leadTimeData && (
        <div className="space-y-8 animate-fade-in">
          <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
              <Timer className="w-6 h-6 text-indigo-600" /> Analisa Lead Time Aktual
            </h2>

            {/* Filters: Region, Cabang, Month ETA */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🌏 Filter Region:</label>
                <MultiSelect
                  options={ltRegions}
                  selected={selectedLtRegion}
                  onChange={setSelectedLtRegion}
                  selectAllLabel="Semua Region"
                  placeholder="Pilih Region..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🏢 Filter Cabang:</label>
                <MultiSelect
                  options={ltCabangs}
                  selected={selectedLtCabang}
                  onChange={setSelectedLtCabang}
                  selectAllLabel="Semua Cabang"
                  placeholder="Pilih Cabang..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📅 Filter Month ETA:</label>
                <MultiSelect
                  options={ltMonths}
                  selected={selectedLtMonth}
                  onChange={setSelectedLtMonth}
                  selectAllLabel="Semua Bulan"
                  placeholder="Pilih Month ETA..."
                />
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white border border-slate-200 p-6 rounded-xl flex items-center gap-4 shadow-md">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600"><Clock className="w-6 h-6"/></div>
                <div>
                  <div className="text-sm text-slate-500 font-bold tracking-wide">Avg Total Days (SPPB to Bongkar)</div>
                  <div className="text-3xl font-black text-slate-800 drop-shadow-sm">{leadTimeData.avgTotalDays} <span className="text-sm text-slate-500 font-normal">hari</span></div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-xl flex items-center gap-4 shadow-md">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600"><Truck className="w-6 h-6"/></div>
                <div>
                  <div className="text-sm text-slate-500 font-bold tracking-wide">Avg Days SPPB to ETA</div>
                  <div className="text-3xl font-black text-slate-800 drop-shadow-sm">{leadTimeData.avgSppbEtaDays} <span className="text-sm text-slate-500 font-normal">hari</span></div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-xl flex items-center gap-4 shadow-md">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600"><Package className="w-6 h-6"/></div>
                <div>
                  <div className="text-sm text-slate-500 font-bold tracking-wide">Avg Days ETA to Bongkar</div>
                  <div className="text-3xl font-black text-slate-800 drop-shadow-sm">{leadTimeData.avgBongkarDays} <span className="text-sm text-slate-500 font-normal">hari</span></div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-md">
                <h3 className="text-sm font-bold text-slate-800 mb-4">Tren History Lead Time (per Bulan)</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={leadTimeData.trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" stroke="#64748b" fontSize={12} fontWeight="bold" />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#1e293b' }} />
                      <Legend />
                      <Bar dataKey="avgDays" name="Avg Total Days" fill="#4f46e5" radius={[4,4,0,0]} barSize={40} />
                      <Line type="monotone" dataKey="avgSppbEta" name="Avg SPPB to ETA" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="avgBongkar" name="Avg ETA to Bongkar" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-md">
                <h3 className="text-sm font-bold text-slate-800 mb-4">Perbandingan Cabang (Avg Total Days)</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadTimeData.branchData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" stroke="#64748b" fontSize={12} />
                      <YAxis dataKey="branch" type="category" stroke="#64748b" fontSize={12} width={100} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#1e293b' }} />
                      <Bar dataKey="avgDays" name="Avg Total Days" fill="#10b981" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            {/* Top 10 Cabang: Total Days (Tunggu) Terlama & Tercepat */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              <div className="bg-white rounded-xl p-6 border border-rose-200 shadow-md">
                <h3 className="text-sm font-bold text-rose-600 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> 10 Cabang Total Days (Tunggu) Terlama
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="p-3 text-slate-700 font-semibold rounded-tl-lg">#</th>
                        <th className="p-3 text-slate-700 font-semibold">Cabang</th>
                        <th className="p-3 text-slate-700 font-semibold text-right rounded-tr-lg">Total Days (Tunggu)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadTimeData.topSlowestBranches.map((b: any, i: number) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-slate-400 font-mono text-xs">{i + 1}</td>
                          <td className="p-3 text-slate-900 font-medium">{b.branch}</td>
                          <td className="p-3 text-right font-bold text-rose-600">{b.avgDays} <span className="text-xs font-normal text-slate-400">Hari</span></td>
                        </tr>
                      ))}
                      {leadTimeData.topSlowestBranches.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-500 italic">Tidak ada data.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-emerald-200 shadow-md">
                <h3 className="text-sm font-bold text-emerald-600 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> 10 Cabang Total Days (Tunggu) Tercepat
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="p-3 text-slate-700 font-semibold rounded-tl-lg">#</th>
                        <th className="p-3 text-slate-700 font-semibold">Cabang</th>
                        <th className="p-3 text-slate-700 font-semibold text-right rounded-tr-lg">Total Days (Tunggu)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadTimeData.topFastestBranches.map((b: any, i: number) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-slate-400 font-mono text-xs">{i + 1}</td>
                          <td className="p-3 text-slate-900 font-medium">{b.branch}</td>
                          <td className="p-3 text-right font-bold text-emerald-600">{b.avgDays} <span className="text-xs font-normal text-slate-400">Hari</span></td>
                        </tr>
                      ))}
                      {leadTimeData.topFastestBranches.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-500 italic">Tidak ada data.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
          </GlassCard>
        </div>
      )}
      
      {activeTab === 'lead_time' && !leadTimeData && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] bg-muted/50 rounded-2xl border border-border text-muted-foreground p-8 text-center">
          <Timer className="w-12 h-12 text-muted-foreground/70 mb-4" />
          <h3 className="text-lg font-bold text-foreground">Data Lead Time Tidak Ditemukan</h3>
          <p className="text-sm mt-2 max-w-md">Sheet &quot;Lead Time&quot; tidak ditemukan di dalam file Excel yang diunggah. Pastikan Anda mengunggah file Excel terbaru menggunakan format template yang baru.</p>
        </div>
      )}
    </div>
  );
}

