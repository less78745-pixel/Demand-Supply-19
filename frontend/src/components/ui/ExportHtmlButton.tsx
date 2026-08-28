"use client";

import React, { useState } from 'react';
import { FileCode, FileArchive } from 'lucide-react';
import { getHtmlExportString, downloadHtml, downloadBlob } from '@/utils/exportHtml';
import { buildOfflineExportHtml, ModuleExportConfig } from '@/utils/offlineExport';
import { getStandardFilename } from '@/utils/export';
import { exportDualFormat } from '@/lib/api';
import toast from 'react-hot-toast';

interface ExportHtmlButtonProps {
  /** Legacy mode: plain DOM-snapshot with a text-search box only. */
  elementId?: string;
  /** Preferred mode: data-driven export with real, working dropdown filters. */
  config?: ModuleExportConfig;
  moduleName: string;
  processedAt?: string;
  className?: string;
  label?: string;
  /**
   * Filter cabang yang sedang aktif di halaman (mis. dari MultiSelect cabang).
   * Sertakan bersama `resultId` atau `rawRows` untuk mengaktifkan mode
   * dual-export (HTML + Excel raw data terfilter cabang, dibundel .zip).
   * Tanpa keduanya, tombol tetap berjalan seperti sebelumnya (HTML saja).
   */
  cabang?: string[];
  /** Id baris `processed_results` di Supabase — backend fetch ulang & filter cabang di server. */
  resultId?: number;
  /** Raw rows yang sudah diparse di client (untuk modul tanpa hasil tersimpan di DB). */
  rawRows?: Record<string, unknown>[];
  /** Key di result_json yang berisi array baris data (hanya relevan bila pakai resultId). */
  dataKey?: string;
  /** Override nama kolom cabang pada rawRows, kalau auto-detect di backend tidak cocok. */
  cabangField?: string;
}

export function ExportHtmlButton({
  elementId,
  config,
  moduleName,
  processedAt,
  className = '',
  label = 'Export',
  cabang,
  resultId,
  rawRows,
  dataKey,
  cabangField,
}: ExportHtmlButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const isDualMode = resultId !== undefined || (rawRows?.length ?? 0) > 0;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      toast.loading(
        isDualMode ? 'Menyiapkan file Export (HTML + Excel)...' : 'Menyiapkan file HTML...',
        { id: 'export-html' }
      );

      // Delay sedikit agar loading toast sempat muncul dan rendering stabil
      await new Promise(r => setTimeout(r, 500));

      const htmlString = config ? buildOfflineExportHtml(config) : getHtmlExportString(elementId!);

      if (!isDualMode) {
        const filename = getStandardFilename(moduleName, processedAt, 'html');
        downloadHtml(htmlString, filename);
        toast.success('File HTML berhasil diunduh!', { id: 'export-html' });
        return;
      }

      const baseFilename = getStandardFilename(moduleName, processedAt);
      const zipBlob = await exportDualFormat({
        moduleName,
        processedAt,
        cabang: cabang && cabang.length > 0 ? cabang : ['All'],
        htmlContent: htmlString,
        baseFilename,
        resultId,
        rows: rawRows,
        dataKey,
        cabangField,
      });
      downloadBlob(zipBlob, `${baseFilename}.zip`);
      toast.success('File Export (HTML + Excel) berhasil diunduh!', { id: 'export-html' });
    } catch (err: any) {
      toast.error('Gagal mengekspor: ' + (err.message || 'Error tidak diketahui'), { id: 'export-html' });
      console.error("Export Error", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all no-export
        ${isExporting
          ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white hover:-translate-y-0.5 border border-emerald-400'
        } ${className}`}
      title={
        isDualMode
          ? 'Unduh HTML laporan + Excel raw data (terfilter cabang) dalam satu file .zip'
          : 'Unduh seluruh halaman ini ke dalam bentuk file HTML interaktif statis'
      }
    >
      {isDualMode ? <FileArchive className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
      {isExporting ? 'Memproses...' : label}
    </button>
  );
}
