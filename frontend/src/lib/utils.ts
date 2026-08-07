import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumberCompact(num: number): string {
  if (isNaN(num)) return "0";
  const absNum = Math.abs(num);
  
  if (absNum >= 1_000_000_000) {
    return (num / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' Miliar';
  }
  if (absNum >= 1_000_000) {
    return (num / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' Juta';
  }
  return num.toLocaleString('id-ID');
}
