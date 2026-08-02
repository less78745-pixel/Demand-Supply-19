"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  Anchor, Plus, Download, Upload, Search, ChevronDown, ChevronRight,
  ExternalLink, Edit, Trash2, CheckCircle2, AlertTriangle, Clock,
  Box, Navigation, HelpCircle, Filter, Ship, Copy, RefreshCw, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { get, set } from 'idb-keyval';

/* ─── Carrier Catalogue ─── */
const CARRIERS = [
  { name: "Maersk", url: "https://www.maersk.com/tracking/" },
  { name: "MSC", url: "https://www.msc.com/en/track-a-shipment" },
  { name: "CMA CGM", url: "https://www.cma-cgm.com/ebusiness/tracking" },
  { name: "ONE (Ocean Network Express)", url: "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking" },
  { name: "Evergreen Line", url: "https://www.evergreen-line.com/emodal/Cargo/CargoTrackingDetail" },
  { name: "Hapag-Lloyd", url: "https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html" },
  { name: "COSCO Shipping", url: "https://elines.coscoshipping.com/ebusiness/cargoTracking" },
  { name: "Yang Ming", url: "https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx" },
  { name: "HMM", url: "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.jsp" },
  { name: "ZIM", url: "https://www.zim.com/tools/track-a-shipment" },
  { name: "OOCL", url: "https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx" },
  { name: "PIL (Pacific Int'l Lines)", url: "https://www.pilship.com/cargo-tracking" },
  { name: "Wan Hai Lines", url: "https://www.wanhai.com/views/Cargo_Tracking/CargoTracking.xhtml" },
  { name: "Meratus Line", url: "https://www.meratus.com/" },
  { name: "Samudera Indonesia", url: "https://www.samudera.com/" },
  { name: "SPIL (Salam Pacific Indonesia Lines)", url: "https://www.spil.co.id/" },
  { name: "Temas Line", url: "https://www.temasline.com/" },
  { name: "SeaRates (agregator)", url: "https://www.searates.com/container/tracking/?shipment-type=sea" },
  { name: "FindTEU (agregator)", url: "https://www.findteu.com/" },
  { name: "Lainnya / Custom", url: "" }
];

const STATUS_LIST = [
  "Sedang Berlayar",
  "Estimasi Delay",
  "Tiba di Pelabuhan",
  "Selesai/Diambil",
  "Belum Ada Info"
];

interface ContainerItem {
  id: string;
  no: string;
  bl: string;
  carrier: string;
  cabang: string;
  status: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  notes: string;
  lastChecked: string;
}

/* ─── Default Sample Data ─── */
const DEFAULT_CONTAINERS: ContainerItem[] = [
  {
    id: 'c-101',
    no: 'MRTU1234567',
    bl: 'BL-MRT-00912',
    carrier: 'Meratus Line',
    cabang: 'Surabaya',
    status: 'Sedang Berlayar',
    pol: 'Tanjung Priok, Jakarta',
    pod: 'Tanjung Perak, Surabaya',
    etd: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
    eta: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    notes: 'Prioritas bongkar untuk restock Gudang R3',
    lastChecked: new Date().toISOString().slice(0, 10),
  },
  {
    id: 'c-102',
    no: 'TEMU7654321',
    bl: 'BL-TMS-88231',
    carrier: 'Temas Line',
    cabang: 'Makassar',
    status: 'Estimasi Delay',
    pol: 'Tanjung Perak, Surabaya',
    pod: 'Soekarno Hatta, Makassar',
    etd: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    eta: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
    notes: 'Keterlambatan bersandar karena antrean pelabuhan',
    lastChecked: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10),
  },
  {
    id: 'c-103',
    no: 'SPIL8899001',
    bl: 'BL-SPL-44321',
    carrier: 'SPIL (Salam Pacific Indonesia Lines)',
    cabang: 'Medan',
    status: 'Tiba di Pelabuhan',
    pol: 'Tanjung Priok, Jakarta',
    pod: 'Belawan, Medan',
    etd: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
    eta: new Date().toISOString().slice(0, 10),
    notes: 'Proses clearance kontainer & persiapan trucking',
    lastChecked: new Date().toISOString().slice(0, 10),
  },
];

