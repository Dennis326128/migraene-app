/**
 * Development-only logging utility
 * Prevents sensitive data from being logged in production
 */

type LogLevel = 'log' | 'warn' | 'error' | 'info';

interface LogOptions {
  context?: string;
  data?: any;
}

/**
 * Safe logger that only logs in development environment
 * In production, errors are captured for monitoring (TODO: integrate error tracking)
 */
export class DevLogger {
  private static isDev = import.meta.env.DEV;

  private static formatMessage(level: LogLevel, message: string, context?: string): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `[${context}]` : '';
    return `[${timestamp}] ${contextStr} ${message}`;
  }

  /**
   * Log informational messages (only in development)
   */
  static log(message: string, options?: LogOptions): void {
    if (this.isDev) {
      const formattedMsg = this.formatMessage('log', message, options?.context);
      console.log(formattedMsg, options?.data || '');
    }
  }

  /**
   * Log warning messages (only in development)
   */
  static warn(message: string, options?: LogOptions): void {
    if (this.isDev) {
      const formattedMsg = this.formatMessage('warn', message, options?.context);
      console.warn(formattedMsg, options?.data || '');
    }
  }

  /**
   * Log error messages (always logged, but sanitized in production)
   */
  static error(message: string, error?: unknown, options?: LogOptions): void {
    const formattedMsg = this.formatMessage('error', message, options?.context);
    
    if (this.isDev) {
      console.error(formattedMsg, error, options?.data || '');
    } else {
      // In production: log only essential error info, not sensitive data
      console.error(formattedMsg);
      
      // TODO: Send to error tracking service (e.g., Sentry)
      // errorTracker.captureException(error, {
      //   tags: { context: options?.context },
      //   extra: { message }
      // });
    }
  }

  /**
   * Log info messages (only in development)
   */
  static info(message: string, options?: LogOptions): void {
    if (this.isDev) {
      const formattedMsg = this.formatMessage('info', message, options?.context);
      console.info(formattedMsg, options?.data || '');
    }
  }

  /**
   * Check if we're in development mode
   */
  static get isDevelopment(): boolean {
    return this.isDev;
  }
}

// Convenience exports
export const devLog = DevLogger.log.bind(DevLogger);
export const devWarn = DevLogger.warn.bind(DevLogger);
export const devError = DevLogger.error.bind(DevLogger);
export const devInfo = DevLogger.info.bind(DevLogger);
