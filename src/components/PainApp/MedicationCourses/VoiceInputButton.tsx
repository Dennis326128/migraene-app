import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Loader2, Check, AlertCircle, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { parseMedicationCourseFromVoice, type ParsedMedicationCourse } from "@/lib/voice/medicationCourseParser";
import { buildDoseText, type StructuredDosage } from "./StructuredDosageInput";
import type { MedicationCourseType } from "@/features/medication-courses";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface VoiceInputButtonProps {
  userMeds: Array<{ name: string }>;
  onDataRecognized: (data: {
    medicationName: string;
    type: MedicationCourseType;
    dosage: Partial<StructuredDosage>;
    startDate: Date | undefined;
    isActive: boolean;
  }) => void;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  userMeds,
  onDataRecognized,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedMedicationCourse | null>(null);
  const [showReview, setShowReview] = useState(false);

  const { state, startRecording, stopRecording, resetTranscript } = useSpeechRecognition({
    language: "de-DE",
    continuous: true,
    pauseThreshold: 3,
    onTranscriptReady: (transcript) => {
      if (transcript.trim()) {
        const parsed = parseMedicationCourseFromVoice(transcript, userMeds);
        setParsedData(parsed);
        setShowReview(true);
      }
    },
  });

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
    setParsedData(null);
    setShowReview(false);
    resetTranscript();
  };

  const handleCloseDialog = () => {
    if (state.isRecording) {
      stopRecording();
    }
    setIsDialogOpen(false);
    setParsedData(null);
    setShowReview(false);
    resetTranscript();
  };

  const handleStartRecording = async () => {
    setParsedData(null);
    setShowReview(false);
    await startRecording();
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  const handleApplyData = () => {
    if (!parsedData) return;

    onDataRecognized({
      medicationName: parsedData.medicationName || "",
      type: parsedData.type || "prophylaxe",
      dosage: parsedData.dosage,
      startDate: parsedData.startDate || undefined,
      isActive: parsedData.isActive,
    });

    handleCloseDialog();
  };

  const handleRetry = () => {
    setParsedData(null);
    setShowReview(false);
    resetTranscript();
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return <Badge variant="default" className="bg-green-500">Sicher erkannt</Badge>;
    if (confidence >= 0.6) return <Badge variant="secondary">Wahrscheinlich</Badge>;
    return <Badge variant="outline">Unsicher</Badge>;
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpenDialog}
        className="gap-2"
      >
        <Mic className="h-4 w-4" />
        <span className="hidden sm:inline">Per Sprache ausfüllen</span>
        <span className="sm:hidden">Sprache</span>
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Spracheingabe
            </DialogTitle>
            <DialogDescription>
              Beschreibe dein Medikament, z.B. "Ajovy 225 mg einmal im Monat seit März"
            </DialogDescription>
          </DialogHeader>

          {!showReview ? (
            <div className="space-y-4">
              {/* Recording Area */}
              <Card className={cn(
                "border-2 transition-colors",
                state.isRecording ? "border-red-500 bg-red-50 dark:bg-red-950/20" : "border-dashed"
              )}>
                <CardContent className="p-6 flex flex-col items-center gap-4">
                  {state.isRecording ? (
                    <>
                      <div className="relative">
                        <div className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
                        <Button
                          variant="destructive"
                          size="lg"
                          className="rounded-full h-16 w-16"
                          onClick={handleStopRecording}
                        >
                          <MicOff className="h-6 w-6" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {state.isPaused 
                          ? `Stoppe in ${state.remainingSeconds}s...` 
                          : "Aufnahme läuft..."}
                      </p>
                    </>
                  ) : state.isProcessing ? (
                    <>
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Verarbeite...</p>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="default"
                        size="lg"
                        className="rounded-full h-16 w-16"
                        onClick={handleStartRecording}
                      >
                        <Mic className="h-6 w-6" />
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        Zum Starten tippen
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Live Transcript */}
              {state.transcript && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-sm text-muted-foreground mb-1">Erkannt:</p>
                    <p className="text-sm">{state.transcript}</p>
                  </CardContent>
                </Card>
              )}

              {/* Error */}
              {state.error && (
                <Card className="border-destructive">
                  <CardContent className="p-3 flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <p className="text-sm">{state.error}</p>
                  </CardContent>
                </Card>
              )}

              {/* Example Phrases */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Beispiele:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>"Ajovy 225 mg einmal im Monat seit März"</li>
                  <li>"Topiramat 50 mg morgens und abends"</li>
                  <li>"Sumatriptan 50 mg bei Bedarf"</li>
                </ul>
              </div>
            </div>
          ) : parsedData && (
            <div className="space-y-4">
              {/* Parsed Results */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground mb-2">Erkannte Daten:</p>
                  
                  {parsedData.medicationName ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Medikament:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{parsedData.medicationName}</span>
                        {getConfidenceBadge(parsedData.medicationNameConfidence)}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">Kein Medikament erkannt</span>
                    </div>
                  )}

                  {parsedData.type && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Art:</span>
                      <span className="font-medium">
                        {parsedData.type === "prophylaxe" ? "Prophylaxe" : 
                         parsedData.type === "akut" ? "Akut" : "Sonstige"}
                      </span>
                    </div>
                  )}

                  {Object.keys(parsedData.dosage).length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Dosierung:</span>
                      <span className="font-medium">
                        {buildDoseText({
                          doseValue: parsedData.dosage.doseValue || "",
                          doseUnit: parsedData.dosage.doseUnit || "mg",
                          doseRhythm: parsedData.dosage.doseRhythm || "daily",
                          doseSchedule: parsedData.dosage.doseSchedule || { morning: 0, noon: 0, evening: 0, night: 0 },
                          administrationRoute: parsedData.dosage.administrationRoute || "oral",
                          maxPerPeriod: parsedData.dosage.maxPerPeriod || "",
                        }) || "–"}
                      </span>
                    </div>
                  )}

                  {parsedData.startDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Seit:</span>
                      <span className="font-medium">
                        {format(parsedData.startDate, "MMMM yyyy", { locale: de })}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm">Status:</span>
                    <span className="font-medium">
                      {parsedData.isActive ? "Aktiv" : "Beendet"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Original Transcript */}
              <Card className="bg-muted/50">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Original: "{parsedData.rawTranscript}"</p>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleRetry}>
                  Nochmal
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleApplyData}
                  disabled={!parsedData.medicationName}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Übernehmen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
