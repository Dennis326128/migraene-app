import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { SaveButton } from "@/components/ui/navigation-buttons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatientData, useUpsertPatientData } from "@/features/account/hooks/useAccount";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export const SettingsAccount = ({ onReturn }: { onReturn?: () => void }) => {
  const [userEmail, setUserEmail] = useState<string>("");
  const [newEmail, setNewEmail] = useState<string>("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  // Patient data state
  const { data: patientData } = usePatientData();
  const upsertPatient = useUpsertPatientData();
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [healthInsurance, setHealthInsurance] = useState("");
  const [insuranceNumber, setInsuranceNumber] = useState("");

  // Load user email
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setUserEmail(data.user.email);
        setNewEmail(data.user.email);
      }
    });
  }, []);

  // Load patient data
  useEffect(() => {
    if (patientData) {
      setFirstName(patientData.first_name || "");
      setLastName(patientData.last_name || "");
      setStreet(patientData.street || "");
      setPostalCode(patientData.postal_code || "");
      setCity(patientData.city || "");
      setPhone(patientData.phone || "");
      setFax(patientData.fax || "");
      setDateOfBirth(patientData.date_of_birth || "");
      setHealthInsurance(patientData.health_insurance || "");
      setInsuranceNumber(patientData.insurance_number || "");
    }
  }, [patientData]);

  const handleUpdateEmail = async () => {
    if (!newEmail || newEmail === userEmail) {
      toast.error("Bitte geben Sie eine neue E-Mail-Adresse ein");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error("Bitte geben Sie eine gültige E-Mail-Adresse ein");
      return;
    }

    setIsUpdatingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ 
        email: newEmail 
      });

      if (error) throw error;

      toast.success("Bestätigungs-E-Mail gesendet", {
        description: "Bitte bestätigen Sie Ihre neue E-Mail-Adresse über den Link in der E-Mail."
      });
      
      // Reset the new email field to current email
      setNewEmail(userEmail);
    } catch (error: any) {
      console.error("E-Mail-Update-Fehler:", error);
      toast.error(error.message || "Fehler beim Ändern der E-Mail-Adresse");
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleSavePatientData = async () => {
    try {
      await upsertPatient.mutateAsync({
        first_name: firstName,
        last_name: lastName,
        street: street,
        postal_code: postalCode,
        city: city,
        phone: phone,
        fax: fax,
        date_of_birth: dateOfBirth,
        health_insurance: healthInsurance,
        insurance_number: insuranceNumber,
      });
      toast.success("Persönliche Daten wurden gespeichert");
      
      if (onReturn) {
        onReturn();
      }
    } catch (error) {
      toast.error("Fehler beim Speichern der Patientendaten");
    }
  };

  return (
    <div className="space-y-6">
      {/* Email */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">E-Mail-Adresse</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Aktuelle E-Mail</Label>
            <Input value={userEmail} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>Neue E-Mail-Adresse</Label>
            <Input 
              type="email"
              value={newEmail} 
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="neue@email.de"
            />
            <p className="text-xs text-muted-foreground">
              Sie erhalten eine Bestätigungs-E-Mail an die neue Adresse. Die Änderung wird erst nach Bestätigung wirksam.
            </p>
          </div>
          <SaveButton 
            onClick={handleUpdateEmail}
            isLoading={isUpdatingEmail}
            disabled={!newEmail || newEmail === userEmail}
            text="E-Mail ändern"
          />
        </div>
      </Card>

      {/* Patient Data */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Persönliche Daten</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Vorname</Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Nachname</Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Straße & Hausnummer</Label>
            <Input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>PLZ</Label>
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Stadt</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Telefon</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Fax</Label>
            <Input
              value={fax}
              onChange={(e) => setFax(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Geburtsdatum</Label>
            <Input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>
          <div>
            <Label>Krankenversicherung</Label>
            <Input
              value={healthInsurance}
              onChange={(e) => setHealthInsurance(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Versichertennummer</Label>
            <Input
              value={insuranceNumber}
              onChange={(e) => setInsuranceNumber(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <SaveButton
          onClick={handleSavePatientData}
          isLoading={upsertPatient.isPending}
          className="mt-4"
        />
      </Card>
    </div>
  );
};
