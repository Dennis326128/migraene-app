import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Types for modern event system
type ModernEvent = {
  id: number;
  started_at: string;
  type: string;
  intensity_0_10?: number;
  notes_extraordinary?: string;
  medications?: { name: string; dose_mg?: number; units?: string; effect_rating?: number }[];
  symptoms?: string[];
  weather?: {
    temperature_c?: number;
    condition_text?: string;
    pressure_mb?: number;
    humidity?: number;
  };
};

type ModernReportParams = {
  title?: string;
  from: string;
  to: string;
  events: ModernEvent[];
  includeWeather?: boolean;
  includeMedEffects?: boolean;
  includeDoctorSummary?: boolean;
};

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("de-DE", { 
    weekday: "short",
    day: "2-digit", 
    month: "2-digit", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getIntensityLabel(intensity?: number): string {
  if (!intensity) return "Nicht angegeben";
  if (intensity <= 2) return `${intensity}/10 (Mild)`;
  if (intensity <= 4) return `${intensity}/10 (Leicht)`;
  if (intensity <= 6) return `${intensity}/10 (Mittel)`;
  if (intensity <= 8) return `${intensity}/10 (Stark)`;
  return `${intensity}/10 (Sehr stark)`;
}

export async function buildModernDiaryPdf(params: ModernReportParams): Promise<Uint8Array> {
  const { 
    title = "Migräne-Tagebuch (Modernisiert)", 
    from, 
    to, 
    events,
    includeWeather = true,
    includeMedEffects = true,
    includeDoctorSummary = true
  } = params;

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  let y = page.getHeight() - margin;

  // Header with modern styling
  page.drawText(title, { x: margin, y, size: 20, font: fontBold, color: rgb(0.2, 0.4, 0.8) });
  y -= 25;
  page.drawText(`Zeitraum: ${from} bis ${to}`, { x: margin, y, size: 12, font });
  y -= 15;
  page.drawText(`Anzahl Ereignisse: ${events.length}`, { x: margin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 25;

  // Statistics overview - exclude zero values from average
  const validIntensityEvents = events.filter(e => e.intensity_0_10 && e.intensity_0_10 > 0);
  const avgIntensity = validIntensityEvents.length > 0 
    ? validIntensityEvents.reduce((sum, e) => sum + (e.intensity_0_10 || 0), 0) / validIntensityEvents.length
    : 0;
  
  const medEvents = events.filter(e => e.medications && e.medications.length > 0);
  const withSymptoms = events.filter(e => e.symptoms && e.symptoms.length > 0);

  page.drawText("📊 ÜBERSICHT", { x: margin, y, size: 14, font: fontBold });
  y -= 18;
  page.drawText(`• Durchschnittliche Intensität: ${avgIntensity ? avgIntensity.toFixed(1) : 'N/A'}/10 (aus ${validIntensityEvents.length} Einträgen)`, { x: margin + 10, y, size: 10, font });
  y -= 14;
  page.drawText(`• Ereignisse mit Medikamenten: ${medEvents.length} (${Math.round(medEvents.length/events.length*100)}%)`, { x: margin + 10, y, size: 10, font });
  y -= 14;
  page.drawText(`• Ereignisse mit Begleitsymptomen: ${withSymptoms.length} (${Math.round(withSymptoms.length/events.length*100)}%)`, { x: margin + 10, y, size: 10, font });
  y -= 25;

  // Events section
  page.drawText("📝 EREIGNISSE", { x: margin, y, size: 14, font: fontBold });
  y -= 20;

  const addPageIfNeeded = () => {
    if (y < margin + 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - margin;
    }
  };

  for (const event of events) {
    addPageIfNeeded();
    
    // Event header
    const eventDate = formatDateTime(event.started_at);
    page.drawText(`${eventDate} - ${getIntensityLabel(event.intensity_0_10)}`, { 
      x: margin, y, size: 11, font: fontBold 
    });
    y -= 16;

    // Medications
    if (event.medications && event.medications.length > 0) {
      page.drawText(`💊 Medikamente:`, { x: margin + 10, y, size: 9, font: fontBold });
      y -= 12;
      
      for (const med of event.medications) {
        const medText = `• ${med.name}${med.dose_mg ? ` (${med.dose_mg}${med.units || 'mg'})` : ''}${med.effect_rating ? ` - Wirkung: ${med.effect_rating}/4` : ''}`;
        page.drawText(medText, { x: margin + 20, y, size: 8, font });
        y -= 10;
      }
      y -= 4;
    }

    // Symptoms
    if (event.symptoms && event.symptoms.length > 0) {
      page.drawText(`🧩 Symptome: ${event.symptoms.join(', ')}`, { x: margin + 10, y, size: 9, font });
      y -= 14;
    }

    // Weather (if enabled and available)
    if (includeWeather && event.weather) {
      const weatherText = `🌤️ Wetter: ${event.weather.condition_text || 'N/A'}, ${event.weather.temperature_c || 'N/A'}°C, ${event.weather.pressure_mb || 'N/A'}mb, ${event.weather.humidity || 'N/A'}% Luftfeuchtigkeit`;
      page.drawText(weatherText, { x: margin + 10, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
      y -= 12;
    }

    // Notes
    if (event.notes_extraordinary) {
      page.drawText(`📝 Notizen: ${event.notes_extraordinary}`, { x: margin + 10, y, size: 9, font });
      y -= 14;
    }

    y -= 8; // Space between events
    
    // Divider line
    if (y > margin + 20) {
      page.drawLine({ 
        start: { x: margin, y }, 
        end: { x: page.getWidth() - margin, y }, 
        thickness: 0.3, 
        color: rgb(0.9, 0.9, 0.9) 
      });
      y -= 12;
    }
  }

  // Doctor summary section
  if (includeDoctorSummary) {
    addPageIfNeeded();
    y -= 20;
    
    page.drawText("👨‍⚕️ ÄRZTLICHE ZUSAMMENFASSUNG", { x: margin, y, size: 14, font: fontBold });
    y -= 20;
    
    // Medication effectiveness analysis
    const medAnalysis = new Map<string, { count: number; totalRating: number; avgRating: number }>();
    
    events.forEach(event => {
      event.medications?.forEach(med => {
        if (med.effect_rating) {
          const current = medAnalysis.get(med.name) || { count: 0, totalRating: 0, avgRating: 0 };
          current.count++;
          current.totalRating += med.effect_rating;
          current.avgRating = current.totalRating / current.count;
          medAnalysis.set(med.name, current);
        }
      });
    });

    if (medAnalysis.size > 0) {
      page.drawText("Medikamenten-Wirksamkeit:", { x: margin, y, size: 11, font: fontBold });
      y -= 16;
      
      Array.from(medAnalysis.entries())
        .sort((a, b) => b[1].avgRating - a[1].avgRating)
        .forEach(([name, stats]) => {
          const effectiveness = stats.avgRating >= 3 ? "Hoch" : stats.avgRating >= 2 ? "Mittel" : "Niedrig";
          page.drawText(`• ${name}: ${effectiveness} (⌀ ${stats.avgRating.toFixed(1)}/4, ${stats.count}x verwendet)`, { 
            x: margin + 10, y, size: 9, font 
          });
          y -= 12;
        });
      y -= 10;
    }

    // Pattern analysis
    page.drawText("Empfehlungen:", { x: margin, y, size: 11, font: fontBold });
    y -= 16;
    
    if (avgIntensity > 6) {
      page.drawText("• Hohe durchschnittliche Schmerzintensität - Ärztliche Beratung empfohlen", { x: margin + 10, y, size: 9, font });
      y -= 12;
    }
    
    if (events.length > 15) {
      page.drawText("• Häufige Ereignisse - Präventionsstrategien evaluieren", { x: margin + 10, y, size: 9, font });
      y -= 12;
    }
    
    page.drawText("• Führen Sie dieses Tagebuch bei Ihrem nächsten Arzttermin vor", { x: margin + 10, y, size: 9, font });
    y -= 12;
  }

  // Footer
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`Seite ${index + 1} von ${pages.length} - Erstellt am ${new Date().toLocaleDateString('de-DE')}`, { 
      x: margin, 
      y: 30, 
      size: 8, 
      font, 
      color: rgb(0.6, 0.6, 0.6) 
    });
  });

  return await pdf.save();
}