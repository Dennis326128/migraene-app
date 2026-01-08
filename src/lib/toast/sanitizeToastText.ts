/**
 * Sanitize toast text to remove leading status emojis.
 * This prevents double-icon display when Sonner already shows a success/error icon.
 */

// Status emojis that should be removed from the start of toast messages
const STATUS_EMOJI_PATTERN = /^[\s]*(✅|✔️|☑️|❌|⚠️|ℹ️|🔴|🟢|🟡|❗|‼️|⛔|🚫|💚|💛|❤️|🔵|⭕|✓|✗|×)[\s]*/u;

export function sanitizeToastText(text: string | undefined): string | undefined {
  if (!text) return text;
  return text.replace(STATUS_EMOJI_PATTERN, '').trim();
}
