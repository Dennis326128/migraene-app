# Supabase E-Mail Templates – Migräne-App

Moderne, deutsche E-Mail-Templates im Dark Design passend zur App.

## Wichtig: Prefetch-Schutz

Die Templates verwenden **NICHT** direkt `{{ .ConfirmationURL }}`, da E-Mail-Clients den Link oft vorab abrufen (Prefetch) und dabei den Token ungültig machen können.

Stattdessen wird der Button-Link so gebaut:
- Der Link führt zu `/auth/confirm` mit Query-Parametern
- Erst beim **aktiven Klick** auf den Button wird `verifyOtp` aufgerufen
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
Willkommen bei der Migräne-App – bitte bestätige deine E-Mail-Adresse
```

### HTML Template
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>E-Mail bestätigen – Migräne-App</title>
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
<body style="margin: 0; padding: 0; background-color: #0a0a0b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  
  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.
  </div>
  
  <!-- Email wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #0a0a0b;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- Main container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 520px;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right: 12px; vertical-align: middle;">
                    <!-- Green dot as brand indicator -->
                    <div style="width: 12px; height: 12px; background-color: #16a34a; border-radius: 50%;"></div>
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-size: 20px; font-weight: 600; color: #f8fafc; letter-spacing: -0.02em;">Migräne-App</span>
                  </td>
                </tr>
              </table>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280; letter-spacing: 0.02em;">
                Dokumentiere deine Migräne. Erkenne Muster.
              </p>
            </td>
          </tr>
          
          <!-- Content Card -->
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #1b1f27; border-radius: 16px; border: 1px solid #282d38;">
                <tr>
                  <td style="padding: 40px 36px;">
                    
                    <!-- Welcome Icon -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <div style="width: 56px; height: 56px; background-color: rgba(22, 163, 74, 0.15); border-radius: 14px; line-height: 56px; text-align: center;">
                            <span style="font-size: 28px;">✨</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Greeting -->
                    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #f8fafc; text-align: center; letter-spacing: -0.02em;">
                      Willkommen!
                    </h1>
                    
                    <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.6; color: #a1a1aa; text-align: center;">
                      Du hast dich erfolgreich für die Migräne-App registriert. Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.
                    </p>
                    
                    <!-- CTA Button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 0 0 28px 0;">
                          <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; letter-spacing: -0.01em;">
                            E-Mail-Adresse bestätigen
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Alternative: OTP Code -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 28px;">
                          <div style="background-color: #14171f; border: 1px solid #282d38; border-radius: 10px; padding: 16px 24px; display: inline-block;">
                            <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">
                              Alternativ: Einmal-Code
                            </p>
                            <p style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 6px; color: #f8fafc; font-family: 'SF Mono', Monaco, Consolas, monospace;">
                              {{ .Token }}
                            </p>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Divider -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 0 0 24px 0;">
                          <div style="height: 1px; background-color: #282d38;"></div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Security notice -->
                    <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #6b7280; text-align: center;">
                      Falls du dich nicht selbst registriert hast, kannst du diese E-Mail ignorieren. Dein Konto bleibt dann inaktiv.
                    </p>
                    
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 12px 0; font-size: 12px; line-height: 1.6; color: #52525b;">
                      Diese App dient der Dokumentation und Analyse deiner Angaben und ersetzt keine medizinische Beratung.
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #52525b;">
                      Fragen? <a href="mailto:support@migraene-app.de" style="color: #16a34a; text-decoration: none;">support@migraene-app.de</a>
                    </p>
                  </td>
                </tr>
              </table>
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
  <title>Passwort zurücksetzen – Migräne-App</title>
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
<body style="margin: 0; padding: 0; background-color: #0a0a0b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  
  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Setze dein Passwort zurück, um wieder Zugang zu deinem Konto zu erhalten.
  </div>
  
  <!-- Email wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #0a0a0b;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- Main container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 520px;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right: 12px; vertical-align: middle;">
                    <!-- Green dot as brand indicator -->
                    <div style="width: 12px; height: 12px; background-color: #16a34a; border-radius: 50%;"></div>
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-size: 20px; font-weight: 600; color: #f8fafc; letter-spacing: -0.02em;">Migräne-App</span>
                  </td>
                </tr>
              </table>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280; letter-spacing: 0.02em;">
                Dokumentiere deine Migräne. Erkenne Muster.
              </p>
            </td>
          </tr>
          
          <!-- Content Card -->
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #1b1f27; border-radius: 16px; border: 1px solid #282d38;">
                <tr>
                  <td style="padding: 40px 36px;">
                    
                    <!-- Icon -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <div style="width: 56px; height: 56px; background-color: rgba(22, 163, 74, 0.15); border-radius: 14px; line-height: 56px; text-align: center;">
                            <span style="font-size: 28px;">🔐</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Heading -->
                    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #f8fafc; text-align: center; letter-spacing: -0.02em;">
                      Passwort zurücksetzen
                    </h1>
                    
                    <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.6; color: #a1a1aa; text-align: center;">
                      Du hast angefordert, dein Passwort zurückzusetzen. Klicke auf den Button, um ein neues Passwort festzulegen.
                    </p>
                    
                    <!-- CTA Button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 0 0 24px 0;">
                          <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; letter-spacing: -0.01em;">
                            Neues Passwort festlegen
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Time notice -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <div style="display: inline-block; background-color: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.25); border-radius: 8px; padding: 10px 16px;">
                            <span style="font-size: 13px; color: #fbbf24;">⏱ Dieser Link ist 24 Stunden gültig</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Alternative: OTP Code -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 28px;">
                          <div style="background-color: #14171f; border: 1px solid #282d38; border-radius: 10px; padding: 16px 24px; display: inline-block;">
                            <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">
                              Alternativ: Einmal-Code
                            </p>
                            <p style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 6px; color: #f8fafc; font-family: 'SF Mono', Monaco, Consolas, monospace;">
                              {{ .Token }}
                            </p>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Divider -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 0 0 24px 0;">
                          <div style="height: 1px; background-color: #282d38;"></div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Security notice -->
                    <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #6b7280; text-align: center;">
                      Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren. Dein Passwort bleibt unverändert.
                    </p>
                    
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 12px 0; font-size: 12px; line-height: 1.6; color: #52525b;">
                      Diese App dient der Dokumentation und Analyse deiner Angaben und ersetzt keine medizinische Beratung.
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #52525b;">
                      Fragen? <a href="mailto:support@migraene-app.de" style="color: #16a34a; text-decoration: none;">support@migraene-app.de</a>
                    </p>
                  </td>
                </tr>
              </table>
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

## Template 3: Magic Link (Optional)

### Subject
```
Dein Anmeldelink – Migräne-App
```

### HTML Template
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Anmeldelink – Migräne-App</title>
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
<body style="margin: 0; padding: 0; background-color: #0a0a0b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  
  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Klicke auf den Link, um dich anzumelden.
  </div>
  
  <!-- Email wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #0a0a0b;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- Main container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 520px;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right: 12px; vertical-align: middle;">
                    <div style="width: 12px; height: 12px; background-color: #16a34a; border-radius: 50%;"></div>
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-size: 20px; font-weight: 600; color: #f8fafc; letter-spacing: -0.02em;">Migräne-App</span>
                  </td>
                </tr>
              </table>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280; letter-spacing: 0.02em;">
                Dokumentiere deine Migräne. Erkenne Muster.
              </p>
            </td>
          </tr>
          
          <!-- Content Card -->
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #1b1f27; border-radius: 16px; border: 1px solid #282d38;">
                <tr>
                  <td style="padding: 40px 36px;">
                    
                    <!-- Icon -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <div style="width: 56px; height: 56px; background-color: rgba(22, 163, 74, 0.15); border-radius: 14px; line-height: 56px; text-align: center;">
                            <span style="font-size: 28px;">🔗</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Heading -->
                    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #f8fafc; text-align: center; letter-spacing: -0.02em;">
                      Dein Anmeldelink
                    </h1>
                    
                    <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.6; color: #a1a1aa; text-align: center;">
                      Klicke auf den Button, um dich sicher in der Migräne-App anzumelden.
                    </p>
                    
                    <!-- CTA Button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 0 0 24px 0;">
                          <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; letter-spacing: -0.01em;">
                            Jetzt anmelden
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Time notice -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <div style="display: inline-block; background-color: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.25); border-radius: 8px; padding: 10px 16px;">
                            <span style="font-size: 13px; color: #fbbf24;">⏱ Dieser Link ist 1 Stunde gültig</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Alternative: OTP Code -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 28px;">
                          <div style="background-color: #14171f; border: 1px solid #282d38; border-radius: 10px; padding: 16px 24px; display: inline-block;">
                            <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">
                              Alternativ: Einmal-Code
                            </p>
                            <p style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 6px; color: #f8fafc; font-family: 'SF Mono', Monaco, Consolas, monospace;">
                              {{ .Token }}
                            </p>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Divider -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 0 0 24px 0;">
                          <div style="height: 1px; background-color: #282d38;"></div>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Security notice -->
                    <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #6b7280; text-align: center;">
                      Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.
                    </p>
                    
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 12px 0; font-size: 12px; line-height: 1.6; color: #52525b;">
                      Diese App dient der Dokumentation und Analyse deiner Angaben und ersetzt keine medizinische Beratung.
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #52525b;">
                      Fragen? <a href="mailto:support@migraene-app.de" style="color: #16a34a; text-decoration: none;">support@migraene-app.de</a>
                    </p>
                  </td>
                </tr>
              </table>
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

## Design-Tokens

| Element | Farbe | Beschreibung |
|---------|-------|--------------|
| Hintergrund | `#0a0a0b` | Sehr dunkles Schwarz |
| Card | `#1b1f27` | Dunkelgrau für Container |
| Card Inner | `#14171f` | Noch dunkler für Code-Boxen |
| Border | `#282d38` | Subtile Grenzen |
| Text Primary | `#f8fafc` | Hellstes Weiß |
| Text Secondary | `#a1a1aa` | Grau für Fließtext |
| Text Muted | `#6b7280` | Gedämpftes Grau |
| Text Footer | `#52525b` | Dunkleres Grau |
| Primary (Button) | `#16a34a` | App-Grün |
| Warning Badge | `#fbbf24` | Amber für Zeithinweise |

