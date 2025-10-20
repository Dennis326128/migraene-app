import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUserSettings, useUpsertUserSettings, useUserDefaults, useUpsertUserDefaults } from "@/features/settings/hooks/useUserSettings";

type Preset = "3m" | "6m" | "12m";

function normalizeHours(input: string): number[] {
  const nums = input.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n));
  const uniq = Array.from(new Set(nums)).filter(n => n >= 0 && n <= 23).sort((a,b)=>a-b);
  return uniq;
}

export default function SettingsForm() {
  const { data: settings, isFetching } = useUserSettings();
  const upsert = useUpsertUserSettings();
  const { data: defaults } = useUserDefaults();
  const upsertDefaults = useUpsertUserDefaults();

  const [preset, setPreset] = useState<Preset>("3m");
  const [includeNoMeds, setIncludeNoMeds] = useState<boolean>(true);
  const [hoursStr, setHoursStr] = useState<string>("6,12,18");
  const [backfillDays, setBackfillDays] = useState<number>(30);
  const [voiceNotesEnabled, setVoiceNotesEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (!settings) return;
    setPreset(settings.default_report_preset || "3m");
    setIncludeNoMeds(!!settings.include_no_meds);
    setHoursStr((settings.snapshot_hours?.length ? settings.snapshot_hours : [6,12,18]).join(","));
    setBackfillDays(settings.backfill_days ?? 30);
  }, [settings]);

  useEffect(() => {
    if (!defaults) return;
    setVoiceNotesEnabled(defaults.voice_notes_enabled ?? true);
  }, [defaults]);

  const hoursError = useMemo(() => {
    const arr = normalizeHours(hoursStr);
    if (!arr.length) return "Mindestens eine Stunde zwischen 0–23 angeben (z. B. 6,12,18).";
    if (arr.length > 12) return "Maximal 12 Stundenpunkte.";
    return "";
  }, [hoursStr]);

  const daysError = useMemo(() => {
    if (!Number.isFinite(backfillDays) || backfillDays < 1 || backfillDays > 90) {
      return "Gültiger Bereich: 1–90 Tage.";
    }
    return "";
  }, [backfillDays]);

  const hasError = !!hoursError || !!daysError;

  const handleSave = async () => {
    if (hasError) return;
    await Promise.all([
      upsert.mutateAsync({
        default_report_preset: preset,
        include_no_meds: includeNoMeds,
        snapshot_hours: normalizeHours(hoursStr),
        backfill_days: backfillDays,
      }),
      upsertDefaults.mutateAsync({
        voice_notes_enabled: voiceNotesEnabled,
      }),
    ]);
    // optional: leichte Rückmeldung
    alert("Einstellungen gespeichert.");
  };

  const handleReset = () => {
    setPreset("3m");
    setIncludeNoMeds(true);
    setHoursStr("6,12,18");
    setBackfillDays(30);
    setVoiceNotesEnabled(true);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Einstellungen</h1>
      <Card className="p-4 space-y-4 max-w-xl">
        <div>
          <Label className="block mb-1">Standard-Zeitraum für Tagebuch</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["3m", "6m", "12m"] as Preset[]).map(p => (
              <Button
                key={p}
                variant={preset === p ? "default" : "outline"}
                onClick={() => setPreset(p)}
              >
                {p === "3m" ? "3 Monate" : p === "6m" ? "6 Monate" : "12 Monate"}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="block mb-1">Einträge ohne Medikamente einbeziehen</Label>
            <p className="text-sm text-muted-foreground">Gilt als Vorauswahl im Kopfschmerztagebuch.</p>
          </div>
          <Switch checked={includeNoMeds} onCheckedChange={setIncludeNoMeds} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="block mb-1">Voice-Notizen aktivieren</Label>
            <p className="text-sm text-muted-foreground">Erlaubt das Speichern und Analysieren von Sprachnotizen.</p>
          </div>
          <Switch checked={voiceNotesEnabled} onCheckedChange={setVoiceNotesEnabled} />
        </div>

        <div>
          <Label className="block mb-1">Tägliche Wetter-Snapshot-Stunden</Label>
          <Input
            value={hoursStr}
            onChange={(e) => setHoursStr(e.target.value)}
            placeholder="z. B. 6,12,18"
          />
          {hoursError && <p className="text-sm text-destructive mt-1">{hoursError}</p>}
          {!hoursError && (
            <p className="text-sm text-muted-foreground mt-1">
              Kommagetrennte Stunden (0–23). Empfohlen: 6,12,18.
            </p>
          )}
        </div>

        <div>
          <Label className="block mb-1">Wetter rückwirkend nachtragen (Tage)</Label>
          <Input
            type="number"
            min={1}
            max={90}
            value={backfillDays}
            onChange={(e) => setBackfillDays(Number(e.target.value))}
          />
          {daysError && <p className="text-sm text-destructive mt-1">{daysError}</p>}
          {!daysError && <p className="text-sm text-muted-foreground mt-1">Empfohlen: 30</p>}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={hasError || isFetching || upsert.isPending || upsertDefaults.isPending}>
            {(upsert.isPending || upsertDefaults.isPending) ? "Speichern…" : "Speichern"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={upsert.isPending || upsertDefaults.isPending}>Zurücksetzen</Button>
        </div>
      </Card>
    </div>
  );
}