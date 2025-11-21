import React, { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { PainEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { buildDiaryPdf } from "@/lib/pdf/report"; // ← STANDARD-REPORT für Krankenkasse/Ärzte
import { getUserSettings, upsertUserSettings } from "@/features/settings/api/settings.api";
import { mapTextLevelToScore } from "@/lib/utils/pain";
import { useMedicationEffectsForEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import MedicationStatisticsCard from "./MedicationStatisticsCard";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { TimeRangeButtons, type TimeRangePreset } from "./TimeRangeButtons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * DiaryReport - PDF-Export-Komponente für Kopfschmerztagebuch
 * 
 * Flow:
 * 1. User wählt Zeitraum, Medikamente und Inhalte (Checkboxen)
 * 2. Daten werden aus Supabase geladen (pain_entries, medication_effects, patient_data, doctors)
 * 3. Bei PDF-Erstellung wird buildDiaryPdf() aus src/lib/pdf/report.ts aufgerufen
 * 4. Optional: Kurzer Arzt-KI-Bericht via generate-doctor-summary Edge Function
 * 5. PDF wird als Blob heruntergeladen
 * 
 * Report-Builder: buildDiaryPdf (report.ts) - für Krankenkasse & Ärzte
 */

type Preset = TimeRangePreset;

function addMonths(d: Date, m: number) {
  const dd = new Date(d);
  dd.setMonth(dd.getMonth() + m);
  return dd;
}
function fmt(d: Date) { return d.toISOString().slice(0,10); }

function mapEffectToNumber(rating: string): number {
  const map: Record<string, number> = {
    'none': 0,
    'poor': 2.5,
    'moderate': 5,
    'good': 7.5,
    'very_good': 10
  };
  return map[rating] || 0;
}

export default function DiaryReport({ onBack, onNavigate }: { onBack: () => void; onNavigate?: (target: string) => void }) {
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<Preset>("3m");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>(fmt(today));
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [medOptions, setMedOptions] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState<string>("");
  
  // Content inclusion flags
  const [includeStats, setIncludeStats] = useState<boolean>(true);
  const [includeChart, setIncludeChart] = useState<boolean>(true);
  const [includeAnalysis, setIncludeAnalysis] = useState<boolean>(false);
  const [includeEntriesList, setIncludeEntriesList] = useState<boolean>(true);
  const [includePatientData, setIncludePatientData] = useState<boolean>(false);
  const [includeDoctorData, setIncludeDoctorData] = useState<boolean>(false);
  
  const [generated, setGenerated] = useState<PainEntry[]>([]);
  const [previousSelection, setPreviousSelection] = useState<string[]>([]);
  const [allSelected, setAllSelected] = useState<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [analysisReport, setAnalysisReport] = useState<string>("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showMissingDataDialog, setShowMissingDataDialog] = useState(false);

  const { data: patientData } = usePatientData();
  const { data: doctors = [] } = useDoctors();

  // Load user email
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setUserEmail(data.user.email);
      }
    });
  }, []);

  // Load report settings from database
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: settings } = await supabase
          .from("user_report_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (settings) {
          // Load time range
          if (settings.default_report_preset && (["3m","6m","12m","custom"] as const).includes(settings.default_report_preset as any)) {
            setPreset(settings.default_report_preset as Preset);
          }
          
          // Load medication selection
          if (settings.selected_medications && Array.isArray(settings.selected_medications)) {
            setSelectedMeds(settings.selected_medications);
          }
          
          // Load content inclusion flags
          if (settings.include_statistics !== null) setIncludeStats(settings.include_statistics);
          if (settings.include_chart !== null) setIncludeChart(settings.include_chart);
          if (settings.include_ai_analysis !== null) setIncludeAnalysis(settings.include_ai_analysis);
          if (settings.include_entries_list !== null) setIncludeEntriesList(settings.include_entries_list);
          if (settings.include_patient_data !== null) setIncludePatientData(settings.include_patient_data);
          if (settings.include_doctor_data !== null) setIncludeDoctorData(settings.include_doctor_data);
        }
      } catch (error) {
        console.error("Error loading report settings:", error);
      }
    })();
  }, []);

  // berechneter Zeitraum
  const { from, to } = useMemo(() => {
    if (preset === "custom" && customStart && customEnd) {
      return { from: customStart, to: customEnd };
    }
    const end = fmt(today);
    const start =
      preset === "3m" ? fmt(addMonths(new Date(today), -3)) :
      preset === "6m" ? fmt(addMonths(new Date(today), -6)) :
      fmt(addMonths(new Date(today), -12));
    return { from: start, to: end };
  }, [preset, customStart, customEnd, today]);

  // Einträge laden
  const { data: entries = [], isLoading } = useEntries({ from, to });

  // Medication effects für Statistiken laden
  const entryIds = useMemo(() => entries.map(e => Number(e.id)), [entries]);
  const { data: medicationEffects = [] } = useMedicationEffectsForEntries(entryIds);

  // Save all report settings to database (debounced)
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        await supabase
          .from("user_report_settings")
          .upsert({
            user_id: user.id,
            selected_medications: selectedMeds,
            include_statistics: includeStats,
            include_chart: includeChart,
            include_ai_analysis: includeAnalysis,
            include_entries_list: includeEntriesList,
            include_patient_data: includePatientData,
            include_doctor_data: includeDoctorData,
          }, { onConflict: "user_id" });
      } catch (error) {
        console.error("Error saving report settings:", error);
      }
    }, 1000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [selectedMeds, includeStats, includeChart, includeAnalysis, includeEntriesList, includePatientData, includeDoctorData]);

  // Medikamenten-Optionen (aus user_medications, Fallback: aus Einträgen)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("user_medications")
        .select("name")
        .eq("user_id", user.id);
      if (!error && data?.length) {
        setMedOptions(Array.from(new Set(data.map(d => d.name))).sort());
      } else {
        // Fallback: aus Einträgen ableiten
        const uniq = new Set<string>();
        entries.forEach(e => (e.medications || []).forEach(m => uniq.add(m)));
        setMedOptions(Array.from(uniq).sort());
      }
    })();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    // Wenn keine Medikamente ausgewählt: ALLE Einträge zurückgeben
    if (selectedMeds.length === 0) {
      return entries;
    }
    
    // Wenn Medikamente ausgewählt: Einträge mit diesen Medikamenten ODER ohne Medikamente (immer einbeziehen)
    const medsSet = new Set(selectedMeds);
    return entries.filter(e => {
      const meds = e.medications || [];
      return meds.some(m => medsSet.has(m)) || meds.length === 0;
    });
  }, [entries, selectedMeds]);

  const avgPain = useMemo(() => {
    if (!filteredEntries.length) return 0;
    const validEntries = filteredEntries.filter(e => {
      const score = mapTextLevelToScore(e.pain_level);
      return score > 0; // Exclude zero values from average
    });
    if (!validEntries.length) return 0;
    const sum = validEntries.reduce((s, e) => s + mapTextLevelToScore(e.pain_level), 0);
    return (sum / validEntries.length).toFixed(2);
  }, [filteredEntries]);

  // Medikamenten-Statistiken berechnen
  const medicationStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalEffect: number; ratedCount: number }>();
    
    filteredEntries.forEach(entry => {
      entry.medications?.forEach(med => {
        if (!stats.has(med)) {
          stats.set(med, { count: 0, totalEffect: 0, ratedCount: 0 });
        }
        const s = stats.get(med)!;
        s.count++;
        
        // Finde Wirkung für dieses Medikament in diesem Eintrag
        const effect = medicationEffects.find(e => 
          e.entry_id === Number(entry.id) && e.med_name === med
        );
        
        if (effect) {
          s.totalEffect += mapEffectToNumber(effect.effect_rating);
          s.ratedCount++;
        }
      });
    });
    
    return Array.from(stats.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      avgEffect: data.ratedCount > 0 ? data.totalEffect / data.ratedCount : null,
      ratedCount: data.ratedCount
    }));
  }, [filteredEntries, medicationEffects]);

  const formatGermanDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  };

  const ensureAnalysisReport = async (): Promise<string> => {
    // Wenn Analyse nicht aktiviert, nichts tun
    if (!includeAnalysis) return "";
    
    // Wenn bereits vorhanden, zurückgeben
    if (analysisReport) return analysisReport;
    
    // Kurzen Arztbericht generieren (statt langer Analyse)
    setIsGeneratingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-doctor-summary', {
        body: { 
          fromDate: `${from}T00:00:00Z`, 
          toDate: `${to}T23:59:59Z`
        }
      });

      if (error) throw error;
      if (data.error) {
        console.error('AI-Kurzbericht Fehler:', data.error);
        return "";
      }

      const report = data.summary || "";
      setAnalysisReport(report);
      return report;
    } catch (error) {
      console.error('Fehler beim Generieren des Kurzberichts:', error);
      return "";
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const printPDF = async () => {
    if (!filteredEntries.length) {
      toast.error("Keine Einträge zum Drucken gefunden.");
      return;
    }
    
    setIsGeneratingReport(true);
    try {
      // Analysebericht sicherstellen (falls aktiviert)
      const currentReport = await ensureAnalysisReport();
      
      const win = window.open("", "_blank");
      if (!win) return;
      const style = `
      <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      h2 { font-size: 16px; margin: 16px 0 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
      thead { background: #f3f4f6; }
      small { color: #6b7280; }
      </style>
    `;
    const dateRange = `${formatGermanDate(from)} bis ${formatGermanDate(to)}`;
    const header = `
      <h1>Kopfschmerztagebuch</h1>
      <small>Zeitraum: ${dateRange}${selectedMeds.length ? ` • Medikamente: ${selectedMeds.join(", ")}` : ""}</small>
      <h2>Übersicht</h2>
      <div>Einträge: ${filteredEntries.length}</div>
      <div>Durchschnittliches Schmerzlevel: ${avgPain}</div>
      <h2>Einträge</h2>
    `;
    const rows = filteredEntries.map(e => {
      const dt = e.selected_date && e.selected_time
        ? `${e.selected_date} ${e.selected_time}`
        : new Date(e.timestamp_created).toLocaleString();
      const meds = (e.medications || []).join(", ") || "–";
      const painScore = mapTextLevelToScore(e.pain_level);
      return `<tr>
        <td>${dt}</td>
        <td>${painScore}</td>
        <td>${meds}</td>
        <td>${e.notes ?? "–"}</td>
      </tr>`;
    }).join("");
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Kopfschmerztagebuch</title>
        ${style}
      </head>
      <body>
      ${header}
      <table>
        <thead><tr><th>Datum/Zeit</th><th>Schmerz</th><th>Medikamente</th><th>Notiz</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </body>
      </html>
    `;
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const exportCSV = () => {
    if (!filteredEntries.length) return;
    const header = ["Datum/Zeit","Schmerzlevel","Medikamente","Notiz"];
    const rows = filteredEntries.map(e => {
      const dt = e.selected_date && e.selected_time
        ? `${e.selected_date} ${e.selected_time}`
        : new Date(e.timestamp_created).toLocaleString();
      const meds = (e.medications || []).join("; ");
      const note = (e.notes ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
      return [dt, e.pain_level, meds, `"${note}"`];
    });
    const lines = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + lines], { type: "text/csv;charset=utf-8" }); // BOM für Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kopfschmerztagebuch_${from}_bis_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const savePDF = async () => {
    if (!filteredEntries.length) {
      toast.error("Keine Einträge im ausgewählten Zeitraum gefunden.");
      return;
    }

    // Check if user wants to include data but hasn't set it up
    if ((includePatientData || includeDoctorData) && 
        (!patientData?.first_name && !patientData?.last_name && doctors.length === 0)) {
      setShowMissingDataDialog(true);
      return;
    }
    
    setIsGeneratingReport(true);
    try {
      // Analysebericht sicherstellen (falls aktiviert)
      const currentReport = await ensureAnalysisReport();
    
      const bytes = await buildDiaryPdf({
        title: "Kopfschmerztagebuch",
        from, to,
        entries: filteredEntries,
        selectedMeds,
        
        // Content flags - direkt von Checkboxen
        includeStats,
        includeChart,
        includeAnalysis,
        includeEntriesList,
        includePatientData,  // NEU: an Builder übergeben
        includeDoctorData,   // NEU: an Builder übergeben
        
        analysisReport: currentReport || undefined,
        medicationStats: includeStats ? medicationStats : undefined,
        patientData: patientData ? {
          firstName: patientData?.first_name,
          lastName: patientData?.last_name,
          street: patientData?.street,
          postalCode: patientData?.postal_code,
          city: patientData?.city,
          phone: patientData?.phone,
          email: userEmail,
          dateOfBirth: patientData?.date_of_birth,
        } : undefined,
        doctors: doctors.length > 0 ? doctors.map(d => ({
          firstName: d.first_name,
          lastName: d.last_name,
          specialty: d.specialty,
          street: d.street,
          postalCode: d.postal_code,
          city: d.city,
          phone: d.phone,
          email: d.email,
        })) : undefined,
      });
      
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kopfschmerztagebuch_${from}_bis_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF wurde heruntergeladen");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button 
          variant="ghost" 
          onClick={onBack} 
          className="p-2 hover:bg-secondary/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold flex-1">Kopfschmerztagebuch (PDF)</h1>
      </div>

      <div className="p-4">

      <Card className="p-4 mb-4 space-y-3">
        <div>
          <label className="block text-sm mb-1">Zeitraum</label>
          <TimeRangeButtons value={preset} onChange={setPreset} />
        </div>

        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm mb-1">Start</label>
              <input className="border-border/30 border rounded px-2 h-10 w-full bg-background text-foreground" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Ende</label>
              <input className="border-border/30 border rounded px-2 h-10 w-full bg-background text-foreground" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm mb-1">Medikamente auswählen (optional)</label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={allSelected ? "default" : "outline"}
              onClick={() => {
                if (allSelected) {
                  // Zurück zur vorherigen Auswahl
                  setSelectedMeds(previousSelection);
                  setAllSelected(false);
                } else {
                  // Alle auswählen
                  setPreviousSelection(selectedMeds);
                  setSelectedMeds([...medOptions]);
                  setAllSelected(true);
                }
              }}
              className="text-xs font-semibold"
            >
              Alle
            </Button>
            {medOptions.map(m => {
              const isSelected = selectedMeds.includes(m);
              return (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => {
                    setSelectedMeds(prev => isSelected ? prev.filter(x=>x!==m) : [...prev, m]);
                    setAllSelected(false);
                  }}
                  aria-pressed={isSelected}
                  className="text-xs"
                >
                  {m}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Content Selection */}
        <div className="space-y-3 pt-4 border-t">
          <label className="block text-sm font-medium">
            Was soll ins Tagebuch?
          </label>
          
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={includeStats} 
                onChange={e => setIncludeStats(e.target.checked)} 
              />
              Medikamenten-Statistiken (Häufigkeit & Wirksamkeit)
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={includeChart} 
                onChange={e => setIncludeChart(e.target.checked)} 
              />
              Intensitätsverlauf-Chart (Zeitreihen-Diagramm)
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={includeAnalysis} 
                onChange={e => {
                  setIncludeAnalysis(e.target.checked);
                  if (!e.target.checked) {
                    setAnalysisReport("");
                  }
                }} 
              />
              Professioneller Analysebericht (KI-generiert)
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={includeEntriesList} 
                onChange={e => setIncludeEntriesList(e.target.checked)} 
              />
              Detaillierte Einträge-Liste (alle Einzeleinträge)
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={includePatientData} 
                onChange={e => setIncludePatientData(e.target.checked)} 
              />
              Persönliche Daten einbeziehen
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={includeDoctorData} 
                onChange={e => setIncludeDoctorData(e.target.checked)} 
              />
              Arztdaten einbeziehen
            </label>
          </div>
        </div>
      </Card>

      {/* Export Actions */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {filteredEntries.length > 0 ? (
              <p>
                <strong>{filteredEntries.length}</strong> Einträge gefunden im Zeitraum{" "}
                <strong>{new Date(from).toLocaleDateString("de-DE")}</strong> bis{" "}
                <strong>{new Date(to).toLocaleDateString("de-DE")}</strong>
              </p>
            ) : (
              <p>Keine Einträge im ausgewählten Zeitraum</p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
          <Button 
            variant="default" 
            size="lg"
            onClick={printPDF} 
            disabled={!filteredEntries.length || isLoading || isGeneratingReport}
            className="flex-1 sm:flex-none"
          >
            {isGeneratingReport ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Erstelle PDF...
              </>
            ) : (
              "📄 PDF erstellen"
            )}
          </Button>
            <Button 
              variant="secondary" 
              onClick={savePDF} 
              disabled={!filteredEntries.length || isLoading || isGeneratingReport}
            >
              {isGeneratingReport ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Erstelle PDF...
                </>
              ) : (
                "💾 Als PDF speichern"
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={exportCSV} 
              disabled={!filteredEntries.length || isLoading || isGeneratingReport}
            >
              📊 CSV Export
            </Button>
          </div>
        </div>
      </Card>
      </div>

      {/* Missing Data Dialog */}
      <AlertDialog open={showMissingDataDialog} onOpenChange={setShowMissingDataDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Daten nicht vorhanden</AlertDialogTitle>
            <AlertDialogDescription>
              Sie haben noch keine persönlichen Daten oder Arztdaten hinterlegt. 
              Möchten Sie diese jetzt in den Kontoeinstellungen eingeben?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowMissingDataDialog(false);
                if (onNavigate) {
                  onNavigate('settings-account');
                }
              }}
            >
              Zu Kontoeinstellungen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}