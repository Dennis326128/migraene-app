import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ExternalLink, FileText, Shield, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LegalLinksProps {
  className?: string;
  variant?: "inline" | "stacked" | "buttons";
}

export const LegalLinks = ({ className, variant = "inline" }: LegalLinksProps) => {
  const links = [
    { to: "/privacy", label: "Datenschutz", icon: Shield },
    { to: "/terms", label: "AGB", icon: Scale },
    { to: "/imprint", label: "Impressum", icon: FileText },
  ];

  if (variant === "buttons") {
    return (
      <div className={cn("space-y-2", className)}>
        {links.map(({ to, label, icon: Icon }) => (
          <Button
            key={to}
            variant="outline"
            className="w-full justify-between"
            onClick={() => window.open(to, "_blank")}
          >
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {label} öffnen
            </span>
            <ExternalLink className="h-4 w-4" />
          </Button>
        ))}
      </div>
    );
  }

  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {links.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {label}
          </Link>
        ))}
      </div>
    );
  }

  // inline variant (default)
  return (
    <div className={cn("flex items-center justify-center gap-4 text-xs text-muted-foreground", className)}>
      {links.map(({ to, label }, index) => (
        <span key={to} className="flex items-center gap-4">
          <Link
            to={to}
            className="hover:text-foreground transition-colors"
          >
            {label}
          </Link>
          {index < links.length - 1 && <span>·</span>}
        </span>
      ))}
    </div>
  );
};
