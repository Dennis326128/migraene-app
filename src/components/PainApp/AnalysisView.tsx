import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface AnalysisViewProps {
  onBack: () => void;
}

export const AnalysisView = ({ onBack }: AnalysisViewProps) => {
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

        <Card>
          <CardHeader>
            <CardTitle>Analyse-Features</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Die Analyse-Features werden in einer zukünftigen Version verfügbar sein.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};