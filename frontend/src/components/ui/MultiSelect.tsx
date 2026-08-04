"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  selectAllLabel?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Pilih Data",
  className,
  selectAllLabel = "Semua / Select All",
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((opt) => opt !== "All");

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    let newSelected: string[];
    
    if (selected.includes("All")) {
      if (option === "All") {
        newSelected = []; // Deselect all
      } else {
        newSelected = filteredOptions.filter(o => o !== option);
      }
    } else {
      if (option === "All") {
        newSelected = ["All"];
      } else {
        if (selected.includes(option)) {
          newSelected = selected.filter((o) => o !== option);
        } else {
          newSelected = [...selected, option];
        }
        
        if (newSelected.length === filteredOptions.length && filteredOptions.length > 0) {
          newSelected = ["All"];
        }
      }
    }

    onChange(newSelected);
  };

  const isSelected = (option: string) => {
    if (selected.includes("All")) return true;
    return selected.includes(option);
  };

  const displayValue = () => {
    if (selected.includes("All")) {
      return selectAllLabel;
    }
    if (selected.length === 0) {
      return placeholder;
    }
    if (selected.length === 1) {
      return selected[0];
    }
    return `${selected.length} item dipilih`;
  };

  return (
    <div className={cn("relative w-full min-w-[200px] text-sm font-medium", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-2.5 text-slate-200 shadow-lg hover:border-sky-500 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all font-semibold text-sm cursor-pointer"
      >
        <span className="truncate text-left text-white">{displayValue()}</span>
        <ChevronDown className={cn("h-4 w-4 text-sky-400 shrink-0 transition-transform duration-200", isOpen ? "rotate-180 text-amber-300" : "")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-[9999] mt-2 max-h-[380px] min-w-full w-max max-w-[500px] overflow-auto rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-[0_25px_60px_rgba(0,0,0,0.9)] ring-1 ring-white/15 py-2 backdrop-blur-2xl">
          <div
            onClick={() => toggleOption("All")}
            className="flex cursor-pointer items-center px-4 py-2.5 text-slate-100 hover:bg-slate-800/90 hover:text-sky-300 transition-colors border-b border-slate-800/80 font-bold"
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center border rounded mr-3 shrink-0 transition-all shadow-inner",
              selected.includes("All") ? "border-sky-500 bg-sky-500 text-white shadow-sky-500/50" : "border-slate-600 bg-slate-950"
            )}>
              {selected.includes("All") && <Check className="h-3 w-3 stroke-[3]" />}
            </div>
            <span>{selectAllLabel}</span>
          </div>

          <div className="py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const checked = isSelected(option);
                return (
                  <div
                    key={option}
                    onClick={() => toggleOption(option)}
                    className="flex cursor-pointer items-center px-4 py-2.5 text-slate-200 hover:bg-slate-800/80 hover:text-white transition-colors text-sm font-medium"
                  >
                    <div className={cn(
                      "flex h-4 w-4 items-center justify-center border rounded mr-3 shrink-0 transition-all",
                      checked ? "border-sky-500 bg-sky-600 text-white shadow-sm" : "border-slate-600 bg-slate-950"
                    )}>
                      {checked && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                    <span className="break-words pr-2 whitespace-normal leading-snug">{option}</span>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-3 text-slate-400 text-xs italic text-center">Tidak ada opsi tersedia</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
