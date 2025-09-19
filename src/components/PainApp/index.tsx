import { useState, useEffect } from "react";
import { MainMenu } from "./MainMenu";
import { NewEntry } from "./NewEntry";
import { EntriesList } from "./EntriesList";
import { AnalysisView } from "./AnalysisView";
import { useToast } from "@/hooks/use-toast";
import { PainEntry, WeatherData } from "@/types/painApp";

type AppView = "main" | "new-entry" | "entries-list" | "analysis";

export const PainApp = () => {
  const [currentView, setCurrentView] = useState<AppView>("main");
  const [editEntry, setEditEntry] = useState<PainEntry | null>(null); // 🔹 neu für Bearbeiten
  const { toast } = useToast();

  const handleEditEntry = (entry: PainEntry) => {
    setEditEntry(entry);
    setCurrentView("new-entry");
  };

  const handleEntrySaved = () => {
    setEditEntry(null);
    setCurrentView("main");
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case "new-entry":
        return (
          <NewEntry
            onBack={() => setCurrentView("main")}
            onSave={handleEntrySaved}
            entry={editEntry} // 🔹 Bearbeitungsmodus
          />
        );
      case "entries-list":
        return (
          <EntriesList
            onBack={() => setCurrentView("main")}
            onEdit={handleEditEntry} // 🔹 Edit-Funktion weitergeben
          />
        );
      case "analysis":
        return <AnalysisView onBack={() => setCurrentView("main")} />;
      default:
        return (
          <MainMenu
            onNewEntry={() => {
              setEditEntry(null);
              setCurrentView("new-entry");
            }}
            onViewEntries={() => setCurrentView("entries-list")}
            onViewAnalysis={() => setCurrentView("analysis")}
          />
        );
    }
  };

  return <div className="min-h-screen bg-background">{renderCurrentView()}</div>;
};
