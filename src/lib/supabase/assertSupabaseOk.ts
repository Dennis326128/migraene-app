/**
 * Supabase Error Handling Utilities
 * Provides consistent error handling across all API calls
 */

import { PostgrestError } from '@supabase/supabase-js';
import { DevLogger } from '@/lib/utils/devLogger';
import { toast } from 'sonner';

/**
 * Custom error class for Supabase operations
 */
export class SupabaseError extends Error {
  public readonly code: string;
  public readonly details: string | null;
  public readonly hint: string | null;
  public readonly context: string;
  public readonly isPermissionDenied: boolean;
  public readonly isNetworkError: boolean;

  constructor(context: string, error: PostgrestError) {
    super(`${context}: ${error.message}`);
    this.name = 'SupabaseError';
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;
    this.context = context;
    
    // Check for permission denied errors
    this.isPermissionDenied = 
      error.code === '42501' || 
      error.code === 'PGRST301' ||
      error.message.toLowerCase().includes('permission denied') ||
      error.message.toLowerCase().includes('policy');
    
    // Check for network errors
    this.isNetworkError = 
      error.code === 'NETWORK_ERROR' ||
      error.message.toLowerCase().includes('fetch') ||
      error.message.toLowerCase().includes('network');
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    if (this.isPermissionDenied) {
      return 'Keine Berechtigung. Bitte erneut einloggen.';
    }
    if (this.isNetworkError) {
      return 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.';
    }
    return 'Ein Fehler ist aufgetreten. Bitte erneut versuchen.';
  }
}

/**
 * Assert that a Supabase result is successful
 * Throws SupabaseError if there's an error
 * 
 * @param result - Supabase query result
 * @param context - Context string for error messages (e.g., "reminders.fetch")
 * @returns The data if successful
 */
export function assertSupabaseOk<T>(
  result: { data: T | null; error: PostgrestError | null },
  context: string
): T {
  if (result.error) {
    // Sanitize context for logging (no sensitive data)
    const sanitizedContext = context.replace(/['"]/g, '');
    
    DevLogger.error(`Supabase error in ${sanitizedContext}:`, result.error, {
      context: 'assertSupabaseOk',
      data: {
        code: result.error.code,
        hint: result.error.hint
      }
    });
    
    throw new SupabaseError(sanitizedContext, result.error);
  }
  
  return result.data as T;
}

/**
 * Handle Supabase errors with user-friendly toast
 * Use this in mutation error handlers
 * 
 * @param error - The caught error
 * @param fallbackMessage - Fallback message if not a SupabaseError
 */
export function handleSupabaseError(error: unknown, fallbackMessage = 'Ein Fehler ist aufgetreten'): void {
  if (error instanceof SupabaseError) {
    const message = error.getUserMessage();
    
    if (error.isPermissionDenied) {
      toast.error(message, {
        description: 'Session möglicherweise abgelaufen',
        action: {
          label: 'Neu laden',
          onClick: () => window.location.reload()
        }
      });
    } else if (error.isNetworkError) {
      toast.error(message, {
        description: 'Offline-Modus aktiv'
      });
    } else {
      toast.error(message);
    }
  } else if (error instanceof Error) {
    DevLogger.error('Non-Supabase error:', error);
    toast.error(fallbackMessage, {
      description: import.meta.env.DEV ? error.message : undefined
    });
  } else {
    toast.error(fallbackMessage);
  }
}

/**
 * Wrapper for async operations with automatic error handling
 * 
 * @param operation - Async function to execute
 * @param context - Context for error messages
 * @param fallbackMessage - Fallback error message
 */
export async function withSupabaseErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  fallbackMessage?: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    handleSupabaseError(error, fallbackMessage || `Fehler bei ${context}`);
    return null;
  }
}
