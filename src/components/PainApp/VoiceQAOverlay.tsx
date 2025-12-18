/**
 * VoiceQAOverlay - Voice Q&A Dialog für Fragen stellen
 * 
 * Features:
 * - Mikrofon-Eingabe mit Live-Transkript
 * - Text-Fallback wenn kein Mikrofon verfügbar
 * - Chat-ähnliche Antwortdarstellung
 * - Safety-Hinweise bei medizinischen Fragen
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { 
  Mic, 
  MicOff,
  Send,
  X,
  Loader2,
  AlertCircle,
  MessageCircle,
  RefreshCw
} from 'lucide-react';
import { isBrowserSttSupported } from '@/lib/voice/sttConfig';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================
// Types
// ============================================

interface VoiceQAOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnswerReceived?: (answer: QAAnswer) => void;
}

export interface QAAnswer {
  answerShort: string;
  answerBullets?: string[];
  fromYourDataBullets?: string[];
  safetyNote?: string;
  suggestedFollowUps?: string[];
  question: string;
  timestamp: string;
}

// Session storage key
const SESSION_KEY_LAST_QA = 'startpage_last_ai_answer';

// ============================================
// Helper: Detect if input is a question
// ============================================

export function isQuestionIntent(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  // W-Fragen am Anfang
  const wQuestions = /^(wie|was|warum|welche|wann|wo|wieviel|woher|wohin|weshalb|wieso|wer|wen|wem)/;
  if (wQuestions.test(lower)) return true;
  
  // Fragezeichen vorhanden
  if (text.includes('?')) return true;
  
  // Typische Frage-Phrasen
  const questionPhrases = [
    'kannst du',
    'könntest du',
    'zeige mir',
    'zeig mir',
    'analysiere',
    'analysier',
    'erklär',
    'erkläre',
    'was soll ich',
    'was kann ich',
    'was bedeutet',
    'sag mir',
    'hilf mir',
    'hilfe bei',
    'gibt es',
    'habe ich',
    'hatte ich',
    'bin ich',
    'ist das',
    'sind das',
    'stimmt es',
    'meinst du',
    'denkst du',
    'weißt du',
    'verstehst du'
  ];
  
  return questionPhrases.some(phrase => lower.includes(phrase));
}

// ============================================
// Session Storage Helpers
// ============================================

export function saveLastQAToSession(answer: QAAnswer): void {
  try {
    sessionStorage.setItem(SESSION_KEY_LAST_QA, JSON.stringify(answer));
  } catch {
    // Session storage not available
  }
}

export function getLastQAFromSession(): QAAnswer | null {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY_LAST_QA);
    if (stored) {
      return JSON.parse(stored) as QAAnswer;
    }
  } catch {
    // Session storage not available or invalid JSON
  }
  return null;
}

export function clearLastQAFromSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY_LAST_QA);
  } catch {
    // Session storage not available
  }
}

// ============================================
// Component
// ============================================

export function VoiceQAOverlay({
  open,
  onOpenChange,
  onAnswerReceived,
}: VoiceQAOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const autoStartedRef = useRef(false);
  
  // State
  const [committedText, setCommittedText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<QAAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  
  // Hooks
  const isSttSupported = isBrowserSttSupported();

  // ============================================
  // Text Insertion
  // ============================================

  const insertAtCursor = useCallback((insertText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const separator = committedText.length > 0 && !committedText.endsWith(' ') ? ' ' : '';
      setCommittedText(prev => prev + separator + insertText);
      return;
    }

    const start = textarea.selectionStart ?? committedText.length;
    const end = textarea.selectionEnd ?? committedText.length;
    
    const needsSpaceBefore = start > 0 && committedText[start - 1] !== ' ' && !insertText.startsWith(' ');
    const textToInsert = (needsSpaceBefore ? ' ' : '') + insertText;
    
    const newText = committedText.slice(0, start) + textToInsert + committedText.slice(end);
    setCommittedText(newText);
    
    const newCursorPos = start + textToInsert.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [committedText]);

  // ============================================
  // Speech Recognition
  // ============================================

  const startRecording = useCallback(async () => {
    if (!isSttSupported || isRecording) return;

    // Request permission first
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Microphone permission denied:', err);
      setMicPermissionDenied(true);
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setInterimText('');
      setMicPermissionDenied(false);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        insertAtCursor(final.trim());
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Voice recording error:', event.error);
      if (event.error === 'not-allowed') {
        setMicPermissionDenied(true);
      }
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setIsRecording(false);
        setInterimText('');
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, [isSttSupported, isRecording, insertAtCursor]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.stop();
    }
    setIsRecording(false);
    setInterimText('');
  }, []);

  // ============================================
  // Ask Question
  // ============================================

  const askQuestion = useCallback(async () => {
    if (!committedText.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setAnswer(null);
    stopRecording();

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ask-assistant', {
        body: {
          question: committedText.trim(),
          locale: 'de'
        }
      });

      if (fnError) {
        console.error('Ask assistant error:', fnError);
        throw new Error(fnError.message || 'Fehler beim Verarbeiten der Frage');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const qaAnswer: QAAnswer = {
        answerShort: data.answerShort || 'Keine Antwort verfügbar.',
        answerBullets: data.answerBullets,
        fromYourDataBullets: data.fromYourDataBullets,
        safetyNote: data.safetyNote,
        suggestedFollowUps: data.suggestedFollowUps,
        question: committedText.trim(),
        timestamp: new Date().toISOString()
      };

      setAnswer(qaAnswer);
      saveLastQAToSession(qaAnswer);
      onAnswerReceived?.(qaAnswer);

    } catch (err) {
      console.error('Q&A error:', err);
      const message = err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten';
      setError(message);
      toast.error('Fehler', { description: message });
    } finally {
      setIsLoading(false);
    }
  }, [committedText, stopRecording, onAnswerReceived]);

  const handleNewQuestion = useCallback(() => {
    setCommittedText('');
    setAnswer(null);
    setError(null);
    if (isSttSupported && !micPermissionDenied) {
      startRecording();
    }
  }, [isSttSupported, micPermissionDenied, startRecording]);

  // ============================================
  // Lifecycle
  // ============================================

  useEffect(() => {
    if (open && isSttSupported && !autoStartedRef.current && !micPermissionDenied) {
      autoStartedRef.current = true;
      const timer = setTimeout(() => {
        startRecording();
      }, 300);
      return () => clearTimeout(timer);
    }
    
    if (!open) {
      autoStartedRef.current = false;
      stopRecording();
      setCommittedText('');
      setInterimText('');
      setAnswer(null);
      setError(null);
    }
  }, [open, isSttSupported, micPermissionDenied, startRecording, stopRecording]);

  // ============================================
  // Derived State
  // ============================================

  const hasText = committedText.trim().length > 0;
  const displayText = committedText + (interimText ? ` ${interimText}` : '');

  // ============================================
  // Render
  // ============================================

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Frage stellen
          </SheetTitle>
          <SheetDescription>
            Frag mich zu deinen Einträgen oder allgemein zu Migräne.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col h-[calc(100%-80px)] mt-4">
          
          {/* Answer Display */}
          {answer && (
            <div className="flex-1 overflow-y-auto space-y-4 pb-4">
              {/* User Question */}
              <div className="bg-muted rounded-lg p-3 ml-8">
                <p className="text-sm text-muted-foreground mb-1">Deine Frage:</p>
                <p className="text-foreground">{answer.question}</p>
              </div>

              {/* AI Answer */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mr-8 space-y-3">
                <p className="text-foreground">{answer.answerShort}</p>
                
                {/* Details Bullets */}
                {answer.answerBullets && answer.answerBullets.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Details:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {answer.answerBullets.map((bullet, i) => (
                        <li key={i} className="text-foreground">{bullet}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* From Your Data */}
                {answer.fromYourDataBullets && answer.fromYourDataBullets.length > 0 && (
                  <div className="bg-background/50 rounded p-2 space-y-1">
                    <p className="text-xs text-primary font-medium">Aus deinen Daten:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {answer.fromYourDataBullets.map((bullet, i) => (
                        <li key={i} className="text-foreground">{bullet}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Safety Note */}
                {answer.safetyNote && (
                  <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded p-2">
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive">{answer.safetyNote}</p>
                  </div>
                )}

                {/* Disclaimer */}
                <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/50">
                  Kein Ersatz für ärztlichen Rat.
                </p>
              </div>

              {/* New Question Button */}
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={handleNewQuestion}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Neue Frage
                </Button>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !answer && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-destructive mb-2">{error}</p>
                <Button variant="outline" onClick={askQuestion}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Erneut versuchen
                </Button>
              </div>
            </div>
          )}

          {/* Input Area - Only when no answer yet */}
          {!answer && !error && (
            <>
              {/* Mic Permission Warning */}
              {micPermissionDenied && (
                <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mb-4 flex items-start gap-2">
                  <MicOff className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-warning">Mikrofonzugriff nicht erlaubt</p>
                    <p className="text-muted-foreground">Du kannst deine Frage auch tippen.</p>
                  </div>
                </div>
              )}

              {/* Text Input */}
              <div className="flex-1 space-y-3">
                <Textarea
                  ref={textareaRef}
                  value={displayText}
                  onChange={(e) => setCommittedText(e.target.value)}
                  placeholder="Tippe deine Frage…"
                  className="min-h-[100px] resize-none"
                  disabled={isLoading}
                />

                {/* Recording Indicator */}
                {isRecording && (
                  <div className="flex items-center gap-2 text-sm text-voice">
                    <div className="relative flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-voice animate-pulse" />
                      <div className="absolute w-4 h-4 rounded-full bg-voice/30 animate-ping" />
                    </div>
                    <span>Ich höre zu…</span>
                  </div>
                )}

                {/* Loading State */}
                {isLoading && (
                  <div className="flex items-center justify-center gap-2 p-4">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-muted-foreground">Antwort wird erstellt…</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t border-border mt-4">
                {/* Mic Toggle */}
                {isSttSupported && !micPermissionDenied && (
                  <Button
                    variant={isRecording ? "destructive" : "outline"}
                    size="icon"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isLoading}
                    className="shrink-0"
                  >
                    {isRecording ? (
                      <MicOff className="w-5 h-5" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </Button>
                )}

                {/* Send Button */}
                <Button
                  className="flex-1"
                  onClick={askQuestion}
                  disabled={!hasText || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verarbeite…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Senden
                    </>
                  )}
                </Button>

                {/* Close Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                  className="shrink-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
