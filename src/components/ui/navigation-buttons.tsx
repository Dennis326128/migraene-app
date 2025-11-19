import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  showText?: boolean;
  className?: string;
}

export const BackButton = ({ 
  onClick, 
  disabled = false, 
  isLoading = false,
  showText = false,
  className 
}: BackButtonProps) => {
  const isMobile = useIsMobile();
  
  return (
    <Button
      variant="ghost"
      size={isMobile ? "touch" : "default"}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn("shrink-0", className)}
      aria-label="Zurück"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowLeft className="h-4 w-4" />
      )}
      {showText && (
        <span className="ml-2">
          {isLoading ? "Speichere..." : "Zurück"}
        </span>
      )}
    </Button>
  );
};

interface SaveButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  fullWidth?: boolean;
  text?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export const SaveButton = ({
  onClick,
  disabled = false,
  isLoading = false,
  fullWidth = false,
  text = "Speichern",
  className,
  size
}: SaveButtonProps) => {
  const isMobile = useIsMobile();
  
  return (
    <Button
      onClick={onClick}
      disabled={disabled || isLoading}
      size={size || (isMobile ? "mobile" : "default")}
      className={cn(
        fullWidth && "w-full",
        isMobile && !size && "h-12 text-base",
        className
      )}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Save className="h-4 w-4 mr-2" />
      )}
      {isLoading ? "Speichere..." : text}
    </Button>
  );
};
