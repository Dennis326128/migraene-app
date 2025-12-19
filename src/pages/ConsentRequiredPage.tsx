import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, LogIn, ArrowRight, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function ConsentRequiredPage() {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate("/auth");
  };

  const handleRetryConsent = () => {
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-950">
              <Shield className="h-8 w-8 text-amber-600" />
            </div>
          </div>
          <CardTitle className="text-xl">Einwilligung erforderlich</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  Diese App verarbeitet Gesundheitsdaten
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Um die App nutzen zu können, ist Ihre ausdrückliche Einwilligung 
                  zur Verarbeitung Ihrer Gesundheitsdaten nach Art. 9 DSGVO erforderlich.
                </p>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Ohne Einwilligung können Sie:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Keine Schmerzeinträge erstellen</li>
              <li>Keine Medikamente dokumentieren</li>
              <li>Keine Analysen und Berichte erstellen</li>
            </ul>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              Ihre Entscheidung wird respektiert. Wenn Sie die App nicht nutzen 
              möchten, werden keine Daten von Ihnen gespeichert.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Button onClick={handleRetryConsent} className="w-full">
              <ArrowRight className="h-4 w-4 mr-2" />
              Einwilligung erteilen
            </Button>
            
            <Button variant="outline" onClick={handleLogin} className="w-full">
              <LogIn className="h-4 w-4 mr-2" />
              Zur Anmeldung
            </Button>
          </div>

          <div className="text-center text-xs text-muted-foreground pt-4 border-t">
            <p>
              Weitere Informationen:{" "}
              <Link to="/privacy" className="text-primary underline hover:no-underline">
                Datenschutzerklärung
              </Link>
              {" • "}
              <Link to="/medical-disclaimer" className="text-primary underline hover:no-underline">
                Medizinischer Hinweis
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
