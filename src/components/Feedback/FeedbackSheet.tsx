import React, { useState, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { BUILD_ID } from '@/lib/version';

const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'ux', label: 'UX' },
  { value: 'feature', label: 'Feature' },
  { value: 'other', label: 'Sonstiges' },
] as const;

const SEVERITIES = [
  { value: 'low', label: 'niedrig' },
  { value: 'medium', label: 'mittel' },
  { value: 'high', label: 'hoch' },
] as const;

interface FeedbackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FeedbackSheet: React.FC<FeedbackSheetProps> = ({ open, onOpenChange }) => {
  const isMobile = useIsMobile();
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [includeTechInfo, setIncludeTechInfo] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastSubmitRef = useRef<number>(0);

  const resetForm = () => {
    setMessage('');
    setCategory(null);
    setSeverity(null);
    setContactEmail('');
    setIncludeTechInfo(true);
  };

  const collectTechInfo = () => {
    if (!includeTechInfo) return {};
    
    return {
      route: window.location.pathname,
      user_agent: navigator.userAgent,
      platform: navigator.platform || null,
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: { width: window.innerWidth, height: window.innerHeight },
      build: BUILD_ID || null,
      app_version: null, // Could be added if version constant exists
    };
  };

  const handleSubmit = async () => {
    // Rate limiting: max 1 submit per 3 seconds
    const now = Date.now();
    if (now - lastSubmitRef.current < 3000) {
      return;
    }
    lastSubmitRef.current = now;

    // Require at least message or category
    const finalMessage = message.trim() || (category ? null : '(leer)');

    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Nicht angemeldet');
        return;
      }

      const techInfo = collectTechInfo();
      
      const { error } = await supabase.from('user_feedback').insert({
        user_id: user.id,
        message: finalMessage,
        category,
        severity,
        contact_email: contactEmail.trim() || null,
        include_tech_info: includeTechInfo,
        ...techInfo,
      });

      if (error) throw error;

      toast.success('Gesendet.');
      resetForm();
      
      // Close after short delay
      setTimeout(() => onOpenChange(false), 500);
      
    } catch (error) {
      console.error('Feedback submit error:', error);
      toast.error('Senden fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <div className="space-y-5">
      {/* Message textarea */}
      <div className="space-y-2">
        <Textarea
          placeholder="Was hat dich gestört? Was fehlt? Was lief gut?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-[120px] resize-none"
          autoFocus={!isMobile}
        />
      </div>

      {/* Category chips */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Kategorie (optional)</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(category === cat.value ? null : cat.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                'border',
                category === cat.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Severity chips */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Dringlichkeit (optional)</Label>
        <div className="flex flex-wrap gap-2">
          {SEVERITIES.map((sev) => (
            <button
              key={sev.value}
              type="button"
              onClick={() => setSeverity(severity === sev.value ? null : sev.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                'border',
                severity === sev.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted'
              )}
            >
              {sev.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contact email */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">
          E-Mail (optional) – nur wenn du Rückfragen möchtest
        </Label>
        <Input
          type="email"
          placeholder="deine@email.de"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>

      {/* Tech info checkbox */}
      <div className="flex items-start gap-3">
        <Checkbox
          id="tech-info"
          checked={includeTechInfo}
          onCheckedChange={(checked) => setIncludeTechInfo(!!checked)}
          className="mt-0.5"
        />
        <Label htmlFor="tech-info" className="text-sm text-muted-foreground cursor-pointer">
          Technische Infos mitsenden (hilft beim Debuggen)
        </Label>
      </div>
    </div>
  );

  const footerButtons = (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={isSubmitting}
      >
        Abbrechen
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Sende...' : 'Senden'}
      </Button>
    </>
  );

  // Mobile: Drawer (Bottom Sheet)
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Feedback</DrawerTitle>
            <p className="text-sm text-muted-foreground">
              Teile kurz mit, was gut läuft oder was stört.
            </p>
          </DrawerHeader>
          <div className="px-4 overflow-y-auto flex-1">
            {formContent}
          </div>
          <DrawerFooter className="flex-row gap-2 pt-4">
            {footerButtons}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Dialog (Modal)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Feedback</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Teile kurz mit, was gut läuft oder was stört.
          </p>
        </DialogHeader>
        {formContent}
        <DialogFooter className="gap-2 sm:gap-0">
          {footerButtons}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackSheet;
