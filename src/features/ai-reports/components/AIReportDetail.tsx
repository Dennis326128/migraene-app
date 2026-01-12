/**
 * AI Report Detail Component
 * Shows the full content of a saved AI report
 */

import React from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, Calendar, Brain, AlertTriangle, TrendingUp, Lightbulb, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AIReport } from "@/features/ai-reports";

interface AIReportDetailProps {
  report: AIReport;
  onBack: () => void;
}

// Confidence badge colors
const confidenceColors: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const label = confidence === 'high' ? 'Hoch' : confidence === 'medium' ? 'Mittel' : 'Niedrig';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${confidenceColors[confidence] || confidenceColors.low}`}>
      {label}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(true);
  
  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h3 className="font-medium text-sm">{title}</h3>
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <div className="p-4">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function AIReportDetail({ report, onBack }: AIReportDetailProps) {
  // Fallback: if response_json.structured exists use it, otherwise use response_json directly
  // This handles both old diary_pdf reports (no structured wrapper) and pattern_analysis reports
  const responseData = report.response_json as any;
  const structured = responseData?.structured ?? responseData;
  
  // Check if we have valid data (either structured format or diary format with keyFindings/headline)
  const hasValidData = structured && (
    structured.keyFindings?.length > 0 || 
    structured.sections?.length > 0 || 
    structured.headline ||
    structured.overview
  );
  
  if (!hasValidData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">{report.title}</h1>
        </div>
        <div className="p-4">
          <Card className="p-6 text-center text-muted-foreground">
            Keine Analysedaten verfügbar
          </Card>
        </div>
      </div>
    );
  }

  const overview = structured.overview;
  const keyFindings = structured.keyFindings || [];
  const sections = structured.sections || [];
  const tags = structured.tagsFromNotes || [];
  const dataCoverage = structured.dataCoverage;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{report.title}</h1>
          {report.from_date && report.to_date && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(report.from_date), "d. MMM", { locale: de })} – {format(new Date(report.to_date), "d. MMM yyyy", { locale: de })}
            </p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Overview */}
        {overview && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-3">
              <Brain className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <h2 className="font-medium text-sm mb-1">{overview.headline}</h2>
                {overview.disclaimer && (
                  <p className="text-xs text-muted-foreground italic">{overview.disclaimer}</p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Data coverage */}
        {dataCoverage && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {dataCoverage.entries > 0 && (
              <Badge variant="secondary" className="font-normal">
                {dataCoverage.entries} Einträge
              </Badge>
            )}
            {dataCoverage.notes > 0 && (
              <Badge variant="secondary" className="font-normal">
                {dataCoverage.notes} Notizen
              </Badge>
            )}
            {dataCoverage.weatherDays > 0 && (
              <Badge variant="secondary" className="font-normal">
                {dataCoverage.weatherDays} Wetter-Tage
              </Badge>
            )}
          </div>
        )}

        {/* Key Findings */}
        {keyFindings.length > 0 && (
          <SectionCard title="Wichtigste Erkenntnisse" icon={Lightbulb}>
            <div className="space-y-4">
              {keyFindings.map((finding: any, index: number) => (
                <div key={index} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{finding.title}</h4>
                    {finding.confidence && <ConfidenceBadge confidence={finding.confidence} />}
                  </div>
                  <p className="text-sm">{finding.finding}</p>
                  {finding.evidence && (
                    <p className="text-xs text-muted-foreground italic">Beleg: {finding.evidence}</p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Sections */}
        {sections.map((section: any, index: number) => (
          <SectionCard key={section.id || index} title={section.title} icon={TrendingUp}>
            <div className="space-y-3">
              {section.bullets && section.bullets.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {section.bullets.map((bullet: string, i: number) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              )}
              
              {section.subsections && section.subsections.map((sub: any, i: number) => (
                <div key={i} className="pl-4 border-l-2 border-muted">
                  <h5 className="font-medium text-sm mb-1">{sub.title}</h5>
                  {sub.bullets && (
                    <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
                      {sub.bullets.map((b: string, j: number) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              
              {section.beforeAfter && section.beforeAfter.length > 0 && (
                <div className="space-y-2">
                  {section.beforeAfter.map((ba: any, i: number) => (
                    <div key={i} className="text-sm bg-muted/50 p-3 rounded">
                      <div className="font-medium">{ba.medication}</div>
                      <div className="text-xs text-muted-foreground">{ba.window}</div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                        <div>Vorher: {ba.before}</div>
                        <div>Nachher: {ba.after}</div>
                      </div>
                      {ba.note && <p className="text-xs mt-1 italic">{ba.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        ))}

        {/* Tags */}
        {tags.length > 0 && (
          <SectionCard title="Erkannte Themen" icon={Hash}>
            <div className="flex flex-wrap gap-2">
              {tags.map((t: any, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {t.tag} ({t.count})
                </Badge>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Disclaimer */}
        <Card className="p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-400">
              Dieser Bericht stellt keine medizinische Beratung dar. Besprich die Ergebnisse mit deinem Arzt.
            </p>
          </div>
        </Card>

        {/* Metadata */}
        <div className="text-xs text-muted-foreground text-center pt-4">
          Erstellt am {format(new Date(report.created_at), "d. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de })}
          {report.model && <span className="block mt-1">Modell: {report.model}</span>}
        </div>
      </div>
    </div>
  );
}
