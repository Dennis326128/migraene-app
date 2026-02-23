/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared Report V2 — Edge Function Entry Point
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Re-exports the Analysis V2 module for use in Edge Functions.
 * The isomorphic core library lives in src/lib/report-v2/.
 * This _shared copy provides the Deno-compatible analysis layer.
 */

export * from "./analysis/index.ts";
