import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PainEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { getUserSettings } from "@/features/settings/api/settings.api";
import { mapTextLevelToScore } from "@/lib/utils/pain";

type Preset = "3m" | "6m" | "12m" | "custom";

function addMonths(d: Date, m: number) {
  const dd = new Date(d);
  dd.setMonth(dd.getMonth() + m);
  return dd;
}
function fmt(d: Date) { return d.toISOString().slice(0,10); }

export default function DiaryReport({ onBack }: { onBack: () => void }) {
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<Preset>("3m");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>(fmt(today));
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [medOptions, setMedOptions] = useState<string[]>([]);
  const [includeNoMeds, setIncludeNoMeds] = useState<boolean>(true);
  const [generated, setGenerated] = useState<PainEntry[]>([]);

  useEffect(() => {
    (async () => {
      const s = await getUserSettings().catch(() => null);
      if (s?.default_report_preset && (["3m","6m","12m"] as const).includes(s.default_report_preset)) {
        setPreset(s.default_report_preset);
      }
      if (typeof s?.include_no_meds === "boolean") {
        setIncludeNoMeds(s.include_no_meds);
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

  // Automatisch gefilterte Einträge (Live-Vorschau)
  const filteredEntries = useMemo(() => {
    const medsSet = new Set(selectedMeds);
    return entries.filter(e => {
      const meds = e.medications || [];
      const hasAny = meds.some(m => medsSet.has(m));
      if (selectedMeds.length === 0) {
        return includeNoMeds ? true : meds.length > 0;
      }
      return hasAny || (includeNoMeds && meds.length === 0);
    });
  }, [entries, selectedMeds, includeNoMeds]);

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

  const formatGermanDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  };

  const printPDF = () => {
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
    if (!filteredEntries.length) return;
    
    const bytes = await buildDiaryPdf({
      title: "Kopfschmerztagebuch",
      from, to,
      entries: filteredEntries,
      selectedMeds,
      includeNoMeds,
    });
    
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kopfschmerztagebuch_${from}_bis_${to}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      <Button onClick={onBack} className="mb-4">← Zurück</Button>
      <h1 className="text-2xl font-bold mb-4">Kopfschmerztagebuch (PDF)</h1>

      <Card className="p-4 mb-4 space-y-3">
        <div>
          <label className="block text-sm mb-1">Zeitraum</label>
          <div className="grid grid-cols-4 gap-2">
            {(["3m","6m","12m"] as Preset[]).map(p => (
              <Button key={p} variant={preset===p?"default":"outline"} onClick={() => setPreset(p)}>
                {p==="3m"?"3 Monate":p==="6m"?"6 Monate":"12 Monate"}
              </Button>
            ))}
            <Button variant={preset==="custom"?"default":"outline"} onClick={() => setPreset("custom")}>Benutzerdefiniert</Button>
          </div>
        </div>

        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm mb-1">Start</label>
              <input className="border rounded px-2 h-10 w-full" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Ende</label>
              <input className="border rounded px-2 h-10 w-full" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm mb-1">Medikamente auswählen (optional)</label>
          <div className="flex flex-wrap gap-2">
            {medOptions.map(m => {
              const isSelected = selectedMeds.includes(m);
              return (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => setSelectedMeds(prev => isSelected ? prev.filter(x=>x!==m) : [...prev, m])}
                  aria-pressed={isSelected}
                  className="text-xs"
                >
                  {m}
                </Button>
              );
            })}
          </div>
          <label className="inline-flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" checked={includeNoMeds} onChange={e=>setIncludeNoMeds(e.target.checked)} />
            Einträge ohne Medikamente einbeziehen
          </label>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={printPDF} disabled={!filteredEntries.length || isLoading}>📄 PDF / Drucken</Button>
          <Button variant="secondary" onClick={savePDF} disabled={!filteredEntries.length || isLoading}>💾 PDF speichern</Button>
          <Button variant="outline" onClick={exportCSV} disabled={!filteredEntries.length || isLoading}>📊 CSV Export</Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-sm text-muted-foreground">Zeitraum</div>
            <div className="font-medium">{from} – {to}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Einträge</div>
            <div className="font-medium">{filteredEntries.length}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">⏳ Lade Einträge...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-sm text-muted-foreground">📋 Keine Einträge für den gewählten Zeitraum und Filter gefunden.</div>
        ) : (
          <ul className="space-y-2">
            {filteredEntries.map(e => {
              const dt = e.selected_date && e.selected_time
                ? `${e.selected_date} ${e.selected_time}`
                : new Date(e.timestamp_created).toLocaleString();
              return (
                <li key={e.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between">
                    <div className="font-medium">{dt}</div>
                    <div>{mapTextLevelToScore(e.pain_level)}</div>
                  </div>
                  {(e.medications?.length ?? 0) > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">{e.medications.join(", ")}</div>
                  )}
                  {e.notes && <div className="text-xs mt-1">📝 {e.notes}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}