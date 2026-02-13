import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from "@/components/ui/app-header";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="AGB" onBack={() => navigate(-1)} sticky />
      <div className="p-4 max-w-4xl mx-auto space-y-6">

        <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg flex gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Wichtiger Hinweis</p>
            <p className="text-sm text-muted-foreground">
              Diese App dient ausschließlich der persönlichen Dokumentation und ersetzt keine 
              ärztliche Beratung, Diagnose oder Behandlung. Bei gesundheitlichen Beschwerden 
              konsultieren Sie immer einen Arzt.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              1. Geltungsbereich
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Diese Allgemeinen Geschäftsbedingungen (nachfolgend "AGB") gelten für die Nutzung 
              der Migräne-Tagebuch-App (nachfolgend "App") durch Sie als Nutzer/in.
            </p>
            <p>
              Anbieter der App ist [Name/Firma des Betreibers], [Adresse] 
              (nachfolgend "Anbieter" oder "wir").
            </p>
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="font-medium">Stand der AGB: Januar 2025</p>
              <p>Version: 1.0</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Vertragsschluss und Registrierung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              2.1 Mit der Registrierung und Erstellung eines Nutzerkontos erklären Sie sich mit 
              diesen AGB und unserer Datenschutzerklärung einverstanden.
            </p>
            <p>
              2.2 Die Nutzung der App ist nur volljährigen Personen (ab 18 Jahren) gestattet.
            </p>
            <p>
              2.3 Bei der Registrierung sind wahrheitsgemäße Angaben zu machen. Sie sind 
              verpflichtet, Ihre Zugangsdaten geheim zu halten.
            </p>
            <p>
              2.4 Pro Person ist nur ein Nutzerkonto zulässig.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Leistungsbeschreibung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium">Die App bietet folgende Hauptfunktionen:</p>
            <ul className="space-y-2 ml-4">
              <li className="flex gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                Dokumentation von Migräne-Episoden und Symptomen
              </li>
              <li className="flex gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                Tracking von Medikamenteneinnahme und -wirkung
              </li>
              <li className="flex gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                Analyse von Auslösern und Mustern
              </li>
              <li className="flex gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                Export von Berichten (PDF) für Arztbesuche
              </li>
              <li className="flex gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                Synchronisation zwischen Geräten
              </li>
            </ul>
            <p className="mt-4">
              3.2 Der Anbieter behält sich vor, die Funktionen der App weiterzuentwickeln, 
              anzupassen oder einzuschränken, soweit dies für den Nutzer zumutbar ist.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              4. Medizinischer Haftungsausschluss
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-lg space-y-2">
              <p className="font-medium">4.1 Keine medizinische Beratung</p>
              <p>
                Die App dient ausschließlich der persönlichen Dokumentation. Sie ersetzt keine 
                ärztliche Beratung, Diagnose oder Behandlung.
              </p>
            </div>
            <p>
              4.2 Die in der App bereitgestellten Informationen und Analysen sind nicht als 
              medizinischer Rat zu verstehen.
            </p>
            <p>
              4.3 Bei gesundheitlichen Beschwerden konsultieren Sie immer einen Arzt. 
              Nehmen Sie keine Medikamente ohne ärztliche Anweisung ein oder ab.
            </p>
            <p>
              4.4 Im medizinischen Notfall wählen Sie den Notruf 112.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Nutzungsrechte und Pflichten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              5.1 Sie erhalten ein nicht-exklusives, nicht-übertragbares Recht zur Nutzung 
              der App für private, nicht-kommerzielle Zwecke.
            </p>
            <div className="space-y-2 mt-3">
              <p className="font-medium">5.2 Unzulässige Nutzungen:</p>
              <ul className="space-y-1 ml-4">
                <li className="flex gap-2">
                  <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  Weitergabe oder Verkauf von Zugangsdaten
                </li>
                <li className="flex gap-2">
                  <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  Automatisiertes Auslesen der App (Scraping)
                </li>
                <li className="flex gap-2">
                  <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  Reverse Engineering oder Dekompilierung
                </li>
                <li className="flex gap-2">
                  <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  Nutzung für kommerzielle Zwecke ohne Genehmigung
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Datenschutz und Datensicherheit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              6.1 Der Schutz Ihrer Gesundheitsdaten hat höchste Priorität. Details zur 
              Datenverarbeitung finden Sie in unserer{' '}
              <button 
                onClick={() => navigate('/privacy')}
                className="text-primary underline hover:no-underline"
              >
                Datenschutzerklärung
              </button>.
            </p>
            <p>
              6.2 Ihre Daten werden verschlüsselt gespeichert und nur auf EU-Servern verarbeitet.
            </p>
            <p>
              6.3 Wir geben Ihre Gesundheitsdaten niemals an Dritte weiter (keine Versicherungen, 
              Arbeitgeber oder sonstige Dritte).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Verfügbarkeit und technische Anforderungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              7.1 Wir bemühen uns um eine hohe Verfügbarkeit der App, können jedoch keine 
              100%ige Verfügbarkeit garantieren.
            </p>
            <p>
              7.2 Wartungsarbeiten können zu temporären Einschränkungen führen. Wir werden 
              Sie nach Möglichkeit rechtzeitig informieren.
            </p>
            <p>
              7.3 Sie sind selbst für eine stabile Internetverbindung und kompatible Endgeräte 
              verantwortlich.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8. Haftung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              8.1 Wir haften uneingeschränkt für Schäden aus der Verletzung des Lebens, des 
              Körpers oder der Gesundheit sowie für Vorsatz und grobe Fahrlässigkeit.
            </p>
            <p>
              8.2 Bei leichter Fahrlässigkeit haften wir nur bei Verletzung wesentlicher 
              Vertragspflichten (Kardinalpflichten).
            </p>
            <p>
              8.3 Die Haftung für mittelbare Schäden, Folgeschäden und entgangenen Gewinn 
              ist ausgeschlossen, soweit gesetzlich zulässig.
            </p>
            <p>
              8.4 Für den Verlust von Daten haften wir nur, wenn dieser durch angemessene 
              Datensicherungsmaßnahmen durch den Nutzer nicht vermeidbar gewesen wäre.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>9. Kündigung und Löschung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              9.1 Sie können Ihr Nutzerkonto jederzeit ohne Einhaltung einer Frist über die 
              App-Einstellungen löschen.
            </p>
            <p>
              9.2 Wir können Ihr Konto bei Verstößen gegen diese AGB nach Abmahnung mit einer 
              Frist von 14 Tagen kündigen.
            </p>
            <p>
              9.3 Bei der Konto-Löschung werden alle Ihre Daten unwiderruflich gelöscht 
              (DSGVO-konform). Ein Export Ihrer Daten sollte vorher durchgeführt werden.
            </p>
            <p>
              9.4 Nach der Löschung besteht kein Anspruch auf Wiederherstellung der Daten.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10. Änderungen der AGB</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              10.1 Wir behalten uns vor, diese AGB bei Bedarf zu ändern (z.B. bei neuen 
              Funktionen oder rechtlichen Anforderungen).
            </p>
            <p>
              10.2 Über wesentliche Änderungen werden Sie per E-Mail informiert.
            </p>
            <p>
              10.3 Widersprechen Sie den Änderungen nicht innerhalb von 6 Wochen, gelten 
              diese als akzeptiert. Auf Ihr Widerspruchsrecht werden wir Sie in der 
              Änderungsmitteilung hinweisen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>11. Schlussbestimmungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              11.1 Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des 
              UN-Kaufrechts.
            </p>
            <p>
              11.2 Gerichtsstand für alle Streitigkeiten ist, soweit gesetzlich zulässig, 
              der Sitz des Anbieters.
            </p>
            <p>
              11.3 Sollten einzelne Bestimmungen dieser AGB unwirksam sein oder werden, 
              berührt dies die Wirksamkeit der übrigen Bestimmungen nicht.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>12. Kontakt</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>Bei Fragen zu diesen AGB wenden Sie sich an:</p>
            <div className="mt-3 bg-muted/50 p-3 rounded-lg">
              <p>[Name/Firma]</p>
              <p>E-Mail: [kontakt@ihre-domain.de]</p>
            </div>
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
