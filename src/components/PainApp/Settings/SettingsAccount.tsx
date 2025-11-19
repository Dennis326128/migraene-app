import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatientData, useUpsertPatientData, useDoctors, useCreateDoctor, useDeleteDoctor } from "@/features/account/hooks/useAccount";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Trash2, Plus, Save, AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const SettingsAccount = ({ onReturn }: { onReturn?: () => void }) => {
  const [userEmail, setUserEmail] = useState<string>("");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

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

  // Doctors state
  const { data: doctors = [] } = useDoctors();
  const createDoctor = useCreateDoctor();
  const deleteDoctor = useDeleteDoctor();
  
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [newDoctor, setNewDoctor] = useState({
    first_name: "",
    last_name: "",
    specialty: "",
    street: "",
    postal_code: "",
    city: "",
    phone: "",
    email: "",
  });

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

  const handleAddDoctor = async () => {
    try {
      await createDoctor.mutateAsync(newDoctor);
      setNewDoctor({
        first_name: "",
        last_name: "",
        specialty: "",
        street: "",
        postal_code: "",
        city: "",
        phone: "",
        email: "",
      });
      setShowAddDoctor(false);
      toast.success("Arzt hinzugefügt");
    } catch (error) {
      toast.error("Fehler beim Hinzufügen des Arztes");
    }
  };

  const handleDeleteDoctor = async (doctorId: string) => {
    try {
      await deleteDoctor.mutateAsync(doctorId);
      toast.success("Arzt entfernt");
    } catch (error) {
      toast.error("Fehler beim Entfernen des Arztes");
    }
  };

  const handleLogout = () => {
    setShowLogoutDialog(true);
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

      {/* Doctors */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Behandelnde Ärzte</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDoctor(!showAddDoctor)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Arzt hinzufügen
          </Button>
        </div>

        {showAddDoctor && (
          <Card className="p-4 mb-4 bg-secondary/10">
            <h4 className="font-medium mb-3">Neuen Arzt hinzufügen</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Vorname</Label>
                <Input
                  value={newDoctor.first_name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, first_name: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs">Nachname</Label>
                <Input
                  value={newDoctor.last_name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, last_name: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Fachgebiet</Label>
                <Input
                  value={newDoctor.specialty}
                  onChange={(e) => setNewDoctor({ ...newDoctor, specialty: e.target.value })}
                  placeholder="z.B. Neurologie (Optional)"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Straße & Hausnummer</Label>
                <Input
                  value={newDoctor.street}
                  onChange={(e) => setNewDoctor({ ...newDoctor, street: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs">PLZ</Label>
                <Input
                  value={newDoctor.postal_code}
                  onChange={(e) => setNewDoctor({ ...newDoctor, postal_code: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs">Stadt</Label>
                <Input
                  value={newDoctor.city}
                  onChange={(e) => setNewDoctor({ ...newDoctor, city: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs">Telefon</Label>
                <Input
                  value={newDoctor.phone}
                  onChange={(e) => setNewDoctor({ ...newDoctor, phone: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs">E-Mail</Label>
                <Input
                  type="email"
                  value={newDoctor.email}
                  onChange={(e) => setNewDoctor({ ...newDoctor, email: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleAddDoctor} disabled={createDoctor.isPending}>
                Hinzufügen
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddDoctor(false)}>
                Abbrechen
              </Button>
            </div>
          </Card>
        )}

        {doctors.length === 0 && !showAddDoctor && (
          <p className="text-sm text-muted-foreground">
            Noch keine Ärzte hinzugefügt. Klicken Sie auf "Arzt hinzufügen", um loszulegen.
          </p>
        )}

        <div className="space-y-3">
          {doctors.map((doctor) => (
            <Card key={doctor.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-medium">
                    {doctor.first_name} {doctor.last_name}
                  </h4>
                  {doctor.specialty && (
                    <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteDoctor(doctor.id!)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-sm space-y-1">
                {doctor.street && <p>{doctor.street}</p>}
                {(doctor.postal_code || doctor.city) && (
                  <p>
                    {doctor.postal_code} {doctor.city}
                  </p>
                )}
                {doctor.phone && <p>Tel: {doctor.phone}</p>}
                {doctor.email && <p>E-Mail: {doctor.email}</p>}
              </div>
            </Card>
          ))}
        </div>
      </Card>

      {/* Logout Section */}
      <Card className="p-6 border-destructive/20">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <h3 className="text-lg font-semibold">Abmelden</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Melden Sie sich von Ihrem Konto ab. Sie können sich jederzeit wieder anmelden.
        </p>
        <Button variant="destructive" onClick={handleLogout}>
          Abmelden
        </Button>
      </Card>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wirklich abmelden?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie sich wirklich von Ihrem Konto abmelden? Sie können sich jederzeit wieder anmelden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await supabase.auth.signOut();
                toast.success("Erfolgreich abgemeldet");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Abmelden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
