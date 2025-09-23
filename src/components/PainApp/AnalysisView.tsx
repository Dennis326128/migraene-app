import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";
import DiaryReport from "@/components/PainApp/DiaryReport";

interface AnalysisViewProps {
  onBack: () => void;
}

export const AnalysisView = ({ onBack }: AnalysisViewProps) => {
  const [viewMode, setViewMode] = useState<"menu" | "tagebuch">("menu");

  if (viewMode === "tagebuch") {
    return <DiaryReport onBack={() => setViewMode("menu")} />;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <h1 className="text-2xl font-bold">Auswertungen & Berichte</h1>
        </div>

        <div className="grid gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("tagebuch")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Kopfschmerztagebuch (PDF)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Erstellen Sie einen detaillierten Bericht Ihrer Kopfschmerzen mit Filtermöglichkeiten für Zeiträume und Medikamente.
              </p>
            </CardContent>
          </Card>

          <Card className="opacity-50">
            <CardHeader>
              <CardTitle>Weitere Analysen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Zusätzliche Analyse-Features werden in einer zukünftigen Version verfügbar sein.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};