/**
 * Daily Impact Check Screen
 * Alltagsbelastung durch Kopfschmerzen - Selbsteinschätzung
 * 
 * WICHTIG: Rechtssichere Alternative zum HIT-6
 * - Eigene 7 Fragen
 * - Eigene Skala 0-4
 * - Optional: Externen HIT-6 Gesamtwert speichern (ohne Accordion, inline)
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { ArrowLeft, FileText, RotateCcw, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  const [showValidationModal, setShowValidationModal] = useState(false);
  
  const hit6InputRef = useRef<HTMLInputElement>(null);
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
  }, []);

  // Validierung nur beim Speichern - gibt null zurück wenn leer, Zahl wenn gültig, oder false wenn ungültig
  const validateExternalHit6 = useCallback((): number | null | false => {
    const trimmed = externalHit6Score.trim();
    if (trimmed === '') return null; // Leer ist ok
    
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 36 || num > 78) {
      return false; // Ungültig
    }
    return num; // Gültig
  }, [externalHit6Score]);

  const handleValidationModalClose = useCallback(() => {
    setShowValidationModal(false);
    // Fokus zurück zum HIT-6 Feld
    setTimeout(() => {
      hit6InputRef.current?.focus();
      hit6InputRef.current?.select();
    }, 100);
  }, []);

  const handleGeneratePdf = useCallback(async () => {
    if (!isComplete || score === null) {
      toast.error('Bitte alle 7 Fragen beantworten');
      return;
    }

    // Validierung des externen HIT-6 Werts erst hier
    const validatedHit6 = validateExternalHit6();
    if (validatedHit6 === false) {
      // Ungültiger Wert - Modal zeigen, KEINE Daten resetten
      setShowValidationModal(true);
      return;
    }

    setIsGenerating(true);
    try {
      const completedDate = new Date();
      // Zeitraum: letzte 4 Wochen (28 Tage)
      const periodEndDate = new Date();
      const periodStartDate = new Date();
      periodStartDate.setDate(periodStartDate.getDate() - 28);
      
      // Save assessment to database
      await createDailyImpactAssessment({
        answers,
        score,
        external_hit6_score: validatedHit6,
        external_hit6_date: validatedHit6 ? new Date().toISOString().slice(0, 10) : null,
      });

      // Generate PDF
      const pdfBytes = await buildDailyImpactPdf({
        answers,
        score,
        completedDate,
        externalHit6Score: validatedHit6,
        externalHit6Date: validatedHit6 ? completedDate : null,
      });

      // Save to report history
      await saveReport.mutateAsync({
        report_type: 'daily_impact',
        title: 'Alltagsbelastung (Kurzcheck)',
        pdf_bytes: pdfBytes,
        metadata: {
          score,
          category: getImpactCategory(score),
          external_hit6_score: validatedHit6,
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
  }, [answers, score, isComplete, validateExternalHit6, saveReport]);

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
            Bezugszeitraum: die letzten 4 Wochen
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Damit Veränderungen schnell sichtbar werden.
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

        {/* Optional External HIT-6 - Simple Inline Row (NO Accordion) */}
        <div className="pt-2 pb-4 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Label htmlFor="hit6-score" className="text-sm font-medium">
                HIT-6 Gesamtwert (optional)
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Nur eintragen, wenn du ihn von deiner Praxis hast.
              </p>
            </div>
            <Input
              ref={hit6InputRef}
              id="hit6-score"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={externalHit6Score}
              onChange={(e) => {
                // Nur Zahlen erlauben
                const val = e.target.value.replace(/[^0-9]/g, '');
                setExternalHit6Score(val);
              }}
              placeholder="z.B. 56"
              className="w-32 h-10 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
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

      {/* Validation Modal for Invalid HIT-6 Value */}
      <AlertDialog open={showValidationModal} onOpenChange={setShowValidationModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>HIT-6 Wert prüfen</AlertDialogTitle>
            <AlertDialogDescription>
              Der HIT-6 Gesamtwert liegt normalerweise zwischen 36 und 78. Bitte prüfe deine Eingabe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleValidationModalClose}>
              Verstanden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
