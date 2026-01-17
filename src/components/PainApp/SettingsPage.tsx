import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsLayout } from "./Settings/SettingsLayout";
import { SettingsOverview } from "./Settings/SettingsOverview";
import { SettingsMedications } from "./Settings/SettingsMedications";
import { SettingsPrivacy } from "./Settings/SettingsPrivacy";
import { SettingsHelp } from "./Settings/SettingsHelp";
import { SettingsAccount } from "./Settings/SettingsAccount";
import { SettingsDoctorsWithOrigin } from "./Settings/SettingsDoctorsWithOrigin";
import { SettingsLogout } from "./Settings/SettingsLogout";
import { PWAInstallGuide } from "@/components/PWA";

// Language is now handled via modal, no full page needed
type SettingsSection = 'overview' | 'medications' | 'privacy' | 'help' | 'account' | 'doctors' | 'logout' | 'install';

const SettingsPage = ({ onBack }: { onBack: () => void }) => {
  const { t } = useTranslation();
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
        return t('medication.medications');
      case 'privacy':
        return t('settings.privacy');
      case 'help':
        return t('settings.help');
      case 'account':
        return t('settings.account');
      case 'doctors':
        return t('doctor.doctors');
      case 'logout':
        return t('auth.logout');
      case 'install':
        return t('settings.installApp');
      default:
        return t('settings.title');
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
    </SettingsLayout>
  );
};

export default SettingsPage;