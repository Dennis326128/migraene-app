import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function KontoGeloeschtPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Konto gelöscht</h1>
          <p className="text-sm text-muted-foreground">
            Dein Miary-Konto und die zugehörigen Daten wurden gelöscht.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/">Zur Startseite</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
