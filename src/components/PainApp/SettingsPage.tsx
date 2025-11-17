import { useState } from "react";
import { SettingsLayout } from "./Settings/SettingsLayout";
import { SettingsOverview } from "./Settings/SettingsOverview";
import { SettingsMedications } from "./Settings/SettingsMedications";
import { SettingsPrivacy } from "./Settings/SettingsPrivacy";
import { SettingsAdvanced } from "./Settings/SettingsAdvanced";

type SettingsSection = 'overview' | 'medications' | 'privacy' | 'advanced';

const SettingsPage = ({ onBack }: { onBack: () => void }) => {
  const [section, setSection] = useState<SettingsSection>('overview');

  const handleBack = () => {
    if (section === 'overview') {
      onBack();
    } else {
      setSection('overview');
    }
  };

  const getTitle = () => {
    switch (section) {
      case 'medications':
        return 'Medikamente';
      case 'privacy':
        return 'Datenschutz & Sicherheit';
      case 'advanced':
        return 'Erweitert';
      default:
        return 'Einstellungen';
    }
  };

  return (
    <SettingsLayout title={getTitle()} onBack={handleBack}>
      {section === 'overview' && (
        <SettingsOverview onNavigate={setSection} />
      )}
      {section === 'medications' && <SettingsMedications />}
      {section === 'privacy' && <SettingsPrivacy />}
      {section === 'advanced' && <SettingsAdvanced />}
    </SettingsLayout>
  );
};

export default SettingsPage;