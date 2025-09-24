import React from "react";
import { Button } from "@/components/ui/button";
import SettingsForm from "@/features/settings/components/SettingsForm";

export default function SettingsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="p-4">
      <Button onClick={onBack} className="mb-4">← Zurück</Button>
      <SettingsForm />
    </div>
  );
}