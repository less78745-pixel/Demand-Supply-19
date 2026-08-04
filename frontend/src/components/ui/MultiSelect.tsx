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
  selectAllLabel = "Select All",
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
    return `${selected.length} selected`;
  };

  return (
    <div className={cn("relative inline-block min-w-[230px] max-w-[360px] w-auto text-sm", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3.5 py-2 text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary transition-colors hover:border-primary/50"
      >
        <span className="truncate text-left font-medium">{displayValue()}</span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-80 min-w-[280px] w-max max-w-[450px] overflow-auto rounded-md border border-border bg-popover shadow-lg py-1">
          <div
            onClick={() => toggleOption("All")}
            className="flex cursor-pointer items-center px-3.5 py-2.5 text-popover-foreground hover:bg-muted transition-colors"
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center border rounded-sm mr-2.5 shrink-0 transition-colors",
              selected.includes("All") ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
            )}>
              {selected.includes("All") && <Check className="h-3 w-3" />}
            </div>
            <span className="font-semibold">{selectAllLabel}</span>
          </div>

          <div className="my-1 h-px bg-border" />

          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              const checked = isSelected(option);
              return (
                <div
                  key={option}
                  onClick={() => toggleOption(option)}
                  className="flex cursor-pointer items-center px-3.5 py-2 text-popover-foreground hover:bg-muted transition-colors"
                >
                  <div className={cn(
                    "flex h-4 w-4 items-center justify-center border rounded-sm mr-2.5 shrink-0 transition-colors",
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                  )}>
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <span className="break-words pr-2 whitespace-normal leading-snug">{option}</span>
                </div>
              );
            })
          ) : (
            <div className="px-3 py-2 text-muted-foreground text-xs">No options</div>
          )}
        </div>
      )}
    </div>
  );
}
