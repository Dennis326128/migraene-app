/**
 * VoiceDebugOverlay – Dev-mode overlay showing parse evidence
 * 
 * Shows: recognized pain + evidence, time, meds + matchScores,
 * notes before/after cleanup, flags.
 * Only visible when dev mode is active.
 */

import React, { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Bug } from 'lucide-react';
import type { VoiceParseResult } from '@/lib/voice/simpleVoiceParser';

interface VoiceDebugOverlayProps {
  parseResult: VoiceParseResult | null;
  painDefaultUsed?: boolean;
  painFromDescriptor?: boolean;
  medsNeedReview?: boolean;
}

export function VoiceDebugOverlay({
  parseResult,
  painDefaultUsed,
  painFromDescriptor,
  medsNeedReview,
}: VoiceDebugOverlayProps) {
  const [copied, setCopied] = useState(false);
  
  // Only show in dev mode
  const isDev = import.meta.env.DEV;
  if (!isDev || !parseResult) return null;
  
  const debugData = {
    entry_type: parseResult.entry_type,
    confidence: parseResult.confidence,
    pain: {
      value: parseResult.pain_intensity.value,
      confidence: parseResult.pain_intensity.confidence,
      evidence: parseResult.pain_intensity.evidence,
      needsReview: parseResult.pain_intensity.needsReview,
      fromDescriptor: parseResult.pain_intensity.painFromDescriptor,
    },
    time: {
      kind: parseResult.time.kind,
      relative_minutes: parseResult.time.relative_minutes,
      date: parseResult.time.date,
      time: parseResult.time.time,
      isNow: parseResult.time.isNow,
      display: parseResult.time.displayText,
    },
    medications: parseResult.medications.map(m => ({
      name: m.name,
      confidence: m.confidence,
      needsReview: m.needsReview,
      doseQuarters: m.doseQuarters,
      matched: m.matched_user_med,
    })),
    note: parseResult.note,
    raw_text: parseResult.raw_text,
    flags: {
      painDefaultUsed,
      painFromDescriptor,
      medsNeedReview,
    },
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors w-full group">
        <Bug className="h-3 w-3" />
        <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
        <span>Debug (Dev)</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div 
          className="px-2 pb-2 cursor-pointer" 
          onClick={handleCopy}
          title="Tap to copy JSON"
        >
          <pre className="text-[10px] leading-tight text-muted-foreground/50 bg-muted rounded p-2 overflow-x-auto max-h-48 overflow-y-auto font-mono">
            {JSON.stringify(debugData, null, 2)}
          </pre>
          {copied && (
            <p className="text-[10px] text-primary mt-1">Copied!</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
