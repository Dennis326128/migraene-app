import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Migräne-freundliche Toast-Konfiguration:
 * - Symmetrische Borders auf allen Seiten
 * - Gedämpfte, ruhige Farben (kein grelles Rot)
 * - Längere Anzeigedauer für bessere Lesbarkeit
 * - Sanftes, nicht-alarmierendes Design
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-center"
      toastOptions={{
        duration: 3500, // Länger für Migräne-Nutzer
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:max-w-[85vw] group-[.toaster]:pointer-events-none group-[.toaster]:px-4 group-[.toaster]:py-3",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:mt-1",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:pointer-events-auto",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:pointer-events-auto",
          closeButton: "hidden",
          // Gedämpftes Grün - ruhig, nicht leuchtend
          success:
            "group-[.toaster]:bg-[hsl(152,25%,14%)] group-[.toaster]:text-[hsl(152,30%,75%)] group-[.toaster]:border group-[.toaster]:border-[hsl(152,20%,22%)]",
          // Gedämpftes Bordeaux/Dunkelrot - ernst, aber nicht alarmierend
          error:
            "group-[.toaster]:bg-[hsl(0,25%,16%)] group-[.toaster]:text-[hsl(0,30%,75%)] group-[.toaster]:border group-[.toaster]:border-[hsl(0,20%,24%)]",
          // Gedämpftes Amber - warm, nicht grell
          warning:
            "group-[.toaster]:bg-[hsl(35,25%,14%)] group-[.toaster]:text-[hsl(35,35%,75%)] group-[.toaster]:border group-[.toaster]:border-[hsl(35,20%,22%)]",
          // Gedämpftes Blau - neutral, ruhig
          info:
            "group-[.toaster]:bg-[hsl(210,25%,14%)] group-[.toaster]:text-[hsl(210,30%,75%)] group-[.toaster]:border group-[.toaster]:border-[hsl(210,20%,22%)]",
        },
      }}
      offset="60px"
      closeButton={false}
      {...props}
    />
  )
}

export { Toaster }
