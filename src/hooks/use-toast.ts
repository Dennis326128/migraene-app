/**
 * Compatibility hook that redirects old toast calls to Sonner.
 * 
 * For new code, use Sonner directly:
 * - import { toast } from 'sonner';
 * - toast.success("Title", { description: "..." })
 * - toast.error("Title", { description: "..." })
 * 
 * Or use helpers from @/lib/toastHelpers:
 * - showSuccessToast(title, description)
 * - showErrorToast(title, description)
 */

import { toast as sonnerToast } from 'sonner';
import { sanitizeToastText } from '@/lib/toast/sanitizeToastText';

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

interface ToastReturn {
  id: string | number;
  dismiss: () => void;
  update: (options: ToastOptions) => void;
}

function toast(options: ToastOptions): ToastReturn {
  const { title, description, variant, duration } = options;
  
  // Sanitize text to remove leading status emojis (prevents double-icon)
  const cleanTitle = sanitizeToastText(title);
  const cleanDescription = sanitizeToastText(description);
  
  // Determine toast type based on variant
  let id: string | number;
  
  if (variant === 'destructive') {
    id = sonnerToast.error(cleanTitle || 'Fehler', {
      description: cleanDescription,
      duration: duration || 5000,
      closeButton: false,
    });
  } else {
    // Default/success - use info for neutral messages
    id = sonnerToast.success(cleanTitle || '', {
      description: cleanDescription,
      duration: duration || 2000,
      closeButton: false,
    });
  }

  return {
    id,
    dismiss: () => sonnerToast.dismiss(id),
    update: (newOptions: ToastOptions) => {
      // Sonner doesn't support direct update, dismiss and show new
      sonnerToast.dismiss(id);
      toast(newOptions);
    }
  };
}

function useToast() {
  return {
    toast,
    toasts: [] as ToastReturn[],
    dismiss: (toastId?: string | number) => {
      if (toastId) {
        sonnerToast.dismiss(toastId);
      } else {
        sonnerToast.dismiss();
      }
    },
  };
}

export { useToast, toast };