---

## Test-Checkliste

### ✅ Registrierung testen
1. [ ] Neue E-Mail registrieren
2. [ ] E-Mail erhalten mit Dark-Design
3. [ ] Button "E-Mail-Adresse bestätigen" klicken → `/auth/confirm` öffnet sich
4. [ ] Button klicken → Erfolg, Weiterleitung zur App
5. [ ] Login funktioniert

### ✅ Passwort vergessen testen
1. [ ] "Passwort vergessen" auf Login-Seite klicken
2. [ ] E-Mail-Adresse eingeben, Link anfordern
3. [ ] E-Mail erhalten mit Dark-Design
4. [ ] Button "Neues Passwort festlegen" klicken → `/auth/confirm` öffnet sich
5. [ ] Weiterleitung zu `/auth/update-password`
6. [ ] Neues Passwort setzen → Erfolg
7. [ ] Login mit neuem Passwort funktioniert

### ✅ E-Mail-Client-Kompatibilität
- [ ] Gmail (Web)
- [ ] Gmail (Mobile App)
- [ ] Apple Mail (macOS)
- [ ] Apple Mail (iOS)
- [ ] Outlook (Web)
- [ ] Outlook (Desktop)

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

---

## Support-E-Mail anpassen

**WICHTIG:** Ersetze in allen Templates `support@migraene-app.de` durch die tatsächliche Support-E-Mail-Adresse.
