/**
 * TherapyMedicationPage - Unified medical view
 * 
 * Structure (medically prioritized):
 * 1. Medical KPI Overview (top priority - visible in <10s for doctors)
 * 2. Medication Overview (grouped by role: Prophylaxis, Triptans, Other)
 * 3. Entry List with inline notes (chronological, context as secondary info)
 */
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { useMedicationUsageStats } from "@/features/medication-intakes/hooks/useMedicationIntakes";
import { useActiveMeds } from "@/features/meds/hooks/useMeds";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { TimeRangeSelector } from "@/components/PainApp/TimeRangeSelector";
import { isTriptan as isTriptanMedication } from "@/lib/medications/isTriptan";
import { normalizePainLevel } from "@/lib/utils/pain";
import { formatNumberSmart } from "@/lib/formatters/dateRangeFormatter";
import { format, parseISO, isWithinInterval } from "date-fns";
import { de } from "date-fns/locale";
import { Activity, Pill, TrendingUp, Calendar, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimeRange } from "@/contexts/TimeRangeContext";
import { daysBetweenInclusive } from "@/lib/dateRange/rangeResolver";

interface TherapyMedicationPageProps {
  onBack: () => void;
  onEditEntry?: (entry: any) => void;
}

// getDateRange removed — uses global useTimeRange() now

