import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/navigation-buttons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDoctors, useCreateDoctor, useUpdateDoctor, useDeleteDoctor } from "@/features/account/hooks/useAccount";
import { toast } from "sonner";
import { Plus, Edit, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface SettingsDoctorsWithOriginProps {
  origin?: 'export_migraine_diary';
  editDoctorId?: string;
  onSaveSuccess?: () => void;
  onBack: () => void;
}

export const SettingsDoctorsWithOrigin = ({
  origin,
  editDoctorId,
  onSaveSuccess,
  onBack,
}: SettingsDoctorsWithOriginProps) => {
  const { t } = useTranslation();
  const { data: doctors = [] } = useDoctors();
  const createDoctor = useCreateDoctor();
  const updateDoctor = useUpdateDoctor();
  
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [initialEditApplied, setInitialEditApplied] = useState(false);
  
  const [newDoctor, setNewDoctor] = useState({
    salutation: "",
    title: "",
    first_name: "",
    last_name: "",
    specialty: "",
    street: "",
    postal_code: "",
    city: "",
    phone: "",
    email: "",
    fax: "",
    website: "",
    is_active: true,
  });
  
  const [editDoctor, setEditDoctor] = useState({
    salutation: "",
    title: "",
    first_name: "",
    last_name: "",
    specialty: "",
    street: "",
    postal_code: "",
    city: "",
    phone: "",
    email: "",
    fax: "",
    website: "",
    is_active: true,
  });

  // Auto-open edit mode for specified doctor on mount
  useEffect(() => {
    if (editDoctorId && doctors.length > 0 && !initialEditApplied) {
      const doctor = doctors.find(d => d.id === editDoctorId);
      if (doctor) {
        handleStartEdit(doctor);
        setInitialEditApplied(true);
      }
    }
  }, [editDoctorId, doctors, initialEditApplied]);

  // Auto-open add form if no doctors and coming from export
  useEffect(() => {
    if (origin === 'export_migraine_diary' && doctors.length === 0 && !showAddDoctor) {
      setShowAddDoctor(true);
    }
  }, [origin, doctors.length, showAddDoctor]);

  const handleAddDoctor = async () => {
    try {
      await createDoctor.mutateAsync(newDoctor);
      setNewDoctor({
        salutation: "",
        title: "",
        first_name: "",
        last_name: "",
        specialty: "",
        street: "",
        postal_code: "",
        city: "",
        phone: "",
        email: "",
        fax: "",
        website: "",
        is_active: true,
      });
      setShowAddDoctor(false);
      toast.success(t('doctor.added'));
      
      // If coming from export, navigate back
      if (origin === 'export_migraine_diary' && onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (error) {
      toast.error(t('error.saveFailed'));
    }
  };

  const handleStartEdit = (doctor: any) => {
    setEditingDoctorId(doctor.id);
    setEditDoctor({
      salutation: doctor.salutation || "",
      title: doctor.title || "",
      first_name: doctor.first_name || "",
      last_name: doctor.last_name || "",
      specialty: doctor.specialty || "",
      street: doctor.street || "",
      postal_code: doctor.postal_code || "",
      city: doctor.city || "",
      phone: doctor.phone || "",
      email: doctor.email || "",
      fax: doctor.fax || "",
      website: doctor.website || "",
      is_active: doctor.is_active !== false,
    });
  };

  const handleUpdateDoctor = async (doctorId: string) => {
    try {
      await updateDoctor.mutateAsync({ id: doctorId, updates: editDoctor });
      setEditingDoctorId(null);
      toast.success(t('doctor.updated'));
      
      // If coming from export, navigate back
      if (origin === 'export_migraine_diary' && onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (error) {
      toast.error(t('error.saveFailed'));
    }
  };

  const handleToggleArchive = async (doctorId: string, currentlyActive: boolean) => {
    try {
      await updateDoctor.mutateAsync({ 
        id: doctorId, 
        updates: { is_active: !currentlyActive } 
      });
    } catch (error) {
      toast.error(t('error.saveFailed'));
    }
  };

  const handleCancelEdit = () => {
    setEditingDoctorId(null);
    // If coming from export and canceling single doctor edit, go back
    if (origin === 'export_migraine_diary' && editDoctorId) {
      onBack();
    }
  };

  const handleCancelAdd = () => {
    setShowAddDoctor(false);
    // If coming from export with no doctors, go back
    if (origin === 'export_migraine_diary' && doctors.length === 0) {
      onBack();
    }
  };

  return (
    <div className="space-y-6">
      {/* Info banner when coming from export */}
      {origin === 'export_migraine_diary' && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <p className="text-sm text-muted-foreground">
            {t('doctor.manageInfo')}
          </p>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">{t('doctor.doctors')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('doctor.manageInfo')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDoctor(!showAddDoctor)}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('doctor.add')}
          </Button>
        </div>

        {/* Add Doctor Form */}
        {showAddDoctor && (
          <Card className="p-4 mb-4 bg-secondary/10">
            <h4 className="font-medium mb-3">{t('doctor.add')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t('doctor.salutation')}</Label>
                <Select
                  value={newDoctor.salutation}
                  onValueChange={(value) => setNewDoctor({ ...newDoctor, salutation: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.none')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Herr">Herr</SelectItem>
                    <SelectItem value="Frau">Frau</SelectItem>
                    <SelectItem value="Divers">Divers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t('doctor.title')}</Label>
                <Select
                  value={newDoctor.title}
                  onValueChange={(value) => setNewDoctor({ ...newDoctor, title: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.none')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dr. med.">Dr. med.</SelectItem>
                    <SelectItem value="Prof. Dr. med.">Prof. Dr. med.</SelectItem>
                    <SelectItem value="PD Dr. med.">PD Dr. med.</SelectItem>
                    <SelectItem value="Dr.">Dr.</SelectItem>
                    <SelectItem value="Prof. Dr.">Prof. Dr.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t('doctor.firstName')}</Label>
                <Input
                  value={newDoctor.first_name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, first_name: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <Label className="text-xs">{t('doctor.lastName')}</Label>
                <Input
                  value={newDoctor.last_name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, last_name: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">{t('doctor.specialty')}</Label>
                <Input
                  value={newDoctor.specialty}
                  onChange={(e) => setNewDoctor({ ...newDoctor, specialty: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">{t('doctor.street')}</Label>
                <Input
                  value={newDoctor.street}
                  onChange={(e) => setNewDoctor({ ...newDoctor, street: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <Label className="text-xs">{t('doctor.postalCode')}</Label>
                <Input
                  value={newDoctor.postal_code}
                  onChange={(e) => setNewDoctor({ ...newDoctor, postal_code: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <Label className="text-xs">{t('doctor.city')}</Label>
                <Input
                  value={newDoctor.city}
                  onChange={(e) => setNewDoctor({ ...newDoctor, city: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <Label className="text-xs">{t('doctor.phone')}</Label>
                <Input
                  value={newDoctor.phone}
                  onChange={(e) => setNewDoctor({ ...newDoctor, phone: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <Label className="text-xs">{t('doctor.email')}</Label>
                <Input
                  type="email"
                  value={newDoctor.email}
                  onChange={(e) => setNewDoctor({ ...newDoctor, email: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <Label className="text-xs">{t('doctor.fax')}</Label>
                <Input
                  value={newDoctor.fax}
                  onChange={(e) => setNewDoctor({ ...newDoctor, fax: e.target.value })}
                  placeholder={t('common.optional')}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-muted-foreground">{t('doctor.websiteOptional')}</Label>
                <Input
                  type="url"
                  value={newDoctor.website}
                  onChange={(e) => setNewDoctor({ ...newDoctor, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <SaveButton
                onClick={handleAddDoctor}
                isLoading={createDoctor.isPending}
                text={t('common.add')}
                size="sm"
              />
              <Button size="sm" variant="outline" onClick={handleCancelAdd}>
                {t('common.cancel')}
              </Button>
            </div>
          </Card>
        )}

        {/* Doctors List */}
        {doctors.length === 0 && !showAddDoctor && (
          <p className="text-sm text-muted-foreground">
            {t('doctor.noDoctors')}. {t('doctor.addFirst')}.
          </p>
        )}

        <div className="space-y-3">
          {doctors.map((doctor) => {
            const isActive = doctor.is_active !== false;
            return (
            <Card 
              key={doctor.id} 
              className={cn("p-4 transition-opacity", !isActive && "opacity-60")}
            >
              {editingDoctorId === doctor.id ? (
                // Edit Mode
                <div className="space-y-3">
                  <h4 className="font-medium mb-3">{t('doctor.edit')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{t('doctor.salutation')}</Label>
                      <Select
                        value={editDoctor.salutation}
                        onValueChange={(value) => setEditDoctor({ ...editDoctor, salutation: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('common.none')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Herr">Herr</SelectItem>
                          <SelectItem value="Frau">Frau</SelectItem>
                          <SelectItem value="Divers">Divers</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t('doctor.title')}</Label>
                      <Select
                        value={editDoctor.title}
                        onValueChange={(value) => setEditDoctor({ ...editDoctor, title: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('common.none')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Dr. med.">Dr. med.</SelectItem>
                          <SelectItem value="Prof. Dr. med.">Prof. Dr. med.</SelectItem>
                          <SelectItem value="PD Dr. med.">PD Dr. med.</SelectItem>
                          <SelectItem value="Dr.">Dr.</SelectItem>
                          <SelectItem value="Prof. Dr.">Prof. Dr.</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t('doctor.firstName')}</Label>
                      <Input
                        value={editDoctor.first_name}
                        onChange={(e) => setEditDoctor({ ...editDoctor, first_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('doctor.lastName')}</Label>
                      <Input
                        value={editDoctor.last_name}
                        onChange={(e) => setEditDoctor({ ...editDoctor, last_name: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">{t('doctor.specialty')}</Label>
                      <Input
                        value={editDoctor.specialty}
                        onChange={(e) => setEditDoctor({ ...editDoctor, specialty: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">{t('doctor.street')}</Label>
                      <Input
                        value={editDoctor.street}
                        onChange={(e) => setEditDoctor({ ...editDoctor, street: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('doctor.postalCode')}</Label>
                      <Input
                        value={editDoctor.postal_code}
                        onChange={(e) => setEditDoctor({ ...editDoctor, postal_code: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('doctor.city')}</Label>
                      <Input
                        value={editDoctor.city}
                        onChange={(e) => setEditDoctor({ ...editDoctor, city: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('doctor.phone')}</Label>
                      <Input
                        value={editDoctor.phone}
                        onChange={(e) => setEditDoctor({ ...editDoctor, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('doctor.email')}</Label>
                      <Input
                        value={editDoctor.email}
                        onChange={(e) => setEditDoctor({ ...editDoctor, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('doctor.fax')}</Label>
                      <Input
                        value={editDoctor.fax}
                        onChange={(e) => setEditDoctor({ ...editDoctor, fax: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs text-muted-foreground">{t('doctor.websiteOptional')}</Label>
                      <Input
                        type="url"
                        value={editDoctor.website}
                        onChange={(e) => setEditDoctor({ ...editDoctor, website: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                    
                    {/* Status Toggle in Edit Mode */}
                    <div className="md:col-span-2 pt-3 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">{t('doctor.status')}</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('doctor.archivedHint')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-xs font-medium",
                            editDoctor.is_active ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {editDoctor.is_active ? t('doctor.active') : t('doctor.archived')}
                          </span>
                          <Switch
                            checked={editDoctor.is_active}
                            onCheckedChange={(checked) => setEditDoctor({ ...editDoctor, is_active: checked })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <SaveButton
                      onClick={() => handleUpdateDoctor(doctor.id!)}
                      size="sm"
                    />
                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                // View Mode
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">
                          {[doctor.salutation, doctor.title, doctor.first_name, doctor.last_name]
                            .filter(Boolean)
                            .join(' ')}
                        </h4>
                        {/* Archived badge */}
                        {!isActive && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            {t('doctor.archived')}
                          </span>
                        )}
                      </div>
                      {doctor.specialty && (
                        <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(doctor)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {/* Archive Toggle with label */}
                      <div 
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleToggleArchive(doctor.id!, isActive)}
                      >
                        <span className={cn(
                          "text-xs font-medium select-none",
                          isActive ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {isActive ? t('doctor.active') : t('doctor.archived')}
                        </span>
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => handleToggleArchive(doctor.id!, isActive)}
                          className="pointer-events-none"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-sm space-y-1 mt-2">
                    {doctor.street && <p>{doctor.street}</p>}
                    {(doctor.postal_code || doctor.city) && (
                      <p>
                        {doctor.postal_code} {doctor.city}
                      </p>
                    )}
                    {doctor.phone && <p>{t('doctor.phone')}: {doctor.phone}</p>}
                    {doctor.email && <p>{t('doctor.email')}: {doctor.email}</p>}
                    {doctor.fax && <p>{t('doctor.fax')}: {doctor.fax}</p>}
                    {doctor.website && (
                      <a 
                        href={doctor.website.startsWith('http') ? doctor.website : `https://${doctor.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>{t('doctor.website')}</span>
                      </a>
                    )}
                  </div>
                </>
              )}
            </Card>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
