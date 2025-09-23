import React, { useState } from "react";
import { NewEntry } from "./NewEntry";
import { EntriesList } from "./EntriesList";
import { MainMenu } from "./MainMenu";
import { AnalysisView } from "./AnalysisView";
import type { PainEntry } from "@/types/painApp";

type View = "menu" | "new" | "list" | "analysis";

export const PainApp: React.FC = () => {
  const [view, setView] = useState<View>("menu");
  const [editing, setEditing] = useState<PainEntry | null>(null);

  const goHome = () => { setEditing(null); setView("menu"); };

  return (
    <div className="min-h-screen">
      {view === "menu" && (
        <MainMenu
          onNewEntry={() => { setEditing(null); setView("new"); }}
          onViewEntries={() => setView("list")}
          onViewAnalysis={() => setView("analysis")}
        />
      )}

      {view === "new" && (
        <NewEntry
          entry={editing}
          onBack={goHome}
          onSave={goHome}
        />
      )}

      {view === "list" && (
        <EntriesList
          onBack={goHome}
          onEdit={(entry) => { setEditing(entry); setView("new"); }}
        />
      )}

      {view === "analysis" && (
        <AnalysisView onBack={goHome} />
      )}
    </div>
  );
};
export default PainApp;