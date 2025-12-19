# Supabase E-Mail Templates - Migräne-App

Diese Dokumentation beschreibt die benutzerdefinierten E-Mail-Templates für die Supabase-Authentifizierung.

## Wichtig: Prefetch-Schutz

Die Templates verwenden **NICHT** direkt `{{ .ConfirmationURL }}`, da E-Mail-Clients den Link oft vorab abrufen (Prefetch) und dabei den Token ungültig machen können.

Stattdessen wird der Button-Link so gebaut:
- Der Link führt zu `/auth/confirm` mit Query-Parametern
- Erst beim **aktiven Klick** auf "Jetzt bestätigen" wird `verifyOtp` aufgerufen
- So wird der Token nicht durch Prefetch verbraucht

## Konfiguration im Supabase Dashboard

1. **Öffne:** Supabase Dashboard → Authentication → Email Templates
2. **Bearbeite:** Die jeweiligen Templates (Confirm signup, Reset password)
3. **Kopiere:** Subject und HTML aus dieser Datei

## Redirect URLs konfigurieren

Unter **Authentication → URL Configuration** müssen folgende URLs eingetragen werden:

### Site URL
```
https://migraene-app.lovable.app
```

### Redirect URLs (Additional redirect URLs)
```
https://migraene-app.lovable.app/auth/confirm
https://migraene-app.lovable.app/auth/update-password
https://migraene-app.lovable.app/auth/callback
http://localhost:5173/auth/confirm
http://localhost:5173/auth/update-password
http://localhost:5173/auth/callback
```

---

## Template 1: Confirm Signup (E-Mail bestätigen)

### Subject
```
Bitte bestätige deine E-Mail-Adresse – Migräne-App
```

### HTML Template
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>E-Mail bestätigen</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <!-- Preheader (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #f4f4f5;">
    Bestätige deine E-Mail-Adresse für die Migräne-App &#847; &#847; &#847; &#847; &#847;
  </div>
  
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                🧠 Migräne-App
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #18181b; text-align: center;">
                E-Mail bestätigen
              </h2>
              
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #52525b; text-align: center;">
                Vielen Dank für Ihre Registrierung bei der Migräne-App. Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 24px 0;">
                    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}" 
                       style="display: inline-block; padding: 14px 32px; background-color: #22c55e; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);">
                      Jetzt bestätigen
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative: OTP Code -->
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #71717a;">
                  Alternativ: Einmal-Code
                </p>
                <p style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 4px; color: #18181b; font-family: monospace;">
                  {{ .Token }}
                </p>
              </div>
              
              <!-- Fallback Link -->
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #71717a; text-align: center;">
                Falls der Button nicht funktioniert, kopieren Sie diesen Link:
              </p>
              <p style="margin: 0; font-size: 12px; color: #22c55e; word-break: break-all; text-align: center;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}" style="color: #22c55e;">
                  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
                </a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center; line-height: 1.5;">
                Wenn Sie sich nicht bei der Migräne-App registriert haben, können Sie diese E-Mail ignorieren.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Template 2: Reset Password (Passwort zurücksetzen)

### Subject
```
Passwort zurücksetzen – Migräne-App
```

### HTML Template
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Passwort zurücksetzen</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <!-- Preheader (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #f4f4f5;">
    Setzen Sie Ihr Passwort für die Migräne-App zurück &#847; &#847; &#847; &#847; &#847;
  </div>
  
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                🧠 Migräne-App
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #18181b; text-align: center;">
                Passwort zurücksetzen
              </h2>
              
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #52525b; text-align: center;">
                Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt. Klicken Sie auf den Button, um ein neues Passwort zu setzen.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 24px 0;">
                    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password" 
                       style="display: inline-block; padding: 14px 32px; background-color: #22c55e; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);">
                      Passwort zurücksetzen
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative: OTP Code -->
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #71717a;">
                  Alternativ: Einmal-Code
                </p>
                <p style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 4px; color: #18181b; font-family: monospace;">
                  {{ .Token }}
                </p>
              </div>
              
              <!-- Fallback Link -->
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #71717a; text-align: center;">
                Falls der Button nicht funktioniert, kopieren Sie diesen Link:
              </p>
              <p style="margin: 0; font-size: 12px; color: #22c55e; word-break: break-all; text-align: center;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password" style="color: #22c55e;">
                  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
                </a>
              </p>
              
              <!-- Expiry Info -->
              <div style="background-color: #fef3c7; border-radius: 8px; padding: 12px; margin-top: 24px; text-align: center;">
                <p style="margin: 0; font-size: 13px; color: #92400e;">
                  ⏱️ Dieser Link ist 1 Stunde gültig.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center; line-height: 1.5;">
                Wenn Sie diese Passwortänderung nicht angefordert haben, können Sie diese E-Mail ignorieren. Ihr Passwort bleibt unverändert.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Test-Checkliste

### ✅ Registrierung testen
1. [ ] Neue E-Mail registrieren
2. [ ] E-Mail erhalten mit korrektem Design
3. [ ] Button "Jetzt bestätigen" klicken → `/auth/confirm` öffnet sich
4. [ ] "Jetzt bestätigen" klicken → Erfolg, Weiterleitung zu `/`
5. [ ] Login funktioniert

### ✅ Passwort vergessen testen
1. [ ] "Passwort vergessen" auf Login-Seite klicken
2. [ ] E-Mail-Adresse eingeben, Link anfordern
3. [ ] E-Mail erhalten mit korrektem Design
4. [ ] Button "Passwort zurücksetzen" klicken → `/auth/confirm` öffnet sich
5. [ ] "Fortfahren" klicken → Weiterleitung zu `/auth/update-password`
6. [ ] Neues Passwort setzen → Erfolg, Weiterleitung zum Login
7. [ ] Login mit neuem Passwort funktioniert

### ✅ Prefetch-Schutz testen
1. [ ] Link in E-Mail NICHT sofort anklicken
2. [ ] Warten ob Token durch Prefetch verbraucht wird (sollte nicht passieren)
3. [ ] Später klicken → sollte noch funktionieren

### ✅ Fehlerszenarien testen
1. [ ] Abgelaufener Link → Fehlermeldung mit "Neuen Link anfordern"
2. [ ] Bereits verwendeter Link → Passende Meldung
3. [ ] Unvollständiger Link → Fehlermeldung

---

## Troubleshooting

### Link funktioniert nicht
- Prüfen ob Redirect URLs im Supabase Dashboard korrekt eingetragen sind
- Prüfen ob Site URL korrekt ist

### Token bereits verwendet
- Der Prefetch-Schutz sollte dies verhindern
- Falls Problem weiterhin besteht: E-Mail-Client-Einstellungen prüfen

### E-Mail kommt nicht an
- Supabase Auth Logs prüfen
- Spam-Ordner prüfen
- E-Mail-Limits in Supabase prüfen (Free Tier: 4 E-Mails/Stunde)
