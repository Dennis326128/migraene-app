import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ExternalLink, FileText, Shield, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LegalLinksProps {
  className?: string;
  variant?: "inline" | "stacked" | "buttons" | "text";
  openInNewTab?: boolean;
}

export const LegalLinks = ({ 
  className, 
  variant = "inline", 
  openInNewTab = false 
}: LegalLinksProps) => {
  const links = [
    { to: "/privacy", label: "Datenschutz", icon: Shield },
    { to: "/terms", label: "AGB", icon: Scale },
    { to: "/imprint", label: "Impressum", icon: FileText },
  ];

  const linkProps = openInNewTab 
    ? { target: "_blank" as const, rel: "noopener noreferrer" } 
    : {};

  if (variant === "buttons") {
    return (
      <div className={cn("space-y-2", className)}>
        {links.map(({ to, label, icon: Icon }) => (
          <Button
            key={to}
            variant="outline"
            className="w-full justify-between"
            onClick={() => window.open(to, "_blank", "noopener,noreferrer")}
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
            {...linkProps}
          >
            {label}
          </Link>
        ))}
      </div>
    );
  }

  // "text" variant - inline text for use in paragraphs (for CookieConsent)
  if (variant === "text") {
    return (
      <span className={className}>
        <Link 
          to="/privacy" 
          className="text-primary underline hover:no-underline"
          {...linkProps}
        >
          Datenschutzerklärung
        </Link>
        ,{' '}
        <Link 
          to="/terms" 
          className="text-primary underline hover:no-underline"
          {...linkProps}
        >
          AGB
        </Link>
        {' '}und{' '}
        <Link 
          to="/imprint" 
          className="text-primary underline hover:no-underline"
          {...linkProps}
        >
          Impressum
        </Link>
      </span>
    );
  }

  // inline variant (default) - horizontal with dots
  return (
    <div className={cn("flex items-center justify-center gap-4 text-xs text-muted-foreground", className)}>
      {links.map(({ to, label }, index) => (
        <span key={to} className="flex items-center gap-4">
          <Link
            to={to}
            className="hover:text-foreground transition-colors"
            {...linkProps}
          >
            {label}
          </Link>
          {index < links.length - 1 && <span>·</span>}
        </span>
      ))}
    </div>
  );
};
