import { useEffect, useRef } from "react";
import { SettingsLayout } from "./SettingsLayout";
import { SettingsDoctorsWithOrigin } from "./SettingsDoctorsWithOrigin";

interface SettingsDoctorsPageProps {
  onBack: () => void;
  origin?: 'export_migraine_diary';
  editDoctorId?: string;
  onSaveSuccess?: () => void;
}

export const SettingsDoctorsPage = ({ 
  onBack, 
  origin, 
  editDoctorId, 
  onSaveSuccess 
}: SettingsDoctorsPageProps) => {
  return (
    <SettingsLayout title="Behandelnde Ärzte" onBack={onBack}>
      <SettingsDoctorsWithOrigin
        origin={origin}
        editDoctorId={editDoctorId}
        onSaveSuccess={onSaveSuccess}
        onBack={onBack}
      />
    </SettingsLayout>
  );
};
