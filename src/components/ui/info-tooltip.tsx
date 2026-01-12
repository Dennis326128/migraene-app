/**
 * Info Tooltip Component
 * Small info icon that opens a tooltip/popover with explanation text
 */

import React from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface InfoTooltipProps {
  content: React.ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function InfoTooltip({ content, className = "", side = "top" }: InfoTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${className}`}
          aria-label="Mehr erfahren"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side={side} 
        className="w-72 p-3 text-sm"
        sideOffset={5}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
