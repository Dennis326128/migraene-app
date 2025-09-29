import { useEffect, useRef, useState } from "react"

interface GestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onLongPress?: () => void
  onDoubleTap?: () => void
  threshold?: number
  longPressDelay?: number
}

export function useGestures(options: GestureOptions) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onLongPress,
    onDoubleTap,
    threshold = 50,
    longPressDelay = 500
  } = options

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const longPressTimeoutRef = useRef<NodeJS.Timeout>()
  const lastTapRef = useRef<number>(0)
  const [isLongPressing, setIsLongPressing] = useState(false)

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    }

    // Start long press timer
    if (onLongPress) {
      longPressTimeoutRef.current = setTimeout(() => {
        setIsLongPressing(true)
        onLongPress()
      }, longPressDelay)
    }
  }

  const handleTouchMove = () => {
    // Cancel long press if touch moves
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      setIsLongPressing(false)
    }
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
    }

    if (isLongPressing) {
      setIsLongPressing(false)
      return
    }

    if (!touchStartRef.current) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const deltaTime = Date.now() - touchStartRef.current.time

    // Handle double tap
    if (onDoubleTap && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        onDoubleTap()
        lastTapRef.current = 0
        return
      }
      lastTapRef.current = now
    }

    // Handle swipes
    if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight()
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft()
        }
      } else {
        // Vertical swipe
        if (deltaY > 0 && onSwipeDown) {
          onSwipeDown()
        } else if (deltaY < 0 && onSwipeUp) {
          onSwipeUp()
        }
      }
    }

    touchStartRef.current = null
  }

  const attachListeners = (element: HTMLElement) => {
    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }

  return {
    attachListeners,
    isLongPressing
  }
}

// Hook for pull-to-refresh functionality
export function usePullToRefresh(onRefresh: () => void, threshold = 100) {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const touchStartY = useRef<number>(0)
  const scrollElement = useRef<HTMLElement>()

  const handleTouchStart = (e: TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: TouchEvent) => {
    const element = scrollElement.current
    if (!element || element.scrollTop > 0) return

    const touchY = e.touches[0].clientY
    const deltaY = touchY - touchStartY.current

    if (deltaY > 0) {
      e.preventDefault()
      setIsPulling(true)
      setPullDistance(Math.min(deltaY, threshold * 1.5))
    }
  }

  const handleTouchEnd = () => {
    if (isPulling && pullDistance >= threshold) {
      onRefresh()
    }
    setIsPulling(false)
    setPullDistance(0)
  }

  const attachPullToRefresh = (element: HTMLElement) => {
    scrollElement.current = element
    element.addEventListener('touchstart', handleTouchStart)
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }

  return {
    attachPullToRefresh,
    isPulling,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1)
  }
}