import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileText, Pill, ClipboardList, History } from "lucide-react";

interface ReportsHubPageProps {
  onBack: () => void;
  onSelectReportType: (type: 'diary' | 'medication_plan' | 'hit6') => void;
  onViewHistory: () => void;
}

export const ReportsHubPage: React.FC<ReportsHubPageProps> = ({
  onBack,
  onSelectReportType,
  onViewHistory,
}) => {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Berichte & PDFs</h1>
          </div>
        </div>

        {/* Section: Create Report */}
        <div className="space-y-3">
          <h2 className="text-base font-medium text-muted-foreground">
            Was möchtest du erstellen?
          </h2>

          {/* Report Type Cards */}
          <div className="space-y-3">
            {/* Kopfschmerztagebuch */}
            <Card 
              className="cursor-pointer hover:bg-muted/30 transition-colors border-border/50"
              onClick={() => onSelectReportType('diary')}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-base block">
                    Kopfschmerztagebuch (PDF)
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Medikationsplan */}
            <Card 
              className="cursor-pointer hover:bg-muted/30 transition-colors border-border/50"
              onClick={() => onSelectReportType('medication_plan')}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-500/10 shrink-0">
                  <Pill className="h-6 w-6 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-base block">
                    Medikationsplan (PDF)
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* HIT-6 Fragebogen */}
            <Card 
              className="cursor-pointer hover:bg-muted/30 transition-colors border-border/50"
              onClick={() => onSelectReportType('hit6')}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-orange-500/10 shrink-0">
                  <ClipboardList className="h-6 w-6 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-base block">
                    HIT-6 Fragebogen (PDF)
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section: History */}
        <div className="pt-4">
          <Card 
            className="cursor-pointer hover:bg-muted/30 transition-colors border-border/50"
            onClick={onViewHistory}
          >
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-muted shrink-0">
                <History className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-base block">Verlauf</span>
                <span className="text-xs text-muted-foreground">
                  Erstellte Berichte ansehen & herunterladen
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ReportsHubPage;
