/**
 * Re-export of the V2.1/V2.2 expanded-findings postprocess so both
 * `analyze-voice-patterns` (App) and `analyze-voice-patterns-shared`
 * (Doctor-Share) use the SAME normalization, dedupe, evidence whitelist,
 * MAX_EXPANDED_FINDINGS cap and data_quality safety-net.
 *
 * The original implementation continues to live under
 * `analyze-voice-patterns/postprocess.ts` to keep the existing Deno
 * tests (`postprocess_test.ts`) green. New code SHOULD import from
 * this `_shared/` module so the engine is callable from both endpoints
 * without duplication.
 */

export {
  postprocessExpandedFindings,
  V21_CATEGORIES,
  V21_EVIDENCE,
  V21_SOURCE_BASIS,
  V21_RELEVANCE,
  MAX_EXPANDED_FINDINGS,
  type ExpandedFinding,
} from "../analyze-voice-patterns/postprocess.ts";
