import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "secondary";
  };
  children?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  children
}) => {
  return (
    <Card className="w-full max-w-md mx-auto">
      <div className="p-8 text-center space-y-4">
        {icon && (
          <div className="flex justify-center mb-4">
            <div className="text-6xl opacity-50">
              {icon}
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        </div>

        {action && (
          <div className="pt-4">
            <Button 
              onClick={action.onClick}
              variant={action.variant || "default"}
              className="w-full sm:w-auto"
            >
              {action.label}
            </Button>
          </div>
        )}

        {children && (
          <div className="pt-4">
            {children}
          </div>
        )}
      </div>
    </Card>
  );
};