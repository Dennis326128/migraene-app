/**
 * QueryResultCard - Zeigt Ergebnisse von Voice-Queries an
 * 
 * Unterstützt verschiedene Ergebnis-Typen:
 * - single: Ein einzelner Wert (z.B. "Vor 3 Tagen")
 * - count: Eine Zahl (z.B. "7 Tage")
 * - average: Ein Durchschnitt (z.B. "5.2")
 * - list: Eine Liste von Einträgen
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Calendar, 
  Hash, 
  TrendingUp, 
  List,
  ExternalLink,
  RefreshCw,
  Check
} from 'lucide-react';
import type { QueryResult, PlanAction } from '@/lib/voice/planner/types';

interface QueryResultCardProps {
  headline: string;
  result: QueryResult;
  actions?: PlanAction[];
  onAction?: (action: PlanAction) => void;
  onAskAnother?: () => void;
  onClose?: () => void;
}

export function QueryResultCard({
  headline,
  result,
  actions,
  onAction,
  onAskAnother,
  onClose,
}: QueryResultCardProps) {
  // Icon based on result type
  const getIcon = () => {
    switch (result.type) {
      case 'single': return Calendar;
      case 'count': return Hash;
      case 'average': return TrendingUp;
      case 'list': return List;
      default: return Calendar;
    }
  };
  
  const Icon = getIcon();
  
  // Format the main value display
  const renderMainValue = () => {
    switch (result.type) {
      case 'single':
        if (result.entry) {
          return (
            <div className="space-y-1">
              <p className="text-2xl font-semibold text-foreground">
                {result.entry.date}
                {result.entry.time && ` um ${result.entry.time}`}
              </p>
              {result.entry.painLevel && (
                <p className="text-sm text-muted-foreground">
                  Stärke: {result.entry.painLevel}/10
                </p>
              )}
              {result.entry.medications?.length ? (
                <p className="text-sm text-muted-foreground">
                  Mit: {result.entry.medications.join(', ')}
                </p>
              ) : null}
            </div>
          );
        }
        return <p className="text-lg text-foreground">{result.message}</p>;
        
      case 'count':
        return (
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-primary">
              {result.count}
            </span>
            <span className="text-lg text-muted-foreground">
              Tage
            </span>
          </div>
        );
        
      case 'average':
        return (
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-primary">
              {result.average?.toFixed(1)}
            </span>
            <span className="text-lg text-muted-foreground">
              Durchschnitt
            </span>
          </div>
        );
        
      case 'list':
        if (result.entries?.length) {
          return (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {result.entries.slice(0, 5).map((entry, i) => (
                <div 
                  key={entry.id} 
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <span className="text-sm">{entry.date}</span>
                  {entry.painLevel && (
                    <span className="text-sm font-medium">
                      Stärke {entry.painLevel}
                    </span>
                  )}
                </div>
              ))}
              {result.entries.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">
                  + {result.entries.length - 5} weitere
                </p>
              )}
            </div>
          );
        }
        return <p className="text-lg text-foreground">{result.message}</p>;
        
      default:
        return <p className="text-lg text-foreground">{result.message}</p>;
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Result Card */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
        {/* Headline */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          <Icon className="w-4 h-4" />
          <span>{headline}</span>
        </div>
        
        {/* Main Value */}
        {renderMainValue()}
        
        {/* Additional message if not shown above */}
        {result.type !== 'list' && result.message && !result.entry && (
          <p className="text-sm text-muted-foreground">
            {result.message}
          </p>
        )}
      </div>
      
      {/* Custom actions from plan */}
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              onClick={() => onAction?.(action)}
            >
              {action.label}
              {action.action === 'close' && <Check className="w-4 h-4 ml-2" />}
            </Button>
          ))}
        </div>
      )}
      
      {/* Default actions */}
      <div className="flex gap-2">
        {onAskAnother && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={onAskAnother}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Weitere Frage
          </Button>
        )}
        {onClose && (
          <Button
            variant="default"
            className="flex-1"
            onClick={onClose}
          >
            <Check className="w-4 h-4 mr-2" />
            Fertig
          </Button>
        )}
      </div>
    </div>
  );
}
