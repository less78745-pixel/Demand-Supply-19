"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacySOHRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard-harian/soh-to-analysis'); }, [router]);
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground animate-pulse text-sm">Redirecting...</p>
    </div>
  );
}
