import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle, Phone, Stethoscope, Heart, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function MedicalDisclaimerPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
          <h1 className="text-2xl font-bold">Medizinischer Hinweis</h1>
        </div>

        {/* Main Disclaimer */}
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Wichtiger Hinweis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg">
              Diese App ist ein <strong>Dokumentations- und Selbstbeobachtungswerkzeug</strong>. 
              Sie ersetzt keine ärztliche Beratung, Diagnose oder Behandlung.
            </p>
            <p>
              Alle Informationen, Analysen und Trends, die diese App bereitstellt, 
              dienen ausschließlich zu Informationszwecken und zur Unterstützung 
              Ihrer persönlichen Gesundheitsdokumentation.
            </p>
          </CardContent>
        </Card>

        {/* What the app does */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Was diese App bietet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                <div>
                  <p className="font-medium">Dokumentation</p>
                  <p className="text-sm text-muted-foreground">
                    Erfassung von Symptomen, Medikamenteneinnahme und möglichen Auslösern
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                <div>
                  <p className="font-medium">Statistische Auswertungen</p>
                  <p className="text-sm text-muted-foreground">
                    Visualisierung von Häufigkeiten und zeitlichen Mustern
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                <div>
                  <p className="font-medium">Berichte für Arztgespräche</p>
                  <p className="text-sm text-muted-foreground">
                    Zusammenfassungen zur Unterstützung der Kommunikation mit Ihrem Arzt
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* What the app does NOT do */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Was diese App NICHT bietet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-destructive mt-2" />
                <div>
                  <p className="font-medium">Keine Diagnosen</p>
                  <p className="text-sm text-muted-foreground">
                    Die App kann und darf keine medizinischen Diagnosen stellen
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-destructive mt-2" />
                <div>
                  <p className="font-medium">Keine Behandlungsempfehlungen</p>
                  <p className="text-sm text-muted-foreground">
                    Medikamenten- oder Therapieentscheidungen treffen Sie mit Ihrem Arzt
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-destructive mt-2" />
                <div>
                  <p className="font-medium">Keine medizinischen Ratschläge</p>
                  <p className="text-sm text-muted-foreground">
                    Hinweise und Korrelationen sind rein informativ, nicht als Handlungsanweisung zu verstehen
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* AI Disclaimer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Hinweis zu KI-Funktionen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              Diese App kann KI-gestützte Analysen und Zusammenfassungen erstellen. 
              Diese automatisierten Auswertungen:
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside ml-2">
              <li>Können Fehler enthalten</li>
              <li>Basieren auf den von Ihnen eingegebenen Daten</li>
              <li>Ersetzen keine ärztliche Expertise</li>
              <li>Sollten kritisch hinterfragt werden</li>
            </ul>
            <p className="text-sm">
              Bei Unklarheiten oder wenn Ihnen etwas ungewöhnlich erscheint, 
              konsultieren Sie bitte immer einen Arzt.
            </p>
          </CardContent>
        </Card>

        {/* Emergency */}
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Phone className="h-5 w-5" />
              Im Notfall
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-medium">
              Rufen Sie bei folgenden Symptomen sofort 112 an:
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside ml-2">
              <li>Plötzliche, extrem starke Kopfschmerzen („Vernichtungskopfschmerz")</li>
              <li>Kopfschmerzen mit Bewusstseinsveränderungen</li>
              <li>Kopfschmerzen mit neurologischen Ausfällen (Lähmungen, Sehstörungen, Sprachstörungen)</li>
              <li>Kopfschmerzen mit hohem Fieber und Nackensteife</li>
              <li>Kopfschmerzen nach Kopfverletzung</li>
            </ul>
            <div className="bg-destructive/10 rounded-lg p-4 mt-4">
              <p className="text-lg font-bold text-center">
                Notruf Deutschland: 112
              </p>
              <p className="text-sm text-center text-muted-foreground mt-1">
                Ärztlicher Bereitschaftsdienst: 116 117
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Closing */}
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Diese App wurde mit größter Sorgfalt entwickelt, um Ihnen bei der 
              Dokumentation Ihrer Gesundheitsdaten zu helfen. Dennoch übernehmen 
              wir keine Haftung für Entscheidungen, die Sie auf Basis der 
              App-Informationen treffen. Bitte konsultieren Sie bei allen 
              gesundheitlichen Fragen einen qualifizierten Arzt.
            </p>
          </CardContent>
        </Card>

        <div className="pb-8">
          <Button onClick={() => navigate(-1)} className="w-full">
            Zurück zur App
          </Button>
        </div>
      </div>
    </div>
  );
}
