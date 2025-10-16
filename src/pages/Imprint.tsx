import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building, Mail, Phone, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Imprint() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
          <h1 className="text-3xl font-bold">Impressum</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Angaben gemäß § 5 TMG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <p className="font-medium">[Name/Firma des Betreibers]</p>
              <p>[Straße und Hausnummer]</p>
              <p>[PLZ und Ort]</p>
              <p>[Land]</p>
            </div>

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Kontakt
              </h3>
              <div className="space-y-1 text-sm">
                <p>E-Mail: [kontakt@ihre-domain.de]</p>
                <p>Telefon: [+49 (0) XXX XXXXXXX]</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vertretungsberechtigte Person(en)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">[Name der vertretungsberechtigten Person]</p>
            <p className="text-sm text-muted-foreground mt-2">
              (bei Einzelunternehmen: Inhaber/in; bei GmbH: Geschäftsführer/in)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Registereintrag (falls vorhanden)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="font-medium">Handelsregister:</p>
              <p className="text-muted-foreground">[HRB XXXXX, Amtsgericht XXXX]</p>
            </div>
            <div>
              <p className="font-medium">Umsatzsteuer-ID:</p>
              <p className="text-muted-foreground">[DE XXXXXXXXX]</p>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              (Hinweis: Nur ausfüllen wenn vorhanden. Kleinunternehmer ohne Eintrag können diese Felder leer lassen)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <p>[Name der verantwortlichen Person]</p>
              <p className="text-muted-foreground">(Anschrift wie oben)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Haftungsausschluss</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium">Haftung für Inhalte</h4>
              <p className="text-muted-foreground">
                Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, 
                Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. 
                Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten 
                nach den allgemeinen Gesetzen verantwortlich.
              </p>
            </div>

            <div>
              <h4 className="font-medium">Haftung für Links</h4>
              <p className="text-muted-foreground">
                Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen 
                Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. 
                Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der 
                Seiten verantwortlich.
              </p>
            </div>

            <div>
              <h4 className="font-medium">Urheberrecht</h4>
              <p className="text-muted-foreground">
                Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen 
                dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art 
                der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen 
                Zustimmung des jeweiligen Autors bzw. Erstellers.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Online-Streitbeilegung (OS)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-muted-foreground mb-2">
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:
            </p>
            <a 
              href="https://ec.europa.eu/consumers/odr" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline"
            >
              https://ec.europa.eu/consumers/odr
            </a>
            <p className="text-muted-foreground mt-2">
              Unsere E-Mail-Adresse finden Sie oben im Impressum.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verbraucherstreitbeilegung</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer 
              Verbraucherschlichtungsstelle teilzunehmen.
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
