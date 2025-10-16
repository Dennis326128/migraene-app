# 🔒 Sicherheits-Konfiguration für Produktions-Deployment

Diese Dokumentation beschreibt die **manuellen Schritte**, die im Supabase Dashboard durchgeführt werden müssen, um die App produktionsreif zu machen.

## ⚠️ KRITISCHE SCHRITTE (VOR PUBLIKATION)

### 1. Leaked Password Protection aktivieren

**Priorität:** 🔴 KRITISCH

**Was:** Verhindert, dass Nutzer bekannte gehackte Passwörter verwenden (HaveIBeenPwned-Integration)

**Schritte:**
1. Zu [Authentication → Policies](https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb/auth/policies) navigieren
2. "Password Strength" Sektion finden
3. ✅ **"Leaked Password Protection"** aktivieren
4. Speichern

**Warum:** Schützt Nutzer vor kompromittierten Passwörtern aus Datenlecks

---

### 2. OTP Expiry Zeit reduzieren

**Priorität:** 🟠 WICHTIG

**Was:** Email-Bestätigungs-Codes Ablaufzeit verkürzen

**Schritte:**
1. Zu [Authentication → Email Templates](https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb/auth/templates) navigieren
2. **"OTP expiry duration"** auf **3600 Sekunden (60 Minuten)** setzen
3. Speichern

**Aktueller Wert:** Vermutlich 86400 Sekunden (24 Stunden) - zu lang!

**Warum:** Reduziert Angriffsfenster bei abgefangenen Email-Codes

---

### 3. PostgreSQL-Version upgraden

**Priorität:** 🟠 WICHTIG

**Was:** Datenbank auf neueste PostgreSQL-Version aktualisieren

**Schritte:**
1. Zu [Database → Configuration](https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb/database/configuration) navigieren
2. **"Upgrade"** Button klicken (falls verfügbar)
3. Backup-Bestätigung durchführen
4. Upgrade starten (dauert ca. 5-10 Minuten)

**Hinweis:** Falls kein Upgrade verfügbar, ist die DB bereits aktuell ✅

**Warum:** Kritische Sicherheitspatches und Performance-Verbesserungen

---

### 4. Extension-Migration ⚠️ NICHT MÖGLICH

**Status:** ⚠️ **Technische Limitation - kein Handlungsbedarf**

**Was wurde versucht:**
- Separates `extensions` Schema erstellen
- Extensions aus `public` verschieben

**Warum nicht möglich:**
- Supabase-interne Extensions (`pg_net`, `pgsodium`, `postgis`) unterstützen `SET SCHEMA` nicht
- Dies ist eine PostgreSQL-Limitation bei system-kritischen Extensions

**Sicherheitsbewertung:**
- ✅ **Geringes Risiko:** Diese Extensions werden von Supabase verwaltet und sind vertrauenswürdig
- ✅ RLS-Policies schützen vor unbefugtem Zugriff
- ✅ Kein Handlungsbedarf für Publikation

**Empfehlung:** Akzeptieren als bekannte Einschränkung

---

## 🟡 WICHTIGE SCHRITTE (NACH SOFT-LAUNCH)

### 5. Rate Limiting aktivieren

**Priorität:** 🟡 WICHTIG

**Was:** Schutz vor Brute-Force-Attacken

**Schritte:**
1. Zu [Authentication → Rate Limits](https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb/auth/rate-limits) navigieren
2. Folgende Werte setzen:

```
Email/Password Login:    10 Versuche / Stunde
Magic Link:               5 Versuche / Stunde
Password Reset:           3 Versuche / Stunde
Signup:                   5 Registrierungen / Stunde / IP
```

3. Speichern

**Warum:** Verhindert automatisierte Angriffe

---

### 6. Site URL & Redirect URLs konfigurieren

**Priorität:** 🟡 WICHTIG

**Was:** Produktions-Domain für Authentication konfigurieren

**Schritte:**
1. Zu [Authentication → URL Configuration](https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb/auth/url-configuration) navigieren
2. **Site URL** setzen auf: `https://[ihre-domain].de`
3. **Additional Redirect URLs** hinzufügen:
   ```
   https://[ihre-domain].de/auth/callback
   https://www.lovable.app/projects/[project-id]
   ```
4. Speichern

**⚠️ WICHTIG:** Nach Custom-Domain-Deployment aktualisieren!

---

### 7. Email Templates anpassen

**Priorität:** 🟡 WICHTIG

**Was:** Gebrandete Emails mit Datenschutz-Links

**Schritte:**
1. Zu [Authentication → Email Templates](https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb/auth/templates) navigieren
2. Für **jedes Template** (Confirm Signup, Magic Link, Password Reset, Email Change):
   - Farben/Logo anpassen
   - Text personalisieren
   - Footer mit Datenschutz-Link hinzufügen:
     ```html
     <p style="font-size: 12px; color: #666;">
       <a href="https://[ihre-domain].de/privacy">Datenschutzerklärung</a> | 
       <a href="https://[ihre-domain].de/imprint">Impressum</a>
     </p>
     ```
3. Preview testen
4. Speichern

---

## 🟢 OPTIONALE SCHRITTE

### 8. Eigener SMTP-Server (Empfohlen für Production)

**Priorität:** 🟢 OPTIONAL

**Was:** Zuverlässiger Email-Versand ohne Supabase-Limits

**Anbieter-Empfehlungen:**
- **SendGrid** (kostenlos bis 100 Emails/Tag)
- **Mailgun**
- **AWS SES**

**Schritte:**
1. SMTP-Account bei Provider erstellen
2. Zu [Settings → Auth](https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb/settings/auth) navigieren
3. "Enable Custom SMTP" aktivieren
4. SMTP-Credentials eingeben
5. Test-Email senden

**Alternative:** Supabase-Standard behalten (für kleine Apps ausreichend)

---

## 📋 CHECKLISTE

### Vor Publikation:
- [ ] ✅ Leaked Password Protection aktiviert
- [ ] ✅ OTP Expiry auf 60 Minuten reduziert
- [ ] ✅ PostgreSQL auf neueste Version
- [x] ⚠️ Extensions-Migration (nicht möglich, geringes Risiko)

### Datenschutz (Code):
- [x] ✅ Impressum erstellt (`/imprint`)
- [x] ✅ AGB erstellt (`/terms`)
- [x] ✅ Datenschutzerklärung vervollständigt
- [x] ✅ Cookie-Banner erweitert (Links zu Impressum, AGB, Datenschutz)
- [x] ✅ Routing für alle Seiten konfiguriert

### Nach Soft-Launch:
- [ ] ✅ Rate Limiting konfiguriert
- [ ] ✅ Site URL auf Produktions-Domain gesetzt
- [ ] ✅ Email Templates angepasst

### Optional:
- [ ] Eigener SMTP-Server eingerichtet

---

## 🔍 Verifizierung

Nach Durchführung aller Schritte:

1. **Neuen Test-Account erstellen** → Überprüfen ob schwaches Passwort blockiert wird
2. **Password Reset testen** → Email sollte innerhalb 1 Stunde ablaufen
3. **5x falsches Login** → Rate Limiting sollte greifen
4. **Email-Template prüfen** → Branded Layout mit Datenschutz-Links

---

## 📞 Support

Bei Fragen zur Konfiguration:
- [Supabase Dokumentation](https://supabase.com/docs)
- [Lovable Support](https://lovable.app/support)

**Letzte Aktualisierung:** 2025-10-16