// KPI Card component
function KPICard({ 
  label, 
  value, 
  subValue, 
  icon: Icon,
  highlight = false 
}: { 
  label: string; 
  value: string | number; 
  subValue?: string;
  icon?: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(
      "transition-colors",
      highlight && "border-warning/50 bg-warning/5"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground">{subValue}</p>
            )}
          </div>
          {Icon && (
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Medication row in overview
function MedicationRow({ 
  name, 
  type, 
  usageCount, 
  avgEffect,
  days
}: { 
  name: string; 
  type: 'prophylaxis' | 'triptan' | 'acute';
  usageCount: number;
  avgEffect?: number | null;
  days: number;
}) {
  const typeLabels = {
    prophylaxis: { label: 'Prophylaxe', color: 'bg-blue-500/10 text-blue-600' },
    triptan: { label: 'Triptan', color: 'bg-orange-500/10 text-orange-600' },
    acute: { label: 'Akut', color: 'bg-muted text-muted-foreground' }
  };
  
  const typeInfo = typeLabels[type];
  const perMonth = days >= 30 ? formatNumberSmart((usageCount / days) * 30) : usageCount;
  
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="font-medium text-sm truncate">{name}</span>
        <Badge variant="outline" className={cn("text-xs shrink-0", typeInfo.color)}>
          {typeInfo.label}
        </Badge>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-sm tabular-nums">
          {usageCount}× <span className="text-muted-foreground text-xs">({perMonth}/Mo)</span>
        </span>
        {avgEffect !== null && avgEffect !== undefined && (
          <Badge variant="secondary" className="text-xs">
            Ø {formatNumberSmart(avgEffect)}/10
          </Badge>
        )}
      </div>
    </div>
  );
}

// Entry row with inline notes
function EntryRow({ 
  entry, 
  onClick 
}: { 
  entry: any;
  onClick?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const painLevel = normalizePainLevel(entry.pain_level) ?? 0;
  const hasNotes = entry.notes && entry.notes.trim().length > 0;
  
  const dateStr = entry.selected_date || entry.timestamp_created?.split('T')[0];
  const timeStr = entry.selected_time || 
    (entry.timestamp_created ? format(parseISO(entry.timestamp_created), 'HH:mm') : '--:--');
  
  const painColor = painLevel >= 8 ? 'bg-red-500' : 
                    painLevel >= 6 ? 'bg-orange-500' :
                    painLevel >= 4 ? 'bg-amber-500' : 
                    'bg-muted-foreground/40';
  
  return (
    <div 
      className={cn(
        "border-b border-border/30 last:border-0 transition-colors",
        onClick && "cursor-pointer hover:bg-accent/30"
      )}
    >
      <div 
        className="flex items-center gap-3 py-2.5 px-1"
        onClick={onClick}
      >
        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", painColor)} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">
              {dateStr ? format(parseISO(dateStr), 'd. MMM', { locale: de }) : '--'}
            </span>
            <span className="text-xs text-muted-foreground">{timeStr}</span>
            <span className="text-xs text-muted-foreground">
              ({painLevel}/10)
            </span>
          </div>
          
          {entry.medications?.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              💊 {entry.medications.join(', ')}
            </p>
          )}
        </div>
        
        {hasNotes && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
      
      {/* Inline notes (collapsible) */}
      {hasNotes && expanded && (
        <div className="pl-6 pr-3 pb-3">
          <div className="p-2.5 rounded-md bg-muted/50 border border-border/30">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Notiz</span>
            </div>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap">
              {entry.notes}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function TherapyMedicationPage({ onBack, onEditEntry }: TherapyMedicationPageProps) {
  const { t } = useTranslation();
  const { from, to } = useTimeRange();
  const [showAllMeds, setShowAllMeds] = React.useState(false);
  
  const days = daysBetweenInclusive(from, to);
  const fromStr = from;
  const toStr = to;
  
  // Fetch data
  const { data: allEntries = [], isLoading: entriesLoading } = useEntries({ limit: 500 });
  const { data: activeMeds = [] } = useActiveMeds();
  const { data: courses = [] } = useMedicationCourses();
  const { data: usageStats = [] } = useMedicationUsageStats(fromStr, toStr);
  
  // Filter entries by time range
  const filteredEntries = useMemo(() => {
    return allEntries.filter(entry => {
      const dateStr = entry.selected_date || entry.timestamp_created?.split('T')[0];
      if (!dateStr) return false;
      return dateStr >= from && dateStr <= to;
    }).sort((a, b) => {
      const dateA = a.selected_date || a.timestamp_created;
      const dateB = b.selected_date || b.timestamp_created;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [allEntries, from, to]);
  
  // Calculate KPIs - KRITISCH: Distinct Schmerztage, nicht Einträge!
  const kpis = useMemo(() => {
    // SCHMERZTAGE = distinct Kalendertage mit mindestens einem Eintrag
    const painDaysSet = new Set<string>();
    filteredEntries.forEach(entry => {
      const dateKey = entry.selected_date || entry.timestamp_created?.split('T')[0];
      if (dateKey) painDaysSet.add(dateKey);
    });
    const painDays = painDaysSet.size;
    
    // Normiert auf 30 Tage
    const painDaysPerMonth = days >= 30 
      ? formatNumberSmart((painDays / days) * 30) 
      : painDays;
    
    // Average pain intensity
    const painLevels = filteredEntries
      .map(e => normalizePainLevel(e.pain_level))
      .filter((l): l is number => l !== null && l > 0);
    const avgIntensity = painLevels.length > 0
      ? painLevels.reduce((a, b) => a + b, 0) / painLevels.length
      : 0;
    
    // TRIPTAN-EINNAHMEN = Anzahl Medikamente die "triptan" im Namen haben
    let triptanIntakes = 0;
    let acuteMedIntakes = 0;
    const triptanDaysSet = new Set<string>();
    const acuteDaysSet = new Set<string>();
    
    filteredEntries.forEach(entry => {
      const dateKey = entry.selected_date || entry.timestamp_created?.split('T')[0];
      
      entry.medications?.forEach(med => {
        // Triptan-Erkennung: Prüfe ob "triptan" im Namen enthalten ist
        if (isTriptanMedication(med)) {
          triptanIntakes++;
          if (dateKey) triptanDaysSet.add(dateKey);
        }
        acuteMedIntakes++;
        if (dateKey) acuteDaysSet.add(dateKey);
      });
    });
    
    const triptanDays = triptanDaysSet.size;
    const acuteMedDays = acuteDaysSet.size;
    
    // Normiert auf 30 Tage
    const triptanPerMonth = days >= 30 
      ? formatNumberSmart((triptanIntakes / days) * 30) 
      : triptanIntakes;
    const acutePerMonth = days >= 30 
      ? formatNumberSmart((acuteMedIntakes / days) * 30) 
      : acuteMedIntakes;
    
    return {
      painDays,
      painDaysPerMonth,
      avgIntensity: formatNumberSmart(avgIntensity),
      triptanIntakes,
      triptanDays,
      triptanPerMonth,
      acuteMedIntakes,
      acuteMedDays,
      acutePerMonth,
      days
    };
  }, [filteredEntries, days]);
  
  // Medication statistics with grouping
  const medicationStats = useMemo(() => {
    // Get prophylaxis meds from courses (type is "prophylaxe" in German)
    const prophylaxisMeds = new Set(
      courses
        .filter(c => c.type === 'prophylaxe' && c.is_active)
        .map(c => c.medication_name.toLowerCase())
    );
    
    // Build usage map from stats
    const usageMap = new Map(
      usageStats.map(s => [s.medication_name.toLowerCase(), s])
    );
    
    // Combine with active meds
    const allMedNames = new Set([
      ...usageStats.map(s => s.medication_name),
      ...activeMeds.map(m => m.name)
    ]);
    
    const result: Array<{
      name: string;
      type: 'prophylaxis' | 'triptan' | 'acute';
      usageCount: number;
      avgEffect: number | null;
    }> = [];
    
    allMedNames.forEach(name => {
      const lowerName = name.toLowerCase();
      const usage = usageMap.get(lowerName);
      const count = usage?.intake_count || 0;
      
      // Determine type
      let type: 'prophylaxis' | 'triptan' | 'acute' = 'acute';
      if (prophylaxisMeds.has(lowerName)) {
        type = 'prophylaxis';
      } else if (isTriptanMedication(name)) {
        type = 'triptan';
      }
      
      // Only include meds that were actually used in this period (or are prophylaxis)
      if (count > 0 || type === 'prophylaxis') {
        result.push({
          name,
          type,
          usageCount: count,
          avgEffect: null // Would need to fetch from medication_effects
        });
      }
    });
    
    // Sort: Prophylaxis first, then Triptans, then Others (by usage count)
    return result.sort((a, b) => {
      const typeOrder = { prophylaxis: 0, triptan: 1, acute: 2 };
      if (typeOrder[a.type] !== typeOrder[b.type]) {
        return typeOrder[a.type] - typeOrder[b.type];
      }
      return b.usageCount - a.usageCount;
    });
  }, [courses, usageStats, activeMeds]);
  
  const visibleMeds = showAllMeds ? medicationStats : medicationStats.slice(0, 5);
  
  return (
    <div className="min-h-screen bg-background">
      <PageHeader 
        title="Therapie & Medikation"
        onBack={onBack}
      />
      
      <div className="container mx-auto p-4 max-w-2xl space-y-6">
        {/* Time Range Selector */}
        <TimeRangeSelector />
        
        {/* Section 1: Medical KPI Overview */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Ärztliche Kurzübersicht
          </h2>
          
          <div className="grid grid-cols-2 gap-3">
            <KPICard
              label="Ø Schmerztage / Monat"
              value={kpis.painDaysPerMonth}
              subValue={`${kpis.painDays} von ${kpis.days} Tagen`}
              icon={Calendar}
              highlight={Number(kpis.painDaysPerMonth) >= 15}
            />
            <KPICard
              label="Ø Triptane / Monat"
              value={kpis.triptanPerMonth}
              subValue={`${kpis.triptanIntakes} Einnahmen gesamt`}
              icon={Pill}
              highlight={Number(kpis.triptanPerMonth) >= 10}
            />
            <KPICard
              label="Ø Intensität"
              value={`${kpis.avgIntensity} / 10`}
              subValue="NRS-Skala"
              icon={Activity}
            />
            <KPICard
              label="Akutmedikation"
              value={kpis.acutePerMonth}
              subValue={`${kpis.acuteMedIntakes} Einnahmen`}
              icon={TrendingUp}
              highlight={Number(kpis.acutePerMonth) >= 15}
            />
          </div>
        </section>
        
        {/* Section 2: Medication Overview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Medikamentenübersicht
            </h2>
            {medicationStats.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowAllMeds(!showAllMeds)}
              >
                {showAllMeds ? 'Weniger' : `Alle ${medicationStats.length}`}
              </Button>
            )}
          </div>
          
          <Card>
            <CardContent className="p-3">
              {visibleMeds.length > 0 ? (
                visibleMeds.map(med => (
                  <MedicationRow
                    key={med.name}
                    name={med.name}
                    type={med.type}
                    usageCount={med.usageCount}
                    avgEffect={med.avgEffect}
                    days={kpis.days}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine Medikamente im Zeitraum
                </p>
              )}
            </CardContent>
          </Card>
        </section>
        
        {/* Section 3: Entry List */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Einträge ({filteredEntries.length})
          </h2>
          
          <Card>
            <CardContent className="p-2">
              {entriesLoading ? (
                <div className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Lade Einträge...</p>
                </div>
              ) : filteredEntries.length > 0 ? (
                filteredEntries.slice(0, 50).map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onClick={onEditEntry ? () => onEditEntry(entry) : undefined}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Keine Einträge im Zeitraum
                </p>
              )}
              
              {filteredEntries.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-3 border-t border-border/30">
                  +{filteredEntries.length - 50} weitere Einträge
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
