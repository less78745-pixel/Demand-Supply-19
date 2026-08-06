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
        className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-foreground shadow-sm hover:border-primary hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-semibold text-sm cursor-pointer"
      >
        <span className="truncate text-left text-foreground">{displayValue()}</span>
        <ChevronDown className={cn("h-4 w-4 text-primary shrink-0 transition-transform duration-200", isOpen ? "rotate-180 text-primary" : "")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-[9999] mt-2 max-h-[380px] min-w-full w-max max-w-[500px] overflow-auto rounded-xl border border-border bg-card text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-black/5 py-2 backdrop-blur-2xl">
          <div
            onClick={() => toggleOption("All")}
            className="flex cursor-pointer items-center px-4 py-2.5 text-foreground hover:bg-muted/80 hover:text-primary transition-colors border-b border-border font-bold"
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center border rounded mr-3 shrink-0 transition-all shadow-inner",
              selected.includes("All") ? "border-primary bg-primary text-white shadow-primary/30" : "border-border bg-background"
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
                    className="flex cursor-pointer items-center px-4 py-2.5 text-foreground hover:bg-muted/70 hover:text-primary transition-colors text-sm font-medium"
                  >
                    <div className={cn(
                      "flex h-4 w-4 items-center justify-center border rounded mr-3 shrink-0 transition-all",
                      checked ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-background"
                    )}>
                      {checked && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                    <span className="break-words pr-2 whitespace-normal leading-snug">{option}</span>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-3 text-muted-foreground text-xs italic text-center">Tidak ada opsi tersedia</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
