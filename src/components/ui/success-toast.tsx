import React, { useEffect, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuccessToastProps {
  title: string;
  description?: string;
  show?: boolean;
  onClose?: () => void;
  duration?: number;
  className?: string;
}

export const SuccessToast: React.FC<SuccessToastProps> = ({
  title,
  description,
  show = true,
  onClose,
  duration = 4000,
  className
}) => {
  const [isVisible, setIsVisible] = useState(show);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      setIsAnimating(true);
      
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setTimeout(() => {
          setIsVisible(false);
          onClose?.();
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50 max-w-sm",
        "transform transition-all duration-300 ease-out",
        isAnimating 
          ? "translate-x-0 opacity-100 scale-100" 
          : "translate-x-full opacity-0 scale-95",
        className
      )}
    >
      <div className="bg-card border border-green-200 rounded-lg shadow-lg p-4 relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-green-50/50 via-emerald-50/30 to-green-50/50 animate-pulse" />
        
        {/* Sparkle animation */}
        <div className="absolute top-2 right-2 text-yellow-400 animate-bounce">
          <Sparkles className="h-4 w-4" />
        </div>
        
        <div className="relative flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <CheckCircle2 className="h-5 w-5 text-green-600 animate-pulse" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground mb-1">
              {title}
            </h4>
            {description && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 h-1 bg-green-600 rounded-bl-lg" 
             style={{ 
               width: '100%',
               animation: `progressShrink ${duration}ms linear`
             }} 
        />
      </div>
      
      {/* Inline keyframes */}
      <style>{`
        @keyframes progressShrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};