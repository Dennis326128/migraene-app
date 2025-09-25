import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Database, User, Mail, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
          <h1 className="text-3xl font-bold">Datenschutzerklärung</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Überblick
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Diese Datenschutzerklärung informiert Sie über die Verarbeitung Ihrer personenbezogenen 
              Daten bei der Nutzung unserer Migräne-Tagebuch-App (nachfolgend "App").
            </p>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="font-medium">Letzte Aktualisierung: Januar 2025</p>
              <p>Version: 1.0</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              1. Verantwortlicher
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p><strong>Verantwortlich für die Datenverarbeitung:</strong></p>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p>[Ihr Name/Unternehmen]</p>
                <p>[Adresse]</p>
                <p>E-Mail: [kontakt@email.de]</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              2. Welche Daten werden verarbeitet?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">2.1 Gesundheitsdaten</h3>
              <ul className="space-y-2 text-sm">
                <li>• Schmerzintensität und -verlauf</li>
                <li>• Symptome und Auslöser</li>
                <li>• Medikamenteneinnahme und -wirkung</li>
                <li>• Lebensstil-Faktoren (Schlaf, Stress, etc.)</li>
                <li>• Hormonelle Daten (optional, bei Opt-in)</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-3">2.2 Technische Daten</h3>
              <ul className="space-y-2 text-sm">
                <li>• Standortdaten (für Wetterdaten, optional)</li>
                <li>• Wetterdaten (Luftdruck, Temperatur, etc.)</li>
                <li>• Nutzungsdaten (Zeitstempel, Gerätetyp)</li>
                <li>• Cookies und lokale Speicherung</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-3">2.3 Kontodaten</h3>
              <ul className="space-y-2 text-sm">
                <li>• E-Mail-Adresse (für Login und Wiederherstellung)</li>
                <li>• Verschlüsseltes Passwort</li>
                <li>• Nutzer-Einstellungen und Präferenzen</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Rechtsgrundlage der Verarbeitung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium">Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</h4>
                <p className="text-sm text-muted-foreground">
                  Für die Verarbeitung besonderer Kategorien personenbezogener Daten (Gesundheitsdaten)
                </p>
              </div>
              <div>
                <h4 className="font-medium">Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)</h4>
                <p className="text-sm text-muted-foreground">
                  Für die Bereitstellung der App-Funktionalitäten
                </p>
              </div>
              <div>
                <h4 className="font-medium">Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)</h4>
                <p className="text-sm text-muted-foreground">
                  Für technische Funktionen und Sicherheit
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Zwecke der Datenverarbeitung</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li>• Erfassung und Auswertung von Migräne-Episoden</li>
              <li>• Erstellen von personalisierten Analysen und Trends</li>
              <li>• Bereitstellung von PDF-Berichten für Arztbesuche</li>
              <li>• Medikamenten-Tracking und Übergebrauchswarnung</li>
              <li>• Korrelationsanalyse mit Wetter- und Lebensstildaten</li>
              <li>• Backup und Synchronisation zwischen Geräten</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Datenweitergabe und Drittanbieter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium">5.1 Supabase (Hosting-Provider)</h4>
                <p className="text-sm">
                  Ihre Daten werden auf Servern von Supabase in der EU verarbeitet. 
                  Supabase ist unser Auftragsverarbeiter nach Art. 28 DSGVO.
                </p>
              </div>
              <div>
                <h4 className="font-medium">5.2 Wetter-API</h4>
                <p className="text-sm">
                  Standortbezogene Wetterdaten werden von OpenWeatherMap abgerufen. 
                  Es werden nur anonymisierte Koordinaten übertragen.
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg">
                <p className="text-sm font-medium">Keine Weitergabe an Dritte!</p>
                <p className="text-sm">
                  Ihre Gesundheitsdaten werden niemals an Versicherungen, Arbeitgeber 
                  oder andere Dritte weitergegeben.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Speicherdauer</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• <strong>Gesundheitsdaten:</strong> Bis zur Löschung durch den Nutzer</li>
              <li>• <strong>Kontodaten:</strong> Bis zur Konto-Löschung</li>
              <li>• <strong>Wetterdaten:</strong> 5 Jahre (für Langzeit-Analysen)</li>
              <li>• <strong>Log-Daten:</strong> 30 Tage</li>
              <li>• <strong>Cookie-Präferenzen:</strong> 12 Monate</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Ihre Rechte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="font-medium">Auskunftsrecht (Art. 15 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Sie können jederzeit Auskunft über Ihre gespeicherten Daten verlangen.
                </p>
              </div>
              <div>
                <h4 className="font-medium">Berichtigungsrecht (Art. 16 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Unrichtige Daten können Sie jederzeit in der App korrigieren.
                </p>
              </div>
              <div>
                <h4 className="font-medium">Löschungsrecht (Art. 17 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Vollständige Kontolöschung über die App-Einstellungen möglich.
                </p>
              </div>
              <div>
                <h4 className="font-medium">Datenübertragbarkeit (Art. 20 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Export Ihrer Daten als PDF oder strukturierte Datei möglich.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8. Datensicherheit</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• End-zu-End-Verschlüsselung aller Gesundheitsdaten</li>
              <li>• Sichere Passwort-Hashes mit bcrypt</li>
              <li>• Row Level Security (RLS) in der Datenbank</li>
              <li>• Regelmäßige Sicherheits-Updates</li>
              <li>• Server-Standort in der EU (DSGVO-konform)</li>
              <li>• Backup-Verschlüsselung</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              9. Kontakt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Bei Fragen zum Datenschutz oder zur Ausübung Ihrer Rechte wenden Sie sich an:
            </p>
            <div className="mt-4 bg-muted/50 p-4 rounded-lg">
              <p><strong>Datenschutz-Kontakt:</strong></p>
              <p>E-Mail: datenschutz@[domain].de</p>
              <p>Antwortzeit: Innerhalb von 30 Tagen</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10. Beschwerderecht</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die 
              Verarbeitung Ihrer personenbezogenen Daten zu beschweren. Die zuständige 
              Behörde richtet sich nach Ihrem Wohnort/Arbeitsplatz oder unserem Firmensitz.
            </p>
          </CardContent>
        </Card>

        <div className="pb-8">
          <Button 
            onClick={() => navigate(-1)} 
            className="w-full"
          >
            Zurück zur App
          </Button>
        </div>
      </div>
    </div>
  );
}