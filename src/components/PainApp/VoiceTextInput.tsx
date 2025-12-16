/**
 * VoiceTextInput - Reusable component for typing + dictation
 * Cursor-aware, with live interim preview
 */

import React, { useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Save, Trash2 } from 'lucide-react';
import { useVoiceTextInput } from '@/hooks/useVoiceTextInput';
import { cn } from '@/lib/utils';

export interface VoiceTextInputProps {
  onSave: (text: string, source: 'voice' | 'manual' | 'mixed', confidence: number | null) => Promise<void>;
  placeholder?: string;
  minRows?: number;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
}

export const VoiceTextInput: React.FC<VoiceTextInputProps> = ({
  onSave,
  placeholder = 'Tippe oder sprich…',
  minRows = 3,
  maxLength = 5000,
  className,
  disabled = false,
}) => {
  const {
    text,
    setText,
    interimText,
    isRecording,
    isSupported,
    error,
    confidence,
    startRecording,
    stopRecording,
    clear,
    textareaRef,
    getSource,
  } = useVoiceTextInput({ language: 'de-DE' });

  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    
    setIsSaving(true);
    try {
      await onSave(trimmed, getSource(), confidence);
      clear();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, [text, onSave, getSource, confidence, clear]);

  const handleMicClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const canSave = text.trim().length > 0 && !isRecording && !isSaving;
  const canClear = (text.length > 0 || interimText.length > 0) && !isRecording && !isSaving;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Textarea with Mic Button */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || isRecording}
          maxLength={maxLength}
          rows={minRows}
          className={cn(
            'pr-12 resize-none transition-colors',
            isRecording && 'bg-destructive/5 border-destructive/30'
          )}
        />
        
        {/* Mic Button */}
        <Button
          type="button"
          variant={isRecording ? 'destructive' : 'ghost'}
          size="icon"
          onClick={handleMicClick}
          disabled={disabled || !isSupported || isSaving}
          className={cn(
            'absolute right-2 top-2 h-8 w-8',
            !isSupported && 'opacity-50 cursor-not-allowed'
          )}
          title={
            !isSupported 
              ? 'Spracheingabe nicht verfügbar' 
              : isRecording 
                ? 'Aufnahme stoppen' 
                : 'Aufnahme starten'
          }
        >
          {isRecording ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Recording Status */}
      {isRecording && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
          </span>
          <span>Aufnahme läuft…</span>
        </div>
      )}

      {/* Interim Preview */}
      {interimText && (
        <div className="text-sm text-muted-foreground italic px-1 py-1 bg-muted/30 rounded">
          {interimText}
        </div>
      )}

      {/* Error Message */}
      {error && !isRecording && (
        <div className="text-sm text-destructive px-1">
          {error}
        </div>
      )}

      {/* Not Supported Hint */}
      {!isSupported && !error && (
        <div className="text-xs text-muted-foreground">
          Spracheingabe nicht verfügbar. Bitte tippe.
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1"
          size="sm"
        >
          <Save className="h-4 w-4 mr-2" />
          Speichern
        </Button>
        
        <Button
          variant="outline"
          onClick={clear}
          disabled={!canClear}
          size="sm"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Leeren
        </Button>
      </div>

      {/* Character Count */}
      {text.length > maxLength * 0.8 && (
        <div className="text-xs text-muted-foreground text-right">
          {text.length} / {maxLength}
        </div>
      )}
    </div>
  );
};
