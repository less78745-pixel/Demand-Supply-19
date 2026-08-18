"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Anchor } from 'lucide-react';

export default function TrackingContainerRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard-harian/pr-update');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4 text-muted-foreground">
      <Anchor className="w-12 h-12 text-primary animate-pulse" />
      <h2 className="text-xl font-bold text-foreground">Modul Tracking Container Telah Digabungkan</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Mengalihkan Anda ke modul terpadu <b>PR Update & Tracking Container</b>...
      </p>
    </div>
  );
}
