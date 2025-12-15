/**
 * Global Error Capture for QA/Debugging
 * Captures unhandled errors and promise rejections
 */

import { DevLogger } from '@/lib/utils/devLogger';

interface CapturedError {
  message: string;
  stack?: string;
  route: string;
  timestamp: string;
  type: 'error' | 'unhandledrejection';
}

// Store captured errors for DEV inspection
const capturedErrors: CapturedError[] = [];
const MAX_STORED_ERRORS = 50;

/**
 * Get build ID from public/build-id.txt or fallback
 */
function getBuildId(): string {
  return import.meta.env.VITE_BUILD_ID || 'dev';
}

/**
 * Store error in memory and localStorage (DEV only)
 */
function storeError(error: CapturedError): void {
  capturedErrors.push(error);
  
  // Keep only the last N errors
  if (capturedErrors.length > MAX_STORED_ERRORS) {
    capturedErrors.shift();
  }
  
  // Store in localStorage for DEV persistence
  if (import.meta.env.DEV) {
    try {
      localStorage.setItem('qa_captured_errors', JSON.stringify(capturedErrors));
    } catch {
      // localStorage might be full or unavailable
    }
  }
}

/**
 * Format error for logging
 */
function formatError(type: 'error' | 'unhandledrejection', message: string, stack?: string): CapturedError {
  return {
    message,
    stack,
    route: window.location.pathname,
    timestamp: new Date().toISOString(),
    type
  };
}

/**
 * Handle window.onerror events
 */
function handleWindowError(
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error
): boolean {
  const errorMessage = typeof message === 'string' 
    ? message 
    : error?.message || 'Unknown error';
  
  const stack = error?.stack || `at ${source}:${lineno}:${colno}`;
  
  const captured = formatError('error', errorMessage, stack);
  storeError(captured);
  
  DevLogger.error('[QA] Unhandled error:', error, {
    context: 'window.onerror',
    data: { 
      route: captured.route, 
      buildId: getBuildId(),
      source,
      lineno,
      colno
    }
  });
  
  // Return false to allow default browser error handling
  return false;
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message = reason?.message || String(reason) || 'Unhandled promise rejection';
  const stack = reason?.stack;
  
  const captured = formatError('unhandledrejection', message, stack);
  storeError(captured);
  
  DevLogger.error('[QA] Unhandled rejection:', reason, {
    context: 'window.onunhandledrejection',
    data: { 
      route: captured.route, 
      buildId: getBuildId()
    }
  });
}

/**
 * Initialize global error capture
 * Call this once in main.tsx
 */
export function initErrorCapture(): void {
  // Only set up handlers if not already initialized
  if ((window as any).__qa_error_capture_initialized) {
    return;
  }
  
  window.onerror = handleWindowError;
  window.onunhandledrejection = handleUnhandledRejection;
  
  (window as any).__qa_error_capture_initialized = true;
  
  if (import.meta.env.DEV) {
    console.info('[QA] Error capture initialized');
  }
}

/**
 * Get all captured errors (for QA page)
 */
export function getCapturedErrors(): CapturedError[] {
  return [...capturedErrors];
}

/**
 * Clear captured errors
 */
export function clearCapturedErrors(): void {
  capturedErrors.length = 0;
  if (import.meta.env.DEV) {
    localStorage.removeItem('qa_captured_errors');
  }
}

/**
 * Load persisted errors from localStorage (DEV only)
 */
export function loadPersistedErrors(): void {
  if (!import.meta.env.DEV) return;
  
  try {
    const stored = localStorage.getItem('qa_captured_errors');
    if (stored) {
      const parsed = JSON.parse(stored) as CapturedError[];
      capturedErrors.push(...parsed);
    }
  } catch {
    // Ignore parse errors
  }
}
