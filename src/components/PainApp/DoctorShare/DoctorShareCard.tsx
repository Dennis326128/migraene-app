/**
 * DoctorShareCard
 * Card für ReportsHubPage: "Mit Arzt teilen"
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { UserRound, ChevronRight } from "lucide-react";

interface DoctorShareCardProps {
  onClick: () => void;
}

export const DoctorShareCard: React.FC<DoctorShareCardProps> = ({ onClick }) => {
  return (
    <Card 
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <UserRound className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground">Mit Arzt teilen</h3>
          <p className="text-sm text-muted-foreground">
            Ihr Arzt kann Ihre Daten 24h online einsehen
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </CardContent>
    </Card>
  );
};
