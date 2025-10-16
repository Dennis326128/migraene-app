import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function MedicalDisclaimerAlert() {
  const [show, setShow] = useState(false);
  
  useEffect(() => {
    const hasSeenDisclaimer = localStorage.getItem('medical-disclaimer-seen');
    if (!hasSeenDisclaimer) {
      setShow(true);
    }
  }, []);
  
  const handleAccept = () => {
    localStorage.setItem('medical-disclaimer-seen', 'true');
    setShow(false);
  };
  
  if (!show) return null;
  
  return (
    <Alert className="fixed bottom-4 left-4 right-4 z-50 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 shadow-lg">
      <AlertTriangle className="h-5 w-5 text-yellow-600" />
      <AlertDescription className="ml-2">
        <p className="font-semibold mb-2 text-yellow-900 dark:text-yellow-100">⚠️ WICHTIGER HINWEIS</p>
        <p className="text-sm mb-3 text-yellow-800 dark:text-yellow-200">
          Diese App dient ausschließlich der persönlichen Dokumentation und 
          ersetzt keine ärztliche Beratung, Diagnose oder Behandlung. 
          Bei gesundheitlichen Beschwerden konsultieren Sie immer einen Arzt.
        </p>
        <Button size="sm" onClick={handleAccept}>Verstanden</Button>
      </AlertDescription>
    </Alert>
  );
}