/* ─── Helpers ─── */
function uid(): string {
  return 'c' + Date.now() + Math.random().toString(36).substring(2, 7);
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}
function fmtDate(d?: string): string {
  if (!d) return "-";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function isOverdue(c: ContainerItem): boolean {
  if (!c.eta) return false;
  if (c.status === "Tiba di Pelabuhan" || c.status === "Selesai/Diambil") return false;
  return daysBetween(todayISO(), c.eta) < 0;
}
function lastCheckedClass(c: ContainerItem): "fresh" | "warn" | "stale" {
  if (!c.lastChecked) return "stale";
  const d = daysBetween(c.lastChecked, todayISO());
  if (d <= 1) return "fresh";
  if (d <= 3) return "warn";
  return "stale";
}
function lastCheckedLabel(c: ContainerItem): string {
  if (!c.lastChecked) return "Belum pernah dicek";
  const d = daysBetween(c.lastChecked, todayISO());
  if (d <= 0) return "Dicek hari ini";
  if (d === 1) return "Dicek kemarin";
  return `Dicek ${d} hari lalu`;
}
function getStatusStyle(status: string): string {
  switch (status) {
    case "Sedang Berlayar":
      return "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
    case "Estimasi Delay":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold";
    case "Tiba di Pelabuhan":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold";
    case "Selesai/Diambil":
      return "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export default function TrackingContainerPage() {
  const [containers, setContainers] = useState<ContainerItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter States
  const [filterCabang, setFilterCabang] = useState<string>("");
  const [filterCarrier, setFilterCarrier] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [groupByCabang, setGroupByCabang] = useState<boolean>(true);

  // UI States
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Field States
  const [fldNo, setFldNo] = useState("");
  const [fldBl, setFldBl] = useState("");
  const [fldCarrier, setFldCarrier] = useState(CARRIERS[0].name);
  const [fldCarrierCustom, setFldCarrierCustom] = useState("");
  const [fldCabang, setFldCabang] = useState("");
  const [fldStatus, setFldStatus] = useState("Sedang Berlayar");
  const [fldPol, setFldPol] = useState("");
  const [fldPod, setFldPod] = useState("");
  const [fldEtd, setFldEtd] = useState("");
  const [fldEta, setFldEta] = useState("");
  const [fldNotes, setFldNotes] = useState("");

  // Bulk Textarea
  const [bulkText, setBulkText] = useState("");

  /* ─── Load Data ─── */
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        let saved: any = null;
        try {
          saved = await get('last_tracking_containers_v2');
        } catch { /* fallback */ }
        
        if (!saved && typeof window !== 'undefined') {
          const raw = localStorage.getItem('last_tracking_containers');
          if (raw) saved = JSON.parse(raw);
        }

        if (saved && saved.containers && Array.isArray(saved.containers) && saved.containers.length > 0) {
          setContainers(saved.containers);
          setLastUpdated(saved.processed_at || null);
        } else {
          // Initialize default sample data
          setContainers(DEFAULT_CONTAINERS);
          setLastUpdated(new Date().toISOString());
          saveToStorage(DEFAULT_CONTAINERS);
        }
      } catch (e) {
        console.error("Error loading containers data:", e);
        setContainers(DEFAULT_CONTAINERS);
      } finally {
        setIsLoading(false);
      }
    };
    loadSavedData();
  }, []);

  const saveToStorage = async (list: ContainerItem[]) => {
    const now = new Date().toISOString();
    const payload = {
      processed_at: now,
      containers: list,
    };
    setLastUpdated(now);
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_tracking_containers', JSON.stringify(payload));
    }
    try {
      await set('last_tracking_containers_v2', payload);
    } catch (e) {
      console.warn("Failed saving to IndexDB:", e);
    }
  };

  /* ─── Stats Calculation ─── */
  const stats = useMemo(() => {
    const total = containers.length;
    const transit = containers.filter(c => c.status === "Sedang Berlayar").length;
    const delay = containers.filter(c => c.status === "Estimasi Delay" || isOverdue(c)).length;
    const arrived = containers.filter(c => c.status === "Tiba di Pelabuhan" || c.status === "Selesai/Diambil").length;
    const stale = containers.filter(c => lastCheckedClass(c) === "stale").length;
    return { total, transit, delay, arrived, stale };
  }, [containers]);

  /* ─── Dynamic Dropdown Options ─── */
  const allCabangOptions = useMemo(() => {
    return Array.from(new Set(containers.map(c => c.cabang).filter(Boolean))).sort();
  }, [containers]);

  const allCarrierOptions = useMemo(() => {
    return Array.from(new Set(containers.map(c => c.carrier).filter(Boolean))).sort();
  }, [containers]);

  /* ─── Filtered Containers ─── */
  const filteredContainers = useMemo(() => {
    return containers.filter(c => {
      if (filterCabang && c.cabang !== filterCabang) return false;
      if (filterCarrier && c.carrier !== filterCarrier) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (searchQuery) {
        const hay = `${c.no} ${c.bl} ${c.notes || ""} ${c.cabang} ${c.carrier}`.toLowerCase();
        if (!hay.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      if (!a.eta && !b.eta) return 0;
      if (!a.eta) return 1;
      if (!b.eta) return -1;
      return new Date(a.eta).getTime() - new Date(b.eta).getTime();
    });
  }, [containers, filterCabang, filterCarrier, filterStatus, searchQuery]);

  /* ─── Grouped by Cabang ─── */
  const groupedContainers = useMemo(() => {
    const groups: Record<string, ContainerItem[]> = {};
    filteredContainers.forEach(c => {
      const key = c.cabang || "Tanpa Cabang";
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filteredContainers]);

  /* ─── Handlers ─── */
  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleOpenCarrier = async (c: ContainerItem) => {
    try {
      await navigator.clipboard.writeText(c.no);
      toast.success(`No. kontainer "${c.no}" disalin! Tinggal tempel di kolom pencarian ${c.carrier}.`, {
        duration: 3500,
        icon: '📋',
      });
    } catch (err) {
      toast.error("Membuka situs pelayaran — salin nomor kontainer secara manual.");
    }
    const carrierInfo = CARRIERS.find(x => x.name === c.carrier);
    const url = (carrierInfo && carrierInfo.url) ? carrierInfo.url : "https://www.searates.com/container/tracking/?shipment-type=sea";
    window.open(url, '_blank');

    // Update last checked to today
    const updated = containers.map(item => item.id === c.id ? { ...item, lastChecked: todayISO() } : item);
    setContainers(updated);
    saveToStorage(updated);
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    const updated = containers.map(c => c.id === id ? { ...c, status: newStatus } : c);
    setContainers(updated);
    saveToStorage(updated);
    toast.success("Status kontainer berhasil diperbarui.");
  };

  const handleDelete = (id: string, no: string) => {
    if (window.confirm(`Yakin ingin Menghapus data kontainer ${no}?`)) {
      const updated = containers.filter(c => c.id !== id);
      setContainers(updated);
      saveToStorage(updated);
      toast.success(`Kontainer ${no} berhasil dihapus.`);
    }
  };

  /* ─── Form Open/Reset ─── */
  const openFormModal = (c: ContainerItem | null) => {
    setEditingId(c ? c.id : null);
    setFldNo(c ? c.no : "");
    setFldBl(c ? c.bl : "");
    
    if (c) {
      const isKnownCarrier = CARRIERS.some(x => x.name === c.carrier);
      if (isKnownCarrier) {
        setFldCarrier(c.carrier);
        setFldCarrierCustom("");
      } else {
        setFldCarrier("Lainnya / Custom");
        setFldCarrierCustom(c.carrier);
      }
    } else {
      setFldCarrier(CARRIERS[0].name);
      setFldCarrierCustom("");
    }

    setFldCabang(c ? c.cabang : "");
    setFldStatus(c ? c.status : "Sedang Berlayar");
    setFldPol(c ? c.pol : "");
    setFldPod(c ? c.pod : "");
    setFldEtd(c ? c.etd : "");
    setFldEta(c ? c.eta : "");
    setFldNotes(c ? (c.notes || "") : "");
    setIsFormOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNo = fldNo.trim().toUpperCase();
    const cleanCabang = fldCabang.trim();

    if (!cleanNo) {
      toast.error("No. Kontainer wajib diisi.");
      return;
    }
    if (!cleanCabang) {
      toast.error("Cabang tujuan wajib diisi.");
      return;
    }

    let finalCarrier = fldCarrier;
    if (finalCarrier === "Lainnya / Custom") {
      finalCarrier = fldCarrierCustom.trim() || "Lainnya";
    }

    const itemData = {
      no: cleanNo,
      bl: fldBl.trim(),
      carrier: finalCarrier,
      cabang: cleanCabang,
      status: fldStatus,
      pol: fldPol.trim(),
      pod: fldPod.trim(),
      etd: fldEtd,
      eta: fldEta,
      notes: fldNotes.trim(),
    };

    let updated: ContainerItem[];
    if (editingId) {
      updated = containers.map(c => c.id === editingId ? { ...c, ...itemData } : c);
      toast.success("Data kontainer berhasil diperbarui.");
    } else {
      updated = [...containers, { id: uid(), lastChecked: "", ...itemData }];
      toast.success("Kontainer baru berhasil ditambahkan.");
    }

    setContainers(updated);
    saveToStorage(updated);
    setIsFormOpen(false);
  };

  const handleSaveBulk = () => {
    const text = bulkText.trim();
    if (!text) {
      toast.error("Belum ada teks data untuk diimpor.");
      return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let added = 0;
    let skipped = 0;
    const newItems: ContainerItem[] = [];

    lines.forEach(line => {
      const parts = line.split(',').map(p => p.trim());
      const [no, carrier, cabang, eta, status] = parts;
      if (!no || !cabang) {
        skipped++;
        return;
      }
      newItems.push({
        id: uid() + Math.random().toString(36).substring(2, 5),
        no: no.toUpperCase(),
        bl: "",
        carrier: carrier || "Lainnya",
        cabang: cabang,
        status: STATUS_LIST.includes(status) ? status : "Sedang Berlayar",
        pol: "",
        pod: "",
        etd: "",
        eta: eta && /^\d{4}-\d{2}-\d{2}$/.test(eta) ? eta : "",
        notes: "",
        lastChecked: "",
      });
      added++;
    });

    if (added === 0) {
      toast.error("Format tidak valid atau tidak ada data yang bisa diimpor.");
      return;
    }

    const updated = [...containers, ...newItems];
    setContainers(updated);
    saveToStorage(updated);
    setBulkText("");
    setIsBulkOpen(false);
    toast.success(`${added} kontainer berhasil ditambahkan${skipped ? `, ${skipped} baris dilewati (format tidak lengkap)` : ""}.`);
  };

  const handleExportCSV = () => {
    if (containers.length === 0) {
      toast.error("Belum ada data kontainer untuk diekspor.");
      return;
    }
    const header = ["No Kontainer", "No BL/Booking", "Pelayaran", "Cabang", "POL", "POD", "ETD", "ETA", "Status", "Terakhir Dicek", "Catatan"];
    const rows = containers.map(c => [
      c.no, c.bl, c.carrier, c.cabang, c.pol, c.pod, c.etd, c.eta, c.status, c.lastChecked, c.notes
    ].map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(','));

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kontainer-tracking-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("File CSV berhasil diunduh!");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted-foreground animate-pulse">Memuat Menara Kendali Kontainer...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1550px] mx-auto pb-12 animate-in fade-in duration-500">
      
      {/* ═══ COMMAND TOWER HEADER BANNER ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0F2A3D] via-[#163C52] to-[#112E43] border border-cyan-500/30 p-6 shadow-xl text-white">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-gradient-to-bl from-amber-500/20 via-cyan-500/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black tracking-tight flex items-center gap-2">
                🗼 Menara Kendali Kontainer
              </span>
              <TimestampBadge timestamp={lastUpdated} label="Terakhir Diperbarui" className="bg-white/10 text-cyan-200 border-white/15 py-1 px-2.5" />
            </div>
            <p className="text-sm text-cyan-100/80 max-w-2xl mt-2 leading-relaxed">
              Semua kontainer, semua cabang, dalam satu layar pemantauan terpusat. Klik <b>&ldquo;Buka & Salin&rdquo;</b> untuk langsung menavigasi ke portal resmi pelayaran dengan nomor kontainer siap di tempel.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 items-center shrink-0">
            <button
              onClick={() => setIsBulkOpen(true)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl border border-white/20 transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
            >
              <Upload className="w-4 h-4 text-cyan-300" /> Impor Massal
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl border border-white/20 transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
            >
              <Download className="w-4 h-4 text-cyan-300" /> Ekspor CSV
            </button>
            <button
              onClick={() => openFormModal(null)}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-lg hover:shadow-amber-500/20 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" /> Tambah Kontainer
            </button>
          </div>
        </div>

        {/* ═══ STATS STRIP ═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between hover:bg-white/10 transition">
            <span className="text-[11px] text-cyan-200/70 font-bold uppercase tracking-wider">Total Kontainer</span>
            <span className="text-3xl font-black text-white font-mono mt-1">{stats.total}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between hover:bg-white/10 transition">
            <span className="text-[11px] text-cyan-300/80 font-bold uppercase tracking-wider">Sedang Berlayar</span>
            <span className="text-3xl font-black text-cyan-300 font-mono mt-1">{stats.transit}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between hover:bg-white/10 transition">
            <span className="text-[11px] text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1">
              Delay / Lewat ETA {stats.delay > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
            </span>
            <span className="text-3xl font-black text-amber-400 font-mono mt-1">{stats.delay}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between hover:bg-white/10 transition">
            <span className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider">Tiba / Selesai</span>
            <span className="text-3xl font-black text-emerald-400 font-mono mt-1">{stats.arrived}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between hover:bg-white/10 transition col-span-2 sm:col-span-1">
            <span className="text-[11px] text-rose-300 font-bold uppercase tracking-wider flex items-center gap-1">
              Belum Dicek 3+ Hari {stats.stale > 0 && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />}
            </span>
            <span className="text-3xl font-black text-rose-400 font-mono mt-1">{stats.stale}</span>
          </div>
        </div>
      </div>

      {/* ═══ FILTER BAR ═══ */}
      <GlassCard className="py-3 px-4 flex flex-wrap gap-3 items-center border border-border bg-card/60 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
          <Filter className="w-4 h-4 text-primary" /> Filter:
        </div>

        <select
          value={filterCabang}
          onChange={(e) => setFilterCabang(e.target.value)}
          className="text-xs px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
        >
          <option value="">Semua Cabang</option>
          {allCabangOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filterCarrier}
          onChange={(e) => setFilterCarrier(e.target.value)}
          className="text-xs px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-w-[150px]"
        >
          <option value="">Semua Pelayaran</option>
          {allCarrierOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
        >
          <option value="">Semua Status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari no. kontainer / BL / catatan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground select-none ml-2 border-l border-border pl-3">
          <input
            type="checkbox"
            checked={groupByCabang}
            onChange={(e) => setGroupByCabang(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
          />
          Kelompokkan per cabang
        </label>
      </GlassCard>

      {/* ═══ CONTENT SECTION ═══ */}
      {containers.length === 0 ? (
        <div className="text-center py-16 px-4 bg-card/40 border border-dashed border-border rounded-2xl">
          <Ship className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="text-lg font-bold text-foreground mb-1">Belum Ada Data Kontainer</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Mulai kelola pemantauan kapal dan pengiriman barang ke cabang Anda dengan menambah kontainer baru atau mengimpor data massal dari file excel/csv Anda.
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={() => setIsBulkOpen(true)} className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl transition flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-primary" /> Impor Massal
            </button>
            <button onClick={() => openFormModal(null)} className="px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-xl transition shadow-md hover:opacity-90 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Tambah Kontainer Pertama
            </button>
          </div>
        </div>
      ) : filteredContainers.length === 0 ? (
        <div className="text-center py-12 bg-card/30 border border-border rounded-2xl">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-60" />
          <h3 className="text-base font-bold text-foreground">Tidak Ada Hasil Yang Sesuai</h3>
          <p className="text-xs text-muted-foreground mb-4">Coba sesuaikan kombinasi filter atau kata kunci pencarian Anda.</p>
          <button
            onClick={() => { setFilterCabang(""); setFilterCarrier(""); setFilterStatus(""); setSearchQuery(""); }}
            className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-semibold transition"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {!groupByCabang ? (
            /* FLAT LIST VIEW */
            <div className="grid gap-3">
              {filteredContainers.map(c => <ContainerRow key={c.id} item={c} onOpen={handleOpenCarrier} onEdit={() => openFormModal(c)} onDelete={() => handleDelete(c.id, c.no)} onStatusChange={handleStatusChange} />)}
            </div>
          ) : (
            /* GROUPED BY CABANG VIEW */
            Object.keys(groupedContainers).sort().map(branch => {
              const items = groupedContainers[branch];
              const isCollapsed = collapsedGroups[branch] ?? false;
              const attentionCount = items.filter(c => isOverdue(c) || c.status === "Estimasi Delay").length;

              return (
                <div key={branch} className="space-y-2.5">
                  <div
                    onClick={() => toggleGroup(branch)}
                    className="flex items-center gap-3 px-3 py-2 bg-muted/40 hover:bg-muted/70 rounded-xl cursor-pointer select-none transition-colors border border-border/50"
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-primary shrink-0" /> : <ChevronDown className="w-4 h-4 text-primary shrink-0" />}
                    <h3 className="font-bold text-sm tracking-wide text-foreground uppercase">{branch}</h3>
                    <span className="bg-primary/15 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold">
                      {items.length} kontainer
                    </span>
                    {attentionCount > 0 && (
                      <span className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {attentionCount} perlu perhatian
                      </span>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div className="grid gap-2.5 pl-2">
                      {items.map(c => (
                        <ContainerRow
                          key={c.id}
                          item={c}
                          onOpen={handleOpenCarrier}
                          onEdit={() => openFormModal(c)}
                          onDelete={() => handleDelete(c.id, c.no)}
                          onStatusChange={handleStatusChange}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══ ADD / EDIT CONTAINER MODAL ═══ */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl p-6 relative">
            <button onClick={() => setIsFormOpen(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-foreground mb-1">
              {editingId ? "Edit Data Kontainer" : "Tambah Kontainer Baru"}
            </h2>
            <p className="text-xs text-muted-foreground mb-5">
              Lengkapi informasi pelayaran kontainer di bawah ini. Field bertanda (<span className="text-rose-500 font-bold">*</span>) wajib diisi.
            </p>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">No. Kontainer <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="MRTU1234567"
                    value={fldNo}
                    onChange={(e) => setFldNo(e.target.value.toUpperCase())}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg font-mono font-bold uppercase focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">No. BL / Booking</label>
                  <input
                    type="text"
                    placeholder="BL-00123"
                    value={fldBl}
                    onChange={(e) => setFldBl(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Pelayaran <span className="text-rose-500">*</span></label>
                  <select
                    value={fldCarrier}
                    onChange={(e) => setFldCarrier(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-semibold"
                  >
                    {CARRIERS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                {fldCarrier === "Lainnya / Custom" && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Nama Pelayaran Lainnya <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="Masukkan nama shipping line..."
                      value={fldCarrierCustom}
                      onChange={(e) => setFldCarrierCustom(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Cabang Tujuan <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    list="cabangSuggestions"
                    placeholder="cth: Surabaya, Makassar, Medan"
                    value={fldCabang}
                    onChange={(e) => setFldCabang(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-semibold"
                  />
                  <datalist id="cabangSuggestions">
                    {allCabangOptions.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Status Pengiriman</label>
                  <select
                    value={fldStatus}
                    onChange={(e) => setFldStatus(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-semibold"
                  >
                    {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Pelabuhan Muat (POL)</label>
                  <input
                    type="text"
                    placeholder="cth: Tanjung Priok, Jakarta"
                    value={fldPol}
                    onChange={(e) => setFldPol(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Pelabuhan Bongkar (POD)</label>
                  <input
                    type="text"
                    placeholder="cth: Tanjung Perak, Surabaya"
                    value={fldPod}
                    onChange={(e) => setFldPod(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">ETD (Estimated Time Departure)</label>
                  <input
                    type="date"
                    value={fldEtd}
                    onChange={(e) => setFldEtd(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">ETA (Estimated Time Arrival)</label>
                  <input
                    type="date"
                    value={fldEta}
                    onChange={(e) => setFldEta(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  placeholder="Catatan mengenai pengiriman, bongkaran kargo, atau prioritas stok..."
                  value={fldNotes}
                  onChange={(e) => setFldNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-md hover:opacity-90 transition active:scale-95"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ BULK IMPORT MODAL ═══ */}
      {isBulkOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
            <button onClick={() => setIsBulkOpen(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-foreground mb-1">Impor Massal Kontainer</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Tempel (paste) daftar kontainer sekaligus dari Excel atau teks CSV. Satu baris mewakili satu kontainer, dipisahkan oleh koma (<span className="font-mono font-bold">,</span>).
            </p>

            <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl mb-4 text-xs text-cyan-600 dark:text-cyan-300">
              <div className="font-bold mb-1 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> Format urutan tiap baris:
              </div>
              <code className="block font-mono bg-background/60 p-1.5 rounded border border-border mt-1 text-[11px] text-foreground font-bold">
                no_kontainer, pelayaran, cabang, eta(YYYY-MM-DD), status(opsional)
              </code>
              <div className="text-[11px] mt-2 text-muted-foreground">
                <b>Contoh:</b><br />
                <span className="font-mono text-foreground">MRTU1234567, Meratus Line, Surabaya, 2026-08-05, Sedang Berlayar</span><br />
                <span className="font-mono text-foreground">TEMU7654321, Temas Line, Makassar, 2026-08-10, Estimasi Delay</span>
              </div>
            </div>

            <textarea
              rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="MRTU1234567, Meratus Line, Surabaya, 2026-08-05&#10;TEMU7654321, Temas Line, Makassar, 2026-08-10, Estimasi Delay"
              className="w-full text-xs font-mono p-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary mb-4 resize-y"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsBulkOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveBulk}
                className="px-5 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-md hover:opacity-90 transition active:scale-95 flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" /> Proses Impor
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ═══ INDIVIDUAL ROW COMPONENT ═══ */
function ContainerRow({
  item,
  onOpen,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  item: ContainerItem;
  onOpen: (item: ContainerItem) => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (id: string, st: string) => void;
}) {
  const overdue = isOverdue(item);
  const checkedClass = lastCheckedClass(item);
  const daysDiff = daysBetween(todayISO(), item.eta);

  return (
    <div
      className={`relative grid grid-cols-1 md:grid-cols-[1.5fr_1.3fr_1.3fr_1.2fr_auto] gap-4 items-center p-4 rounded-xl border transition-all duration-200 ${
        overdue
          ? 'border-rose-500/50 bg-gradient-to-r from-rose-500/10 via-card to-card shadow-sm'
          : 'border-border bg-card hover:border-primary/40 shadow-sm'
      }`}
    >
      {/* Column 1: Container No, BL & Carrier */}
      <div className="space-y-1.5">
        <div>
          <span className="font-mono font-bold text-base tracking-wide text-foreground flex items-center gap-2">
            {item.no}
          </span>
          {item.bl && (
            <span className="block text-xs text-muted-foreground font-mono">
              BL/Booking: <span className="text-foreground font-medium">{item.bl}</span>
            </span>
          )}
        </div>
        <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wider uppercase bg-primary/15 text-primary border border-primary/25">
          {item.carrier}
        </span>
      </div>

      {/* Column 2: Route & Branch */}
      <div className="text-xs space-y-1">
        <div className="text-muted-foreground flex items-center gap-1">
          <span>{item.pol || '?'}</span>
          <span className="font-bold text-primary">&rarr;</span>
          <span>{item.pod || '?'}</span>
        </div>
        <div className="text-foreground">
          Cabang: <span className="font-bold text-primary">{item.cabang || '-'}</span>
        </div>
        {item.notes && (
          <p className="text-[11px] text-muted-foreground italic truncate max-w-[240px] pt-0.5" title={item.notes}>
            &ldquo;{item.notes}&rdquo;
          </p>
        )}
      </div>

      {/* Column 3: ETD & ETA */}
      <div className="text-xs space-y-1 font-medium">
        <div className="text-muted-foreground">
          ETD: <span className="font-mono text-foreground font-semibold">{fmtDate(item.etd)}</span>
        </div>
        <div className="text-muted-foreground">
          ETA: <span className="font-mono text-foreground font-bold">{fmtDate(item.eta)}</span>
        </div>
        {overdue ? (
          <div className="text-rose-500 dark:text-rose-400 font-extrabold text-[11px] flex items-center gap-1 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> Lewat ETA {Math.abs(daysDiff)} hari!
          </div>
        ) : item.eta && item.status !== "Tiba di Pelabuhan" && item.status !== "Selesai/Diambil" ? (
          <div className="text-[11px] text-emerald-500 font-medium">
            {daysDiff === 0 ? "Hari ini diprakirakan tiba" : `Tiba dalam ${daysDiff} hari ke depan`}
          </div>
        ) : null}
      </div>

      {/* Column 4: Status Selector & Last Checked */}
      <div className="space-y-2 flex flex-col items-start md:items-stretch">
        <select
          value={item.status}
          onChange={(e) => onStatusChange(item.id, e.target.value)}
          className={`text-xs px-2.5 py-1 rounded-lg border font-bold cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-primary ${getStatusStyle(item.status)}`}
        >
          {STATUS_LIST.map(s => <option key={s} value={s} className="bg-card text-foreground font-normal">{s}</option>)}
        </select>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
          <span className={`w-2 h-2 rounded-full ${
            checkedClass === 'fresh' ? 'bg-emerald-500' : checkedClass === 'warn' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500 animate-bounce'
          }`} />
          <span>{lastCheckedLabel(item)}</span>
        </div>
      </div>

      {/* Column 5: Action Buttons */}
      <div className="flex flex-row md:flex-col gap-1.5 justify-end items-stretch sm:items-end">
        <button
          onClick={() => onOpen(item)}
          className="px-3 py-1.5 bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap active:scale-95 border border-primary/30"
          title="Salin No Kontainer & Buka Situs Pelayaran"
        >
          <Copy className="w-3.5 h-3.5" /> Buka & Salin No.
        </button>
        <div className="flex gap-1 justify-end">
          <button
            onClick={onEdit}
            className="flex-1 md:flex-none px-2.5 py-1 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-md text-[11px] font-semibold transition flex items-center justify-center gap-1"
            title="Edit Data Kontainer"
          >
            <Edit className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={onDelete}
            className="flex-1 md:flex-none px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500 text-rose-600 dark:text-rose-400 hover:text-white rounded-md text-[11px] font-semibold transition flex items-center justify-center gap-1"
            title="Hapus Kontainer"
          >
            <Trash2 className="w-3 h-3" /> Hapus
          </button>
        </div>
      </div>
    </div>
  );
}
