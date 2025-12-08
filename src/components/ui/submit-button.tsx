import * as React from "react"
import { Button, ButtonProps } from "@/components/ui/button"
import { Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type SubmitButtonState = "idle" | "loading" | "success" | "error"

interface SubmitButtonProps extends Omit<ButtonProps, "children"> {
  state?: SubmitButtonState
  idleText: string
  loadingText?: string
  successText?: string
  errorText?: string
  onSuccessComplete?: () => void
  successDuration?: number
}

const SubmitButton = React.forwardRef<HTMLButtonElement, SubmitButtonProps>(
  (
    {
      state = "idle",
      idleText,
      loadingText = "Speichern…",
      successText = "Gespeichert",
      errorText = "Fehler",
      onSuccessComplete,
      successDuration = 1500,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const [internalState, setInternalState] = React.useState<SubmitButtonState>(state)

    React.useEffect(() => {
      setInternalState(state)
      
      if (state === "success") {
        const timer = setTimeout(() => {
          setInternalState("idle")
          onSuccessComplete?.()
        }, successDuration)
        return () => clearTimeout(timer)
      }
    }, [state, successDuration, onSuccessComplete])

    const isLoading = internalState === "loading"
    const isSuccess = internalState === "success"
    const isError = internalState === "error"

    const getButtonContent = () => {
      if (isLoading) {
        return (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {loadingText}
          </>
        )
      }
      if (isSuccess) {
        return (
          <>
            <Check className="mr-2 h-4 w-4" />
            {successText}
          </>
        )
      }
      if (isError) {
        return errorText
      }
      return idleText
    }

    return (
      <Button
        ref={ref}
        className={cn(
          "transition-all duration-200",
          isSuccess && "bg-emerald-600 hover:bg-emerald-600 text-white",
          isError && "bg-destructive hover:bg-destructive",
          className
        )}
        disabled={disabled || isLoading || isSuccess}
        {...props}
      >
        {getButtonContent()}
      </Button>
    )
  }
)

SubmitButton.displayName = "SubmitButton"

export { SubmitButton }
