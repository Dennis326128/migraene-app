/**
 * Lazy Import Utilities
 * Centralized lazy loading for heavy components to reduce initial bundle size
 */

import { lazy } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// HEAVY VIEWS - Loaded on demand
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DiaryReport - Heavy PDF generation dependencies
 */
export const LazyDiaryReport = lazy(() => 
  import("@/components/PainApp/DiaryReport").then(m => ({ default: m.default }))
);

/**
 * AnalysisView - Chart libraries (recharts)
 */
export const LazyAnalysisView = lazy(() => 
  import("@/components/PainApp/AnalysisView").then(m => ({ default: m.AnalysisView }))
);

/**
 * MedicationManagement - Complex medication UI
 */
export const LazyMedicationManagement = lazy(() => 
  import("@/components/PainApp/MedicationManagement").then(m => ({ default: m.MedicationManagement }))
);

/**
 * MedicationOverviewPage - Medication overview
 */
export const LazyMedicationOverviewPage = lazy(() => 
  import("@/pages/MedicationOverviewPage").then(m => ({ default: m.MedicationOverviewPage }))
);

/**
 * DiaryTimeline - Calendar/timeline view
 */
export const LazyDiaryTimeline = lazy(() => 
  import("@/components/PainApp/DiaryTimeline").then(m => ({ default: m.DiaryTimeline }))
);

/**
 * SettingsPage - Settings with many sub-components
 */
export const LazySettingsPage = lazy(() => 
  import("@/components/PainApp/SettingsPage")
);

/**
 * VoiceNotesList - Voice notes with audio processing
 */
export const LazyVoiceNotesList = lazy(() => 
  import("@/components/PainApp/VoiceNotesList").then(m => ({ default: m.VoiceNotesList }))
);

/**
 * MedicationLimitsPage - Limits management
 */
export const LazyMedicationLimitsPage = lazy(() => 
  import("@/components/PainApp/MedicationLimitsPage").then(m => ({ default: m.MedicationLimitsPage }))
);

/**
 * ContextTagsView - Context tags analysis
 */
export const LazyContextTagsView = lazy(() => 
  import("@/components/PainApp/ContextTagsView").then(m => ({ default: m.ContextTagsView }))
);

/**
 * RemindersPage - Reminders with scheduling
 */
export const LazyRemindersPage = lazy(() => 
  import("@/components/Reminders/RemindersPage").then(m => ({ default: m.RemindersPage }))
);

/**
 * SettingsDoctorsPage - Doctor management
 */
export const LazySettingsDoctorsPage = lazy(() => 
  import("@/components/PainApp/Settings/SettingsDoctorsPage").then(m => ({ default: m.SettingsDoctorsPage }))
);

/**
 * Hit6Screen - HIT-6 questionnaire with PDF generation
 */
export const LazyHit6Screen = lazy(() => 
  import("@/components/PainApp/Hit6Screen").then(m => ({ default: m.default }))
);

/**
 * AIReportsList - KI-Berichte list and detail views
 */
export const LazyAIReportsList = lazy(() => 
  import("@/features/ai-reports/components/AIReportsList").then(m => ({ default: m.AIReportsList }))
);

export const LazyAIReportDetail = lazy(() => 
  import("@/features/ai-reports/components/AIReportDetail").then(m => ({ default: m.AIReportDetail }))
);

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION - Only load when needed
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dynamically import PDF generation functions
 * These bring in heavy dependencies (pdf-lib, fontkit, jspdf)
 */
export async function loadMedicationPlanPdf() {
  const module = await import("@/lib/pdf/medicationPlan");
  return module;
}

export async function loadDiaryReportPdf() {
  const module = await import("@/lib/pdf/report");
  return module;
}

export async function loadProfessionalReportPdf() {
  const module = await import("@/lib/pdf/professionalReport");
  return module;
}

export async function loadModernReportPdf() {
  const module = await import("@/lib/pdf/modernReport");
  return module;
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFETCH UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prefetch a lazy component when user hovers or focuses an element
 * Silently triggers the import without rendering
 */
export function prefetchComponent(importFn: () => Promise<any>) {
  // Trigger the import but don't wait for it
  importFn().catch(() => {
    // Silently ignore prefetch errors
  });
}

/**
 * Prefetch common views during idle time
 */
export function prefetchCommonViews() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      // Prefetch most commonly used views
      import("@/components/PainApp/DiaryTimeline");
      import("@/components/PainApp/AnalysisView");
    }, { timeout: 3000 });
  }
}
