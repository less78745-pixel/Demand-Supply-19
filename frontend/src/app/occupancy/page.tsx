"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyOccupancyRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/kalkulator-dsp/occupancy'); }, [router]);
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground animate-pulse text-sm">Redirecting...</p>
    </div>
  );
}
