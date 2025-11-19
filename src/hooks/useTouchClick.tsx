import { useRef } from 'react';

/**
 * Hook to differentiate between scroll and tap on touch devices
 * Only triggers callback on genuine taps, not when user is scrolling
 */
export function useTouchClick(callback: () => void, threshold = 10) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStart.current.x);
    const deltaY = Math.abs(touch.clientY - touchStart.current.y);
    const deltaTime = Date.now() - touchStart.current.time;
    
    // Only count as tap if:
    // - Movement < threshold pixels
    // - Duration < 500ms
    if (deltaX < threshold && deltaY < threshold && deltaTime < 500) {
      e.preventDefault();
      callback();
    }
    
    touchStart.current = null;
  };
  
  return { handleTouchStart, handleTouchEnd };
}
