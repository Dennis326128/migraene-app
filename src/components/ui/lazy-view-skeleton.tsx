/**
 * Lazy View Skeleton - Lightweight loading placeholder for lazy-loaded views
 * Used as Suspense fallback to prevent layout shift
 */

import React from "react";

interface LazyViewSkeletonProps {
  title?: string;
  showBackButton?: boolean;
}

export const LazyViewSkeleton: React.FC<LazyViewSkeletonProps> = ({ 
  title = "Laden...",
  showBackButton = true 
}) => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          {showBackButton && (
            <div className="w-8 h-8 bg-muted rounded-md animate-pulse" />
          )}
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
        </div>
      </div>
      
      {/* Content skeleton */}
      <div className="p-4 space-y-4">
        <div className="h-24 bg-muted/50 rounded-lg animate-pulse" />
        <div className="h-32 bg-muted/50 rounded-lg animate-pulse" />
        <div className="h-20 bg-muted/50 rounded-lg animate-pulse" />
      </div>
      
      {/* Subtle loading indicator */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border shadow-sm">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>{title}</span>
        </div>
      </div>
    </div>
  );
};

export default LazyViewSkeleton;
