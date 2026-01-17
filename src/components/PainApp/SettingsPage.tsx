import { useState } from "react";
import { SettingsLayout } from "./Settings/SettingsLayout";
import { SettingsOverview } from "./Settings/SettingsOverview";
import { SettingsMedications } from "./Settings/SettingsMedications";
import { SettingsPrivacy } from "./Settings/SettingsPrivacy";
import { SettingsHelp } from "./Settings/SettingsHelp";
import { SettingsAccount } from "./Settings/SettingsAccount";
import { SettingsDoctorsWithOrigin } from "./Settings/SettingsDoctorsWithOrigin";
import { SettingsLogout } from "./Settings/SettingsLogout";
import { SettingsLanguage } from "./Settings/SettingsLanguage";
import { PWAInstallGuide } from "@/components/PWA";

type SettingsSection = 'overview' | 'medications' | 'privacy' | 'help' | 'account' | 'doctors' | 'logout' | 'install' | 'language';

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
      case 'help':
        return 'Hilfe & Tutorial';
      case 'account':
        return 'Persönliche Daten';
      case 'doctors':
        return 'Behandelnde Ärzte';
      case 'logout':
        return 'Abmelden';
      case 'install':
        return 'App installieren';
      case 'language':
        return 'Sprache';
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
      {section === 'help' && <SettingsHelp />}
      {section === 'account' && <SettingsAccount onReturn={() => setSection('overview')} />}
      {section === 'doctors' && (
        <SettingsDoctorsWithOrigin 
          onBack={() => setSection('overview')}
        />
      )}
      {section === 'logout' && <SettingsLogout />}
      {section === 'install' && <PWAInstallGuide />}
      {section === 'language' && <SettingsLanguage />}
    </SettingsLayout>
  );
};

export default SettingsPage;