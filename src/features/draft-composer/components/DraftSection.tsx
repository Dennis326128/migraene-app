/**
 * DraftSection Component
 * Collapsible section for draft review
 */

import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DraftSectionType } from '../types/draft.types';

interface DraftSectionProps {
  type: DraftSectionType;
  title: string;
  icon?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  hasUncertainty?: boolean;
  uncertaintyHint?: string;
  isRequired?: boolean;
  isEmpty?: boolean;
  children: ReactNode;
}

const SECTION_COLORS: Record<DraftSectionType, string> = {
  attack: 'border-l-red-500',
  medication: 'border-l-blue-500',
  effect: 'border-l-green-500',
  symptoms: 'border-l-purple-500',
  triggers: 'border-l-orange-500',
  notes: 'border-l-slate-500',
  other: 'border-l-gray-500',
};

export function DraftSection({
  type,
  title,
  icon,
  isOpen,
  onToggle,
  onRemove,
  hasUncertainty = false,
  uncertaintyHint,
  isRequired = false,
  isEmpty = false,
  children,
}: DraftSectionProps) {
  return (
    <Card className={cn(
      "border-l-4 transition-all",
      SECTION_COLORS[type],
      hasUncertainty && "bg-yellow-50/50 dark:bg-yellow-950/20"
    )}>
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-1 text-left">
                {icon}
                <CardTitle className="text-base font-medium">
                  {title}
                </CardTitle>
                {isRequired && (
                  <Badge variant="outline" className="text-xs">
                    Pflicht
                  </Badge>
                )}
                {hasUncertainty && (
                  <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    prüfen
                  </Badge>
                )}
                {isEmpty && !isOpen && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    leer
                  </Badge>
                )}
                <span className="ml-auto">
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
              </button>
            </CollapsibleTrigger>
            
            {onRemove && !isRequired && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-2 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          {hasUncertainty && uncertaintyHint && isOpen && (
            <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100/50 dark:bg-yellow-900/30 p-2 rounded flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              {uncertaintyHint}
            </div>
          )}
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="p-4 pt-2">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Uncertainty Field Wrapper
 * Highlights a field that needs confirmation
 */
interface UncertainFieldProps {
  children: ReactNode;
  hint?: string;
  onConfirm?: () => void;
}

export function UncertainField({ children, hint, onConfirm }: UncertainFieldProps) {
  return (
    <div className="relative">
      <div className="border-l-2 border-yellow-400 pl-3 py-1 bg-yellow-50/50 dark:bg-yellow-950/20 rounded-r">
        {children}
        {hint && (
          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {hint}
            {onConfirm && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-xs ml-2"
                onClick={onConfirm}
              >
                Bestätigen
              </Button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
