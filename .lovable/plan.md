

## 🐛 Problem: Auswertung & Statistik laden nicht

### Diagnose

Die Datenbank-Logs zeigen zwei kritische Fehler:

1. **`relation "public.user_settings" does not exist`**
   - Die Tabelle `user_settings` existiert nicht in der Datenbank
   - Der Code in `src/features/settings/api/settings.api.ts` versucht, diese abzufragen
   - Betrifft: `Index.tsx`, `SettingsForm.tsx`, `weatherLogger.ts`

2. **`column pain_entries.pain_location does not exist`**
   - Die Spalte heißt `pain_locations` (Plural), nicht `pain_location` (Singular)
   - Betrifft möglicherweise alte Queries

### Existierende Tabellen

```text
user_ai_usage
user_consents
user_feedback
user_medication_limits
user_medications
user_profiles        ← Benutzerprofil (defaults, ai_enabled, etc.)
user_report_settings ← Report-Einstellungen (default_report_preset, etc.)
```

Die `user_settings` Tabelle wurde NIE erstellt, aber der Code referenziert sie.

---

## Lösung

### Option A: Tabelle erstellen (EMPFOHLEN)
Erstelle die fehlende `user_settings` Tabelle mit den benötigten Spalten:

```sql
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_hours INTEGER[] DEFAULT '{6,12,18}',
  backfill_days INTEGER DEFAULT 7,
  default_report_preset TEXT DEFAULT '3m',
  include_no_meds BOOLEAN DEFAULT true,
  selected_report_medications TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON public.user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE USING (auth.uid() = user_id);
```

### Option B: Code anpassen (Alternative)
Ersetze Referenzen zu `user_settings` durch `user_report_settings` und migriere fehlende Felder.

---

## Technische Schritte

1. **Migration erstellen** - Neue Tabelle `user_settings` mit RLS-Policies

2. **Fehlerbehandlung verbessern** - In `settings.api.ts` sicherstellen, dass Fehler beim Laden nicht die ganze App blockieren:
   ```typescript
   export async function getUserSettings(): Promise<UserSettings | null> {
     try {
       // ... existing code
     } catch (error) {
       console.warn('getUserSettings failed, using defaults:', error);
       return null; // Return null instead of throwing
     }
   }
   ```

3. **Index.tsx absichern** - Der `getUserSettings().catch(() => null)` ist bereits vorhanden, aber wenn die Query einen Fehler wirft, blockiert sie möglicherweise andere React-Queries

4. **Testen** - Statistik- und Auswertungsseiten nach Fix verifizieren

---

## Akzeptanzkriterien

- Auswertung & Statistik laden korrekt
- Keine Datenbank-Fehler mehr in den Logs
- Einstellungen können gespeichert werden

