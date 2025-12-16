/**
 * Voice Draft Storage Utilities
 * Simple sessionStorage-based draft persistence for voice input
 * Draft is consumed (deleted) after use to prevent unexpected reappearance
 */

const STORAGE_KEY = 'voiceDraft';

/**
 * Store a voice draft for later use
 */
export function setVoiceDraft(text: string): void {
  if (text && text.trim()) {
    sessionStorage.setItem(STORAGE_KEY, text.trim());
  }
}

/**
 * Get and remove the voice draft (consume it)
 * Returns null if no draft exists
 */
export function consumeVoiceDraft(): string | null {
  const draft = sessionStorage.getItem(STORAGE_KEY);
  if (draft) {
    sessionStorage.removeItem(STORAGE_KEY);
    return draft;
  }
  return null;
}

/**
 * Check if a voice draft exists without consuming it
 */
export function hasVoiceDraft(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Clear any existing voice draft
 */
export function clearVoiceDraft(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
