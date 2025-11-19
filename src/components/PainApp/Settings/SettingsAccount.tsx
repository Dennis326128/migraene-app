import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatientData, useUpsertPatientData } from "@/features/account/hooks/useAccount";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Save } from "lucide-react";

export const SettingsAccount = ({ onReturn }: { onReturn?: () => void }) => {
  const [userEmail, setUserEmail] = useState<string>("");

  // Patient data state
  const { data: patientData } = usePatientData();
  const upsertPatient = useUpsertPatientData();
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  // Load user email
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setUserEmail(data.user.email);
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
      setDateOfBirth(patientData.date_of_birth || "");
    }
  }, [patientData]);

  const handleSavePatientData = async () => {
    try {
      await upsertPatient.mutateAsync({
        first_name: firstName,
        last_name: lastName,
        street: street,
        postal_code: postalCode,
        city: city,
        phone: phone,
        date_of_birth: dateOfBirth,
      });
      toast.success("Patientendaten gespeichert");
      
      if (onReturn) {
        onReturn();
      }
    } catch (error) {
      toast.error("Fehler beim Speichern der Patientendaten");
    }
  };

  return (
    <div className="space-y-6">
      {/* Email (Read-only) */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">E-Mail-Adresse</h3>
        <div className="space-y-2">
          <Label>E-Mail</Label>
          <Input value={userEmail} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground">
            Ihre E-Mail-Adresse kann nicht geändert werden
          </p>
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
            <Label>Geburtsdatum</Label>
            <Input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>
        </div>
        <Button
          onClick={handleSavePatientData}
          className="mt-4"
          disabled={upsertPatient.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          Speichern
        </Button>
      </Card>
    </div>
  );
};
