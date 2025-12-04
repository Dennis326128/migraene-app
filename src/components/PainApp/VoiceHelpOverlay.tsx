/**
 * Voice Help Overlay
 * Zeigt Beispiel-Sprachbefehle
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
import { Mic, X } from 'lucide-react';
import { VOICE_HELP_EXAMPLES } from '@/lib/voice/navigationIntents';

interface VoiceHelpOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoiceHelpOverlay({ open, onOpenChange }: VoiceHelpOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-voice" />
            Sprachbefehle
          </DialogTitle>
          <DialogDescription>
            Beispiele, was du sagen kannst
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {VOICE_HELP_EXAMPLES.map((category) => (
            <div key={category.category}>
              <h4 className="text-sm font-medium text-foreground mb-2">
                {category.category}
              </h4>
              <ul className="space-y-1.5">
                {category.examples.map((example, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-1.5"
                  >
                    „{example}"
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          className="w-full mt-2"
          onClick={() => onOpenChange(false)}
        >
          <X className="w-4 h-4 mr-2" />
          Schließen
        </Button>
      </DialogContent>
    </Dialog>
  );
}
