import { toast as sonnerToast } from 'sonner';

/**
 * Unified toast helpers for consistent toast notifications across the app
 */

export const showSuccessToast = (title: string, description?: string) => {
  sonnerToast.success(title, { description });
};

export const showErrorToast = (title: string, description?: string) => {
  sonnerToast.error(title, { description });
};

export const showInfoToast = (title: string, description?: string) => {
  sonnerToast.info(title, { description });
};

export const showWarningToast = (title: string, description?: string) => {
  sonnerToast.warning(title, { description });
};
