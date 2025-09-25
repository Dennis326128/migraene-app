import React, { useRef, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface SwipeHandlerProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}

export const SwipeHandler: React.FC<SwipeHandlerProps> = ({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  children,
  className = '',
  threshold = 50
}) => {
  const isMobile = useIsMobile();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchEnd = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
  };

  const onTouchMove = (e: TouchEvent) => {
    touchEnd.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    
    const distanceX = touchStart.current.x - touchEnd.current.x;
    const distanceY = touchStart.current.y - touchEnd.current.y;
    const isLeftSwipe = distanceX > threshold;
    const isRightSwipe = distanceX < -threshold;
    const isUpSwipe = distanceY > threshold;
    const isDownSwipe = distanceY < -threshold;

    // Prioritize horizontal swipes over vertical for navigation
    if (Math.abs(distanceX) > Math.abs(distanceY)) {
      if (isLeftSwipe && onSwipeLeft) {
        onSwipeLeft();
      }
      if (isRightSwipe && onSwipeRight) {
        onSwipeRight();
      }
    } else {
      if (isUpSwipe && onSwipeUp) {
        onSwipeUp();
      }
      if (isDownSwipe && onSwipeDown) {
        onSwipeDown();
      }
    }
  };

  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !isMobile) return;

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
    };
  }, [isMobile, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold]);

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  );
};

export const MobileBackButton: React.FC<{ onBack: () => void; className?: string }> = ({ 
  onBack, 
  className = '' 
}) => {
  const isMobile = useIsMobile();
  
  if (!isMobile) return null;

  return (
    <button
      onClick={onBack}
      className={`
        fixed top-4 left-4 z-50 
        w-10 h-10 
        bg-background/80 backdrop-blur-sm 
        border border-border 
        rounded-full 
        flex items-center justify-center 
        shadow-lg 
        hover:bg-accent 
        active:scale-95 
        transition-all
        touch-manipulation
        ${className}
      `}
      aria-label="Zurück"
    >
      <svg 
        width="20" 
        height="20" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <path d="m12 19-7-7 7-7"/>
        <path d="M19 12H5"/>
      </svg>
    </button>
  );
};