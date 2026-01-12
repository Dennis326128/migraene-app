# AI Unlimited / Tester-Freischaltung

## Übersicht

Das Feld `ai_unlimited` in der Tabelle `user_profiles` ermöglicht es, bestimmte Accounts von Quota- und Cooldown-Beschränkungen bei der KI-Musteranalyse zu befreien.

**Sicherheitshinweis**: Dieses Feld kann **NUR** von einem Admin direkt in der Datenbank gesetzt werden. Normale Benutzer können es weder über die API noch über das Frontend ändern.

## Wie es funktioniert

- `ai_unlimited = false` (Standard): User hat 5 Analysen pro Monat + 60s Cooldown
- `ai_unlimited = true`: Keine Limits, unbegrenzte Analysen

## Tester/Admin freischalten

### Option 1: Supabase Dashboard

1. Öffne das Supabase Dashboard: https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb
2. Gehe zu **Table Editor** → **user_profiles**
3. Finde den gewünschten User (nach `user_id` suchen)
4. Setze `ai_unlimited` auf `true`
5. Speichern

### Option 2: SQL Query

```sql
-- Einzelnen User freischalten (ersetze UUID)
UPDATE public.user_profiles 
SET ai_unlimited = true 
WHERE user_id = 'HIER-UUID-EINFUEGEN';

-- User anhand der E-Mail finden und freischalten
UPDATE public.user_profiles 
SET ai_unlimited = true 
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'tester@example.com'
);

-- Alle Unlimited-User anzeigen
SELECT up.user_id, au.email, up.ai_unlimited 
FROM public.user_profiles up
JOIN auth.users au ON au.id = up.user_id
WHERE up.ai_unlimited = true;
```

## Sicherheit

1. **Trigger-Schutz**: Ein DB-Trigger (`protect_ai_unlimited_trigger`) verhindert, dass das Feld von normalen Usern geändert werden kann.

2. **RLS Policy**: Die Update-Policy erlaubt Updates, aber der Trigger setzt `ai_unlimited` automatisch auf den alten Wert zurück, wenn ein normaler User es zu ändern versucht.

3. **Default false**: Neue User haben immer `ai_unlimited = false`.

## Quota-System

| Feature | Free User | Unlimited User |
|---------|-----------|----------------|
| Analysen/Monat | 5 | ∞ |
| Cooldown | 60s | 0s |
| Cache | ✓ | ✓ |

## Troubleshooting

**User sieht immer noch Limits trotz `ai_unlimited = true`?**
- Prüfe, ob `ai_enabled` auch `true` ist
- Cache im Browser leeren (Seite neu laden)

**Quota wird nicht korrekt gezählt?**
- Prüfe `user_ai_usage` Tabelle für Feature `pattern_analysis`
- Monatliches Reset erfolgt automatisch am 1. des Monats
