import { useState } from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";

/**
 * Touch-safe version of CollapsibleTrigger that prevents accidental triggers during scrolling
 */
export function TouchSafeCollapsibleTrigger({ 
  children, 
  className,
  ...props 
}: React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  const [touchMoved, setTouchMoved] = useState(false);
  
  const handleTouchStart = () => {
    setTouchMoved(false);
  };
  
  const handleTouchMove = () => {
    setTouchMoved(true);
  };
  
  const handleClick = (e: React.MouseEvent) => {
    if (touchMoved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  };
  
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      {...props}
      className={cn("touch-manipulation select-none", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onClick={handleClick}
    >
      {children}
    </CollapsiblePrimitive.CollapsibleTrigger>
  );
}
