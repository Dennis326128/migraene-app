/**
 * Daily Impact Check Screen
 * Alltagsbelastung durch Kopfschmerzen - Selbsteinschätzung
 * 
 * WICHTIG: Rechtssichere Alternative zum HIT-6
 * - Eigene 7 Fragen
 * - Eigene Skala 0-4
 * - Optional: Externen HIT-6 Gesamtwert speichern
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, FileText, RotateCcw, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import {
  DailyImpactAnswers,
  DailyImpactAnswer,
  DailyImpactQuestionKey,
  EMPTY_DAILY_IMPACT_ANSWERS,
  DAILY_IMPACT_QUESTIONS,
  DAILY_IMPACT_QUESTION_KEYS,
  DAILY_IMPACT_ANSWER_OPTIONS,
  DAILY_IMPACT_ANSWER_LABELS,
  calculateDailyImpactScore,
  isDailyImpactComplete,
  getImpactCategory,
  IMPACT_CATEGORY_LABELS,
} from '@/features/daily-impact';
import { createDailyImpactAssessment } from '@/features/daily-impact/dailyImpact.api';
import { buildDailyImpactPdf } from '@/lib/pdf/dailyImpactReport';
import { useSaveGeneratedReport } from '@/features/reports';

interface DailyImpactCheckScreenProps {
  onBack: () => void;
}

export default function DailyImpactCheckScreen({ onBack }: DailyImpactCheckScreenProps) {
  const [answers, setAnswers] = useState<DailyImpactAnswers>(EMPTY_DAILY_IMPACT_ANSWERS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [externalHit6Score, setExternalHit6Score] = useState<string>('');
  const [externalHit6Date, setExternalHit6Date] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [showExternalHit6, setShowExternalHit6] = useState(false);
  
  const saveReport = useSaveGeneratedReport();

  const answeredCount = useMemo(
    () => DAILY_IMPACT_QUESTION_KEYS.filter((k) => answers[k] !== null).length,
    [answers]
  );

  const score = useMemo(() => calculateDailyImpactScore(answers), [answers]);
  const isComplete = useMemo(() => isDailyImpactComplete(answers), [answers]);

  const handleAnswer = useCallback((questionKey: DailyImpactQuestionKey, answer: DailyImpactAnswer) => {
    setAnswers((prev) => ({ ...prev, [questionKey]: answer }));
  }, []);

  const handleReset = useCallback(() => {
    setAnswers(EMPTY_DAILY_IMPACT_ANSWERS);
    setExternalHit6Score('');
    setShowExternalHit6(false);
  }, []);

  const parsedExternalHit6 = useMemo(() => {
    const num = parseInt(externalHit6Score, 10);
    if (isNaN(num) || num < 36 || num > 78) return null;
    return num;
  }, [externalHit6Score]);

  const handleGeneratePdf = useCallback(async () => {
    if (!isComplete || score === null) {
      toast.error('Bitte alle 7 Fragen beantworten');
      return;
    }

    setIsGenerating(true);
    try {
      const completedDate = new Date();
      const externalHit6DateParsed = externalHit6Date ? new Date(externalHit6Date) : null;
      
      // Save assessment to database
      await createDailyImpactAssessment({
        answers,
        score,
        external_hit6_score: parsedExternalHit6,
        external_hit6_date: parsedExternalHit6 ? externalHit6Date : null,
      });

      // Generate PDF
      const pdfBytes = await buildDailyImpactPdf({
        answers,
        score,
        completedDate,
        externalHit6Score: parsedExternalHit6,
        externalHit6Date: parsedExternalHit6 ? externalHit6DateParsed : null,
      });

      // Save to report history
      await saveReport.mutateAsync({
        report_type: 'daily_impact',
        title: 'Alltagsbelastung (Kurzcheck)',
        pdf_bytes: pdfBytes,
        metadata: {
          score,
          category: getImpactCategory(score),
          external_hit6_score: parsedExternalHit6,
        },
      });

      // Download PDF
      const blob = new Blob([new Uint8Array(pdfBytes).buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Alltagsbelastung_${completedDate.toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('PDF erstellt und heruntergeladen');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Fehler beim Erstellen des PDFs');
    } finally {
      setIsGenerating(false);
    }
  }, [answers, score, isComplete, parsedExternalHit6, externalHit6Date, saveReport]);

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Alltagsbelastung</h1>
            <p className="text-xs text-muted-foreground">{answeredCount}/7 beantwortet</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RotateCcw className="h-4 w-4 mr-1" />
            Zurücksetzen
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Info Card */}
        <Card className="p-4 bg-card/50">
          <h2 className="font-semibold text-sm mb-2">
            Alltagsbelastung durch Kopfschmerzen
          </h2>
          <p className="text-xs text-muted-foreground">
            Selbsteinschätzung der letzten 4 Wochen – für Arztgespräch & Verlauf.
          </p>
          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Diese Einschätzung ersetzt keinen lizenzierten Test. Sie hilft, Auswirkungen strukturiert zu dokumentieren.
          </p>
        </Card>

        {/* Questions */}
        {DAILY_IMPACT_QUESTION_KEYS.map((qKey, index) => (
          <QuestionCard
            key={qKey}
            questionKey={qKey}
            questionNumber={index + 1}
            questionText={DAILY_IMPACT_QUESTIONS[qKey]}
            selectedAnswer={answers[qKey]}
            onAnswer={handleAnswer}
          />
        ))}

        {/* Score Display (when complete) */}
        {isComplete && score !== null && (
          <Card className="p-4 border-primary/50 bg-primary/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Kurzcheck-Score</p>
                <p className="text-xs text-muted-foreground">
                  {IMPACT_CATEGORY_LABELS[getImpactCategory(score)]} (0-28)
                </p>
              </div>
              <div className="text-3xl font-bold text-primary">{score}</div>
            </div>
          </Card>
        )}

        {/* Optional External HIT-6 */}
        <Collapsible open={showExternalHit6} onOpenChange={setShowExternalHit6}>
          <Card className="p-4">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between text-left">
                <div>
                  <p className="text-sm font-medium">Optional: externen HIT-6 Gesamtwert eintragen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Wenn du den HIT-6 von deiner Praxis hast
                  </p>
                </div>
                {showExternalHit6 ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Wenn du den HIT-6 von deiner Praxis auf Papier/als PDF ausgefüllt hast, 
                kannst du hier die Gesamtpunktzahl übernehmen.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hit6-score" className="text-xs">
                    Gesamtpunktzahl (36–78)
                  </Label>
                  <Input
                    id="hit6-score"
                    type="number"
                    min={36}
                    max={78}
                    value={externalHit6Score}
                    onChange={(e) => setExternalHit6Score(e.target.value)}
                    placeholder="z.B. 56"
                    className="h-9"
                  />
                  {externalHit6Score && !parsedExternalHit6 && (
                    <p className="text-xs text-destructive">Wert muss zwischen 36 und 78 liegen</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hit6-date" className="text-xs">
                    Datum der Erhebung
                  </Label>
                  <Input
                    id="hit6-date"
                    type="date"
                    value={externalHit6Date}
                    onChange={(e) => setExternalHit6Date(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4">
        <Button
          onClick={handleGeneratePdf}
          disabled={!isComplete || isGenerating}
          size="lg"
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              PDF wird erstellt…
            </>
          ) : (
            <>
              <FileText className="mr-2 h-5 w-5" />
              PDF erstellen
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Question Card Component
// ═══════════════════════════════════════════════════════════════════════════

interface QuestionCardProps {
  questionKey: DailyImpactQuestionKey;
  questionNumber: number;
  questionText: string;
  selectedAnswer: DailyImpactAnswer | null;
  onAnswer: (key: DailyImpactQuestionKey, answer: DailyImpactAnswer) => void;
}

function QuestionCard({
  questionKey,
  questionNumber,
  questionText,
  selectedAnswer,
  onAnswer,
}: QuestionCardProps) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium mb-3">
        <span className="text-primary mr-2">{questionNumber}.</span>
        {questionText}
      </p>
      <div className="flex flex-wrap gap-2">
        {DAILY_IMPACT_ANSWER_OPTIONS.map((option) => (
          <button
            key={option}
            onClick={() => onAnswer(questionKey, option)}
            className={`
              px-3 py-2 text-xs font-medium rounded-full border transition-colors
              ${
                selectedAnswer === option
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:border-primary/50 hover:bg-accent'
              }
            `}
          >
            {DAILY_IMPACT_ANSWER_LABELS[option]}
          </button>
        ))}
      </div>
    </Card>
  );
}
