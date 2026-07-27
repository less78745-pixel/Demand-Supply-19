import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center min-h-[400px]">
      <Loader2 className="w-12 h-12 animate-spin text-primary/70 mb-4" />
      <p className="text-muted-foreground animate-pulse font-medium tracking-wide">Memuat data...</p>
    </div>
  );
}
