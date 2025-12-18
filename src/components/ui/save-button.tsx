import * as React from "react"
import { Button, ButtonProps } from "@/components/ui/button"
import { Save, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SaveButtonProps extends Omit<ButtonProps, "children"> {
  /** Whether the button is in loading state */
  loading?: boolean
  /** Text to show in idle state */
  idleText?: string
  /** Text to show in loading state */
  loadingText?: string
}

/**
 * Unified Save Button component with consistent styling across the app.
 * Always shows a white Save icon on the left with green background.
 */
const SaveButton = React.forwardRef<HTMLButtonElement, SaveButtonProps>(
  (
    {
      loading = false,
      idleText = "Speichern",
      loadingText = "Speichern...",
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <Button
        ref={ref}
        variant="success"
        disabled={disabled || loading}
        className={cn("gap-2", className)}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {loading ? loadingText : idleText}
      </Button>
    )
  }
)

SaveButton.displayName = "SaveButton"

export { SaveButton }
