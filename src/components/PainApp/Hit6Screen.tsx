/**
 * HIT-6™ Fragebogen Screen
 * 
 * Offizielles deutsches Format (Version 1.1)
 * 6 Fragen, 5 Antwortoptionen, Score 36-78
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, FileText, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Hit6Answers,
  Hit6Answer,
  Hit6QuestionKey,
  EMPTY_HIT6_ANSWERS,
  HIT6_QUESTIONS,
  HIT6_QUESTION_KEYS,
  HIT6_ANSWER_OPTIONS,
  HIT6_ANSWER_LABELS,
  calculateHit6Score,
  isHit6Complete,
} from '@/features/hit6/hit6.constants';
import { createHit6Assessment } from '@/features/hit6/hit6.api';
import { buildHit6Pdf } from '@/lib/pdf/hit6Report';

interface Hit6ScreenProps {
  onBack: () => void;
}

export default function Hit6Screen({ onBack }: Hit6ScreenProps) {
  const [answers, setAnswers] = useState<Hit6Answers>(EMPTY_HIT6_ANSWERS);
  const [isGenerating, setIsGenerating] = useState(false);

  const answeredCount = useMemo(
    () => HIT6_QUESTION_KEYS.filter((k) => answers[k] !== null).length,
    [answers]
  );

  const score = useMemo(() => calculateHit6Score(answers), [answers]);
  const isComplete = useMemo(() => isHit6Complete(answers), [answers]);

  const handleAnswer = useCallback((questionKey: Hit6QuestionKey, answer: Hit6Answer) => {
    setAnswers((prev) => ({ ...prev, [questionKey]: answer }));
  }, []);

  const handleReset = useCallback(() => {
    setAnswers(EMPTY_HIT6_ANSWERS);
  }, []);

  const handleGeneratePdf = useCallback(async () => {
    if (!isComplete || score === null) {
      toast.error('Bitte alle 6 Fragen beantworten');
      return;
    }

    setIsGenerating(true);
    try {
      // Save assessment to database
      await createHit6Assessment({
        answers,
        score,
      });

      // Generate PDF
      const pdfBytes = await buildHit6Pdf({
        answers,
        score,
        completedDate: new Date(),
      });

      // Download PDF - convert Uint8Array to standard array for Blob compatibility
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `HIT-6_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('HIT-6 PDF erstellt und heruntergeladen');
    } catch (error) {
      console.error('Error generating HIT-6 PDF:', error);
      toast.error('Fehler beim Erstellen des PDFs');
    } finally {
      setIsGenerating(false);
    }
  }, [answers, score, isComplete]);

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">HIT-6 Fragebogen</h1>
            <p className="text-xs text-muted-foreground">{answeredCount}/6 beantwortet</p>
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
            HIT-6™ Fragebogen zu Auswirkungen von Kopfschmerzen
          </h2>
          <p className="text-xs text-muted-foreground">
            Dieser Fragebogen hilft Ihnen, die Auswirkungen Ihrer Kopfschmerzen zu beschreiben und
            Ihrem Arzt/Ihrer Ärztin mitzuteilen. Bezugszeitraum: letzte 4 Wochen.
          </p>
        </Card>

        {/* Questions */}
        {HIT6_QUESTION_KEYS.map((qKey, index) => (
          <QuestionCard
            key={qKey}
            questionKey={qKey}
            questionNumber={index + 1}
            questionText={HIT6_QUESTIONS[qKey]}
            selectedAnswer={answers[qKey]}
            onAnswer={handleAnswer}
          />
        ))}

        {/* Score Display (when complete) */}
        {isComplete && score !== null && (
          <Card className="p-4 border-primary/50 bg-primary/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Gesamtpunktzahl</p>
                <p className="text-xs text-muted-foreground">
                  Eine höhere Punktzahl bedeutet stärkere Auswirkungen (36-78)
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
              HIT-6 PDF erstellen
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
  questionKey: Hit6QuestionKey;
  questionNumber: number;
  questionText: string;
  selectedAnswer: Hit6Answer | null;
  onAnswer: (key: Hit6QuestionKey, answer: Hit6Answer) => void;
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
        {HIT6_ANSWER_OPTIONS.map((option) => (
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
            {HIT6_ANSWER_LABELS[option]}
          </button>
        ))}
      </div>
    </Card>
  );
}
