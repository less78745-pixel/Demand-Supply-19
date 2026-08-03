"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home, Terminal } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Client-side exception caught by error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-6 text-slate-100 font-sans">
      <div className="max-w-2xl w-full relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-rose-600 via-amber-600 to-rose-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
        <div className="relative bg-slate-900/90 backdrop-blur-xl border border-rose-500/30 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0 animate-pulse">
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest bg-rose-500/20 text-rose-400 border border-rose-500/40 uppercase">
                Runtime Exception
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight mt-1.5">
                Terjadi Kendala Teknis Pada Layar (Client-Side Error)
              </h1>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-slate-300 leading-relaxed">
              Sistem mendeteksi anomali saat merender tampilan atau memproses data kalkulasi. Hal ini umumnya terjadi karena format data yang diunggah memiliki struktur yang tidak disangka (misal: kolom bernilai kosong/NaN atau format karakter tidak valid) sehingga sistem melindungi memori peramban.
            </p>

            {error?.message && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-rose-300 space-y-1.5 overflow-x-auto">
                <div className="flex items-center gap-1.5 text-slate-500 font-sans text-[11px] font-semibold mb-1">
                  <Terminal className="w-3.5 h-3.5" /> Rincian Error Diagnostik:
                </div>
                <div className="font-bold">{error.message}</div>
                {error.stack && (
                  <div className="text-[10px] text-slate-500 whitespace-pre-wrap pt-2 border-t border-slate-900 line-clamp-6">
                    {error.stack}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={() => reset()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 text-white font-semibold text-sm shadow-lg shadow-rose-600/20 hover:from-rose-500 hover:to-amber-500 hover:scale-[1.02] active:scale-[0.98] transition flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4 animate-spin-once" />
              Coba Muat Ulang (Retry)
            </button>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-200 font-semibold text-sm border border-slate-700 hover:bg-slate-700 transition flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
