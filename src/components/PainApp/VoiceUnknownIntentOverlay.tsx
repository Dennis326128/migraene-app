/**
 * Voice Unknown Intent Overlay
 * Zeigt Fallback-Optionen wenn der Sprachbefehl nicht erkannt wurde
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  Mic, 
  PlusCircle, 
  Zap, 
  Pill, 
  Bell, 
  BookOpen,
  HelpCircle,
  X
} from 'lucide-react';

interface VoiceUnknownIntentOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string;
  onSelectAction: (action: 'pain_entry' | 'quick_entry' | 'medication' | 'reminder' | 'diary' | 'note' | 'retry') => void;
}

export function VoiceUnknownIntentOverlay({
  open,
  onOpenChange,
  transcript,
  onSelectAction,
}: VoiceUnknownIntentOverlayProps) {
  const actions = [
    {
      id: 'pain_entry' as const,
      label: 'Migräne-Eintrag',
      description: 'Detaillierte Dokumentation',
      icon: PlusCircle,
      color: 'text-success',
    },
    {
      id: 'quick_entry' as const,
      label: 'Schnell-Eintrag',
      description: 'Kurz & schnell',
      icon: Zap,
      color: 'text-destructive',
    },
    {
      id: 'medication' as const,
      label: 'Medikament',
      description: 'Wirkung bewerten',
      icon: Pill,
      color: 'text-primary',
    },
    {
      id: 'reminder' as const,
      label: 'Erinnerung',
      description: 'Termin/Medikament',
      icon: Bell,
      color: 'text-warning',
    },
    {
      id: 'diary' as const,
      label: 'Tagebuch',
      description: 'Einträge ansehen',
      icon: BookOpen,
      color: 'text-muted-foreground',
    },
    {
      id: 'note' as const,
      label: 'Als Notiz speichern',
      description: 'Für später',
      icon: HelpCircle,
      color: 'text-muted-foreground',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-voice" />
            Nicht sicher verstanden
          </DialogTitle>
          <DialogDescription className="text-left">
            {transcript ? (
              <span className="italic text-foreground/70">„{transcript.substring(0, 80)}{transcript.length > 80 ? '...' : ''}"</span>
            ) : (
              'Bitte wähle eine Aktion aus:'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-4">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto flex-col items-start p-3 gap-1 text-left hover:bg-muted/50"
              onClick={() => {
                onSelectAction(action.id);
                onOpenChange(false);
              }}
            >
              <div className="flex items-center gap-2 w-full">
                <action.icon className={`w-4 h-4 ${action.color}`} />
                <span className="font-medium text-sm">{action.label}</span>
              </div>
              <span className="text-xs text-muted-foreground pl-6">
                {action.description}
              </span>
            </Button>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-4 h-4 mr-2" />
            Abbrechen
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-voice/30 text-voice hover:bg-voice/10"
            onClick={() => {
              onSelectAction('retry');
              onOpenChange(false);
            }}
          >
            <Mic className="w-4 h-4 mr-2" />
            Nochmal sprechen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
