import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-center"
      toastOptions={{
        duration: 2000, // 2 Sekunden für Erfolgsmeldungen
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md group-[.toaster]:rounded-lg group-[.toaster]:max-w-[80vw] group-[.toaster]:pointer-events-none",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:pointer-events-auto",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:pointer-events-auto",
          closeButton: "hidden", // Kein Schließen-Button für Erfolg
          success:
            "group-[.toaster]:bg-emerald-900/90 group-[.toaster]:text-emerald-100 group-[.toaster]:border-emerald-700/50",
          error:
            "group-[.toaster]:bg-destructive/90 group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive/50",
          warning:
            "group-[.toaster]:bg-amber-900/90 group-[.toaster]:text-amber-100 group-[.toaster]:border-amber-700/50",
          info:
            "group-[.toaster]:bg-blue-900/90 group-[.toaster]:text-blue-100 group-[.toaster]:border-blue-700/50",
        },
      }}
      offset="60px" // Unter der Header-Leiste
      closeButton={false}
      {...props}
    />
  )
}

export { Toaster }
