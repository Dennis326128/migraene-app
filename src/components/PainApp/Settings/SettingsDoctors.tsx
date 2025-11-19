import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/navigation-buttons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDoctors, useCreateDoctor, useUpdateDoctor, useDeleteDoctor } from "@/features/account/hooks/useAccount";
import { toast } from "sonner";
import { Trash2, Plus, Edit } from "lucide-react";

export const SettingsDoctors = () => {
  const { data: doctors = [] } = useDoctors();
  const createDoctor = useCreateDoctor();
  const updateDoctor = useUpdateDoctor();
  const deleteDoctor = useDeleteDoctor();
  
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
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
    fax: "",
  });
  
  const [editDoctor, setEditDoctor] = useState({
    first_name: "",
    last_name: "",
    specialty: "",
    street: "",
    postal_code: "",
    city: "",
    phone: "",
    email: "",
    fax: "",
  });

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
        fax: "",
      });
      setShowAddDoctor(false);
      toast.success("Arzt hinzugefügt");
    } catch (error) {
      toast.error("Fehler beim Hinzufügen des Arztes");
    }
  };

  const handleStartEdit = (doctor: any) => {
    setEditingDoctorId(doctor.id);
    setEditDoctor({
      first_name: doctor.first_name || "",
      last_name: doctor.last_name || "",
      specialty: doctor.specialty || "",
      street: doctor.street || "",
      postal_code: doctor.postal_code || "",
      city: doctor.city || "",
      phone: doctor.phone || "",
      email: doctor.email || "",
      fax: doctor.fax || "",
    });
  };

  const handleUpdateDoctor = async (doctorId: string) => {
    try {
      await updateDoctor.mutateAsync({ id: doctorId, updates: editDoctor });
      setEditingDoctorId(null);
      toast.success("Arztdaten aktualisiert");
    } catch (error) {
      toast.error("Fehler beim Aktualisieren der Arztdaten");
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

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Behandelnde Ärzte</h3>
            <p className="text-sm text-muted-foreground">
              Verwalten Sie die Kontaktdaten Ihrer behandelnden Ärzte
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDoctor(!showAddDoctor)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Arzt hinzufügen
          </Button>
        </div>

        {/* Add Doctor Form */}
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
              <div>
                <Label className="text-xs">Fax</Label>
                <Input
                  value={newDoctor.fax}
                  onChange={(e) => setNewDoctor({ ...newDoctor, fax: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <SaveButton
                onClick={handleAddDoctor}
                isLoading={createDoctor.isPending}
                text="Hinzufügen"
                size="sm"
              />
              <Button size="sm" variant="outline" onClick={() => setShowAddDoctor(false)}>
                Abbrechen
              </Button>
            </div>
          </Card>
        )}

        {/* Doctors List */}
        {doctors.length === 0 && !showAddDoctor && (
          <p className="text-sm text-muted-foreground">
            Noch keine Ärzte hinzugefügt. Klicken Sie auf "Arzt hinzufügen", um loszulegen.
          </p>
        )}

        <div className="space-y-3">
          {doctors.map((doctor) => (
            <Card key={doctor.id} className="p-4">
              {editingDoctorId === doctor.id ? (
                // Edit Mode
                <div className="space-y-3">
                  <h4 className="font-medium mb-3">Arzt bearbeiten</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Vorname</Label>
                      <Input
                        value={editDoctor.first_name}
                        onChange={(e) => setEditDoctor({ ...editDoctor, first_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Nachname</Label>
                      <Input
                        value={editDoctor.last_name}
                        onChange={(e) => setEditDoctor({ ...editDoctor, last_name: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Fachgebiet</Label>
                      <Input
                        value={editDoctor.specialty}
                        onChange={(e) => setEditDoctor({ ...editDoctor, specialty: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Straße & Hausnummer</Label>
                      <Input
                        value={editDoctor.street}
                        onChange={(e) => setEditDoctor({ ...editDoctor, street: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">PLZ</Label>
                      <Input
                        value={editDoctor.postal_code}
                        onChange={(e) => setEditDoctor({ ...editDoctor, postal_code: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Stadt</Label>
                      <Input
                        value={editDoctor.city}
                        onChange={(e) => setEditDoctor({ ...editDoctor, city: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Telefon</Label>
                      <Input
                        value={editDoctor.phone}
                        onChange={(e) => setEditDoctor({ ...editDoctor, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">E-Mail</Label>
                      <Input
                        value={editDoctor.email}
                        onChange={(e) => setEditDoctor({ ...editDoctor, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Fax</Label>
                      <Input
                        value={editDoctor.fax}
                        onChange={(e) => setEditDoctor({ ...editDoctor, fax: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <SaveButton
                      onClick={() => handleUpdateDoctor(doctor.id!)}
                      size="sm"
                    />
                    <Button size="sm" variant="outline" onClick={() => setEditingDoctorId(null)}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : (
                // View Mode
                <>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium">
                        {doctor.first_name} {doctor.last_name}
                      </h4>
                      {doctor.specialty && (
                        <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(doctor)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDoctor(doctor.id!)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
                    {doctor.fax && <p>Fax: {doctor.fax}</p>}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
};
