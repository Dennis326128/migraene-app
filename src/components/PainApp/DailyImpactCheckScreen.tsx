/**
 * Daily Impact Check Screen
 * Alltagsbelastung durch Kopfschmerzen – eigenständige Miary-Selbsteinschätzung.
 *
 * Hinweis: Dies ist KEIN HIT-6. Es werden weder HIT-6-Werte erhoben noch
 * HIT-6-Interpretationen verwendet. Eigene 7 Fragen, eigene Skala 0–4.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { FileText, RotateCcw, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppHeader } from "@/components/ui/app-header";
import { Card } from '@/components/ui/card';
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
  }, []);

  const handleGeneratePdf = useCallback(async () => {
    if (!isComplete || score === null) {
      toast.error('Bitte alle 7 Fragen beantworten');
      return;
    }

    setIsGenerating(true);
    try {
      const completedDate = new Date();

      // Save assessment to database
      await createDailyImpactAssessment({
        answers,
        score,
        external_hit6_score: null,
        external_hit6_date: null,
      });

      // Generate PDF
      const pdfBytes = await buildDailyImpactPdf({
        answers,
        score,
        completedDate,
      });

      // Save to report history
      await saveReport.mutateAsync({
        report_type: 'daily_impact',
        title: 'Alltagsbelastung (Kurzcheck)',
        pdf_bytes: pdfBytes,
        metadata: {
          score,
          category: getImpactCategory(score),
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
  }, [answers, score, isComplete, saveReport]);

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <AppHeader
        title="Alltagsbelastung"
        subtitle={`${answeredCount}/7 beantwortet`}
        onBack={onBack}
        sticky
        action={
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RotateCcw className="h-4 w-4 mr-1" />
            Zurücksetzen
          </Button>
        }
      />

      <div className="px-4 py-4 space-y-4">
        {/* Info Card */}
        <Card className="p-4 bg-card/50">
          <h2 className="font-semibold text-sm mb-2">
            Alltagsbelastung durch Kopfschmerzen
          </h2>
          <p className="text-xs text-muted-foreground">
            Kurze Selbsteinschätzung, wie stark Kopfschmerzen deinen Alltag beeinflussen.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Bezugszeitraum: die letzten 4 Wochen.
          </p>
          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Diese Einschätzung ersetzt keinen standardisierten Fragebogen.
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

function QuestionCard({ questionNumber, questionText, selectedAnswer, onAnswer, questionKey }: QuestionCardProps) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium mb-3">
        {questionNumber}. {questionText}
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {DAILY_IMPACT_ANSWER_OPTIONS.map((option) => {
          const isSelected = selectedAnswer === option;
          return (
            <button
              key={option}
              onClick={() => onAnswer(questionKey, option)}
              className={`
                py-2 px-1 rounded-md text-xs font-medium transition-colors
                ${isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-foreground'}
              `}
            >
              {DAILY_IMPACT_ANSWER_LABELS[option]}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
