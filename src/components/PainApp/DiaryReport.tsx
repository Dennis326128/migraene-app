import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PainEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";

type Preset = "3m" | "6m" | "12m" | "custom";

function addMonths(d: Date, m: number) {
  const dd = new Date(d);
  dd.setMonth(dd.getMonth() + m);
  return dd;
}
function fmt(d: Date) { return d.toISOString().slice(0,10); }
function mapTextLevelToScore(level: string): number {
  const t = (level || "").toLowerCase();
  if (t.includes("sehr")) return 9;
  if (t.includes("stark")) return 7;
  if (t.includes("mittel")) return 5;
  if (t.includes("leicht")) return 2;
  return 0;
}

export default function DiaryReport({ onBack }: { onBack: () => void }) {
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<Preset>("3m");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>(fmt(today));
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [medOptions, setMedOptions] = useState<string[]>([]);
  const [includeNoMeds, setIncludeNoMeds] = useState<boolean>(true);
  const [generated, setGenerated] = useState<PainEntry[]>([]);

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

  // Vorschau erzeugen (Filter anwenden)
  const generatePreview = () => {
    const medsSet = new Set(selectedMeds);
    const filtered = entries.filter(e => {
      const meds = e.medications || [];
      const hasAny = meds.some(m => medsSet.has(m));
      if (selectedMeds.length === 0) {
        return includeNoMeds ? true : meds.length > 0;
      }
      return hasAny || (includeNoMeds && meds.length === 0);
    });
    setGenerated(filtered);
  };

  const avgPain = useMemo(() => {
    if (!generated.length) return 0;
    const sum = generated.reduce((s, e) => s + mapTextLevelToScore(e.pain_level), 0);
    return (sum / generated.length).toFixed(2);
  }, [generated]);

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
    const header = `
      <h1>Kopfschmerztagebuch</h1>
      <small>Zeitraum: ${from} bis ${to}${selectedMeds.length ? ` • Medikamente: ${selectedMeds.join(", ")}` : ""}${includeNoMeds ? " • Einträge ohne Medikamente enthalten" : ""}</small>
      <h2>Übersicht</h2>
      <div>Einträge: ${generated.length} • Durchschnittliches Schmerzlevel: ${avgPain}</div>
      <h2>Einträge</h2>
    `;
    const rows = generated.map(e => {
      const dt = e.selected_date && e.selected_time
        ? `${e.selected_date} ${e.selected_time}`
        : new Date(e.timestamp_created).toLocaleString();
      const meds = (e.medications || []).join(", ") || "–";
      return `<tr>
        <td>${dt}</td>
        <td>${e.pain_level}</td>
        <td>${meds}</td>
        <td>${e.notes ?? "–"}</td>
      </tr>`;
    }).join("");
    const html = `
      ${style}
      ${header}
      <table>
        <thead><tr><th>Datum/Zeit</th><th>Schmerz</th><th>Medikamente</th><th>Notiz</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
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

        <div>
          <label className="block text-sm mb-1">Medikamente auswählen (optional)</label>
          <div className="flex flex-wrap gap-2">
            {medOptions.map(m => {
              const checked = selectedMeds.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => setSelectedMeds(prev => checked ? prev.filter(x=>x!==m) : [...prev, m])}
                  className={`px-3 h-9 rounded border ${checked ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" onClick={() => setSelectedMeds(medOptions)}>Alle</Button>
            <Button variant="ghost" onClick={() => setSelectedMeds([])}>Keine</Button>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeNoMeds} onChange={e=>setIncludeNoMeds(e.target.checked)} />
              Einträge ohne Medikamente einbeziehen
            </label>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={generatePreview} disabled={isLoading}>Vorschau aktualisieren</Button>
          <Button variant="secondary" onClick={printPDF} disabled={!generated.length}>PDF / Drucken</Button>
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
            <div className="font-medium">{generated.length}</div>
          </div>
        </div>

        {generated.length === 0 ? (
          <div className="text-sm text-muted-foreground">Noch keine Vorschau – klicke auf „Vorschau aktualisieren".</div>
        ) : (
          <ul className="space-y-2">
            {generated.map(e => {
              const dt = e.selected_date && e.selected_time
                ? `${e.selected_date} ${e.selected_time}`
                : new Date(e.timestamp_created).toLocaleString();
              return (
                <li key={e.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between">
                    <div className="font-medium">{dt}</div>
                    <div>{e.pain_level}</div>
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