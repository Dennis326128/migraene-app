import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Database, User, Mail, Heart, Brain, AlertTriangle, Building2, Clock, Lock, Scale } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { AppHeader } from "@/components/ui/app-header";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Datenschutzerklärung" onBack={() => navigate(-1)} sticky />
      <div className="p-4 max-w-4xl mx-auto space-y-6">

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
              <p className="font-medium">Letzte Aktualisierung: Dezember 2025</p>
              <p>Version: 1.1</p>
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
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                <p className="text-amber-800 dark:text-amber-200 font-medium">[VERANTWORTLICHER_NAME/FIRMA]</p>
                <p className="text-amber-700 dark:text-amber-300">[ADRESSE]</p>
                <p className="text-amber-700 dark:text-amber-300">[PLZ_ORT]</p>
                <p className="text-amber-700 dark:text-amber-300">E-Mail: [KONTAKT_EMAIL]</p>
              </div>
              <div className="mt-4">
                <p><strong>Datenschutzbeauftragter (falls benannt):</strong></p>
                <p className="text-muted-foreground">[DPO_KONTAKT] (optional)</p>
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
              <h3 className="font-semibold mb-3">2.1 Gesundheitsdaten (besondere Kategorie nach Art. 9 DSGVO)</h3>
              <ul className="space-y-2 text-sm">
                <li>• Schmerzintensität und -verlauf</li>
                <li>• Symptome und mögliche Auslöser</li>
                <li>• Medikamenteneinnahme und subjektive Wirkungseinschätzung</li>
                <li>• Lebensstil-Faktoren (z.B. Schlaf, Stress)</li>
                <li>• Optionale Zyklusdaten (bei Aktivierung)</li>
                <li>• Sprachnotizen und deren Transkripte</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-3">2.2 Technische Daten</h3>
              <ul className="space-y-2 text-sm">
                <li>• Standortdaten (für Wetterdaten, optional und auf Anfrage)</li>
                <li>• Wetterdaten (Luftdruck, Temperatur)</li>
                <li>• Nutzungszeitpunkte und Gerätetyp</li>
                <li>• Cookie-Präferenzen und lokale Speicherung</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-3">2.3 Kontodaten</h3>
              <ul className="space-y-2 text-sm">
                <li>• E-Mail-Adresse (für Login und Wiederherstellung)</li>
                <li>• Passwort (nur in gehashter Form gespeichert)</li>
                <li>• Nutzer-Einstellungen und Präferenzen</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Art. 9 DSGVO Section */}
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Heart className="h-5 w-5" />
              3. Verarbeitung von Gesundheitsdaten (Art. 9 DSGVO)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-primary/5 p-4 rounded-lg">
              <p className="font-medium mb-2">Besondere Kategorie personenbezogener Daten</p>
              <p className="text-sm text-muted-foreground">
                Gesundheitsdaten gehören nach Art. 9 DSGVO zu den besonderen Kategorien 
                personenbezogener Daten und unterliegen einem erhöhten Schutzniveau.
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Rechtsgrundlage: Ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO)</h4>
              <p className="text-sm text-muted-foreground">
                Die Verarbeitung Ihrer Gesundheitsdaten erfolgt ausschließlich auf Grundlage 
                Ihrer ausdrücklichen Einwilligung, die Sie bei der ersten Nutzung der App erteilen. 
                Diese Einwilligung ist freiwillig und kann jederzeit in den App-Einstellungen 
                unter "Datenschutz & Sicherheit" widerrufen werden.
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Zweck der Verarbeitung</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Erfassung und Dokumentation Ihrer Symptome</li>
                <li>• Erstellung von Trendanalysen und Statistiken für Sie persönlich</li>
                <li>• Generierung von Berichten zur Unterstützung von Arztgesprächen</li>
                <li>• Dokumentation Ihrer Medikamenteneinnahme</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Widerruf der Einwilligung</h4>
              <p className="text-sm text-muted-foreground">
                Sie können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen. 
                Der Widerruf erfolgt über die App-Einstellungen. Nach dem Widerruf werden 
                die App-Funktionen eingeschränkt. Sie können Ihre Daten vorher exportieren.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              4. Rechtsgrundlagen der Verarbeitung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium">Art. 9 Abs. 2 lit. a DSGVO (Ausdrückliche Einwilligung)</h4>
                <p className="text-sm text-muted-foreground">
                  Für die Verarbeitung von Gesundheitsdaten
                </p>
              </div>
              <div>
                <h4 className="font-medium">Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</h4>
                <p className="text-sm text-muted-foreground">
                  Für optionale Funktionen wie Wetter-Korrelation und Standortdaten
                </p>
              </div>
              <div>
                <h4 className="font-medium">Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)</h4>
                <p className="text-sm text-muted-foreground">
                  Für die Bereitstellung der grundlegenden App-Funktionalitäten
                </p>
              </div>
              <div>
                <h4 className="font-medium">Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)</h4>
                <p className="text-sm text-muted-foreground">
                  Für technische Funktionen und Sicherheitsmaßnahmen
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Zwecke der Datenverarbeitung</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li>• Erfassung und Auswertung Ihrer Symptome</li>
              <li>• Erstellen von personalisierten Analysen und Trends</li>
              <li>• Bereitstellung von Berichten für Arztbesuche</li>
              <li>• Dokumentation Ihrer Medikamenteneinnahme</li>
              <li>• Backup und Synchronisation zwischen Geräten</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              6. Datenweitergabe und Auftragsverarbeiter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium">6.1 Hosting-Provider</h4>
                <p className="text-sm text-muted-foreground">
                  Ihre Daten werden bei einem Cloud-Anbieter gespeichert, der als 
                  Auftragsverarbeiter nach Art. 28 DSGVO fungiert.
                </p>
              </div>
              <div>
                <h4 className="font-medium">6.2 Wetter-Dienst</h4>
                <p className="text-sm text-muted-foreground">
                  Für die Wetterfunktion werden gerundete Standortkoordinaten an einen 
                  Wetterdienst übermittelt.
                </p>
              </div>
              <div>
                <h4 className="font-medium">6.3 Authentifizierung (optional)</h4>
                <p className="text-sm text-muted-foreground">
                  Bei Nutzung von Social Login werden grundlegende Profildaten vom 
                  jeweiligen Anbieter übermittelt.
                </p>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg mt-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">[SUBPROCESSORS_LIST]</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Vollständige Liste aller Auftragsverarbeiter hier einfügen
                </p>
              </div>
              
              <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg">
                <p className="text-sm font-medium">Keine Weitergabe an Dritte</p>
                <p className="text-sm text-muted-foreground">
                  Ihre Gesundheitsdaten werden nicht an Versicherungen, Arbeitgeber 
                  oder andere Dritte weitergegeben.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI/Automation Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              7. Automatisierte Verarbeitung und KI-Funktionen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Die App kann KI-gestützte Funktionen zur Analyse Ihrer Daten nutzen. 
              Diese Funktionen können in den Einstellungen aktiviert oder deaktiviert werden.
            </p>

            <div>
              <h4 className="font-medium mb-2">7.1 Spracherkennung</h4>
              <p className="text-sm text-muted-foreground">
                Sprachnotizen können transkribiert werden, um die Eingabe zu erleichtern.
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-2">7.2 Musteranalyse</h4>
              <p className="text-sm text-muted-foreground">
                Die App kann Ihre Einträge analysieren, um mögliche Zusammenhänge 
                aufzuzeigen. Diese Analysen sind rein informativ.
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Kein Profiling für automatisierte Entscheidungen
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Es findet kein Profiling statt, das rechtliche Wirkung entfaltet oder 
                  Sie erheblich beeinträchtigt (Art. 22 DSGVO).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              8. Speicherdauer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• <strong>Gesundheitsdaten:</strong> Bis zur Löschung durch Sie oder Account-Löschung</li>
              <li>• <strong>Kontodaten:</strong> Bis zur Konto-Löschung + Widerrufsfrist</li>
              <li>• <strong>Wetterdaten:</strong> Entsprechend Ihrer Einstellungen</li>
              <li>• <strong>Cookie-Präferenzen:</strong> 12 Monate</li>
              <li>• <strong>Einwilligungsnachweise:</strong> Gemäß gesetzlicher Nachweispflicht</li>
            </ul>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg mt-4">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">[RETENTION_POLICY]</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Detaillierte Aufbewahrungsrichtlinie hier einfügen
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              9. Ihre Rechte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="font-medium">Auskunftsrecht (Art. 15 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Sie können Auskunft über Ihre gespeicherten Daten verlangen.
                </p>
              </div>
              <div>
                <h4 className="font-medium">Berichtigungsrecht (Art. 16 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Unrichtige Daten können Sie in der App korrigieren.
                </p>
              </div>
              <div>
                <h4 className="font-medium">Löschungsrecht (Art. 17 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Kontolöschung über die App-Einstellungen möglich.
                </p>
              </div>
              <div>
                <h4 className="font-medium">Datenübertragbarkeit (Art. 20 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Export Ihrer Daten in der App verfügbar.
                </p>
              </div>
              <div>
                <h4 className="font-medium">Widerspruchsrecht (Art. 21 DSGVO)</h4>
                <p className="text-sm text-muted-foreground">
                  Gegen bestimmte Verarbeitungen können Sie Widerspruch einlegen.
                </p>
              </div>
              <div>
                <h4 className="font-medium">Widerruf der Einwilligung</h4>
                <p className="text-sm text-muted-foreground">
                  Einwilligungen können in den App-Einstellungen widerrufen werden.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              10. Datensicherheit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Wir setzen technische und organisatorische Maßnahmen ein, um Ihre Daten zu schützen:
            </p>
            <ul className="space-y-2 text-sm">
              <li>• Verschlüsselung der Datenübertragung</li>
              <li>• Sichere Speicherung von Zugangsdaten</li>
              <li>• Zugriffskontrolle auf Datenbankebene</li>
              <li>• Regelmäßige Sicherheitsprüfungen</li>
            </ul>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg mt-4">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">[SECURITY_MEASURES_SUMMARY]</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Detaillierte Sicherheitsmaßnahmen hier einfügen
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              11. Kontakt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Bei Fragen zum Datenschutz oder zur Ausübung Ihrer Rechte:
            </p>
            <div className="mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
              <p><strong>Datenschutz-Kontakt:</strong></p>
              <p className="text-amber-700 dark:text-amber-300">E-Mail: [KONTAKT_EMAIL]</p>
              <p className="text-muted-foreground">Antwortzeit: Innerhalb von 30 Tagen</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>12. Beschwerderecht</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die 
              Verarbeitung Ihrer personenbezogenen Daten zu beschweren.
            </p>
            <div className="mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">[DPA_INFO]</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Kontaktdaten der zuständigen Datenschutzbehörde hier einfügen
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Medical Disclaimer */}
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              13. Medizinischer Hinweis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Diese App dient ausschließlich zu Dokumentationszwecken. 
              Sie ersetzt keine ärztliche Beratung, Diagnose oder Behandlung.
            </p>
            <p className="text-sm mt-2">
              <Link 
                to="/medical-disclaimer" 
                className="text-primary underline hover:no-underline"
              >
                → Ausführlichen medizinischen Hinweis lesen
              </Link>
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
