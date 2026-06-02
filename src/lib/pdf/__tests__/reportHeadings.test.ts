import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Lightweight guard against accidental ASCII transliteration of German
 * umlauts in PDF section headings (e.g. "Fuer" / "Gespraech" /
 * "GESTUETZTE"). pdf-lib renders the literal string, so the source
 * MUST contain the real umlaut or a \u escape.
 */
describe('PDF report headings — umlaut encoding', () => {
  const src = readFileSync(resolve(__dirname, '../report.ts'), 'utf8');

  it('uses "KI-gestützte" (no GESTUETZTE) for the AI section header', () => {
    expect(src).toContain('KI-GEST\u00DCTZTE VERLAUFSZUSAMMENFASSUNG');
    expect(src).not.toMatch(/KI-GESTUETZTE/);
  });

  it('uses "Für das Arztgespräch" (no Fuer / Arztgespraech)', () => {
    expect(src).toContain('F\u00FCr das Arztgespr\u00E4ch');
    expect(src).not.toMatch(/"Fuer das Arztgespraech"/);
  });

  it('has no ASCII-transliterated umlauts in drawText literals', () => {
    // Common offenders we never want as user-visible strings.
    const offenders = [
      /drawText\(\s*"[^"]*\b(Fuer|Gespraech|gestuetzte|Aerztlich|Maerz|Naechst|haeufig|ueberm)[^"]*"/i,
    ];
    for (const re of offenders) {
      expect(src).not.toMatch(re);
    }
  });
});
