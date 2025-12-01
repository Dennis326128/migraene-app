# PDF-Export-System: Kopfschmerztagebuch

## 📋 Übersicht

Dieses Verzeichnis enthält die **PDF-Templates** für den Export des Kopfschmerztagebuchs. Die Templates erzeugen professionelle, medizinisch brauchbare Dokumente für Ärzt:innen und Krankenkassen.

---

## 🎯 Aktive Dateien

### 1. `report.ts` → Funktion: `buildDiaryPdf()`
✅ Hauptfunktion für das **Kopfschmerztagebuch-PDF**  
✅ Enthält Statistiken, Charts, Einträge, KI-Analyse  
✅ Aufgerufen von: `src/components/PainApp/DiaryReport.tsx`

### 2. `medicationPlan.ts` → Funktion: `buildMedicationPlanPdf()`
✅ Separates **Medikationsplan-PDF im BMP-Stil**  
✅ Bundeseinheitlicher Medikationsplan-Format  
✅ Enthält aktuelle Medikation und Therapiehistorie  
✅ Ohne KI-Interpretation  
✅ Aufgerufen von: `src/components/PainApp/DiaryReport.tsx`

---

## 📁 Veraltete Dateien (DEPRECATED)

- `modernReport.ts` ⚠️ Legacy, nicht mehr verwendet
- `professionalReport.ts` ⚠️ Legacy, nicht mehr verwendet

Diese Dateien sollten **nicht mehr bearbeitet** werden. Sie existieren nur noch für eventuelle Rückwärtskompatibilität.

---

## 🏗️ Struktur des PDF-Templates

### Seite 1: Metadaten & Übersicht
1. **Kopfbereich**
   - Titel: "Kopfschmerztagebuch"
   - Berichtszeitraum (dd.mm.yyyy - dd.mm.yyyy)
   - Erstellungsdatum

2. **Patient:innen-Daten** *(optional, checkbox-gesteuert)*
   - Name, Geburtsdatum
   - Adresse, Kontaktdaten

3. **Behandelnde:r Arzt/Ärztin** *(optional, checkbox-gesteuert)*
   - Name, Fachgebiet
   - Praxisadresse, Kontaktdaten

4. **Ärztliche KI-Kurzauswertung** *(optional, checkbox-gesteuert)*
   - 4-6 Bulletpoints mit Mustererkennung
   - Fokus auf diagnostische Unterstützung (keine Therapieempfehlungen)

5. **Zusammenfassung (KPIs)**
   - Episoden gesamt
   - Ø Schmerzintensität
   - Tage mit Schmerzen
   - Tage mit Medikation

### Seite 2+: Details
6. **Medikamenten-Statistik**
   - Tabellarische Übersicht
   - Spalten: Medikament, Einnahmen, Ø Wirksamkeit, Bemerkung

7. **Intensitätsverlauf (Chart)**
   - Liniendiagramm mit Y-Achse (0-10)
   - X-Achse: Zeitverlauf über Berichtszeitraum

8. **Detaillierte Episoden-Liste**
   - Tabelle mit Spalten: Datum/Zeit, Schmerz, Aura, Medikamente, Notizen
   - **Automatischer Pagebreak** bei langen Listen
   - **Wiederholter Tabellenkopf** auf neuen Seiten
   - **Textumbruch** in Spalten "Medikamente" und "Notizen"

---

## 🛠️ Wichtige Helper-Funktionen

### Datumsformatierung (Deutsche Standards)
```typescript
formatDateGerman(dateStr: string): string
// Output: "24.01.2025"

formatDateTimeGerman(dateStr: string, timeStr?: string): string
// Output: "24.01.2025, 14:30"

formatPercentGerman(value: number): string
// Output: "58,3 %"
```

### Text-Sanitization (WinAnsi-Encoding)
```typescript
sanitizeForPDF(text: string): string
```
- Entfernt problematische Unicode-Zeichen
- Ersetzt ⌀ → Ø, typografische Anführungszeichen, etc.
- Verhindert "cannot encode" Fehler bei der PDF-Generierung

### Textumbruch
```typescript
wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[]
```
- Bricht langen Text in Zeilen um
- Wird für Tabellenzellen verwendet (Medikamente, Notizen)

### Page Management
```typescript
ensureSpace(pdfDoc, currentPage, yPos, requiredSpace): { page, yPos }
```
- Prüft ob genug Platz auf der aktuellen Seite
- Erstellt automatisch neue Seite bei Bedarf

---

## 🎨 Design-System

### Farben (Medizinisches Design)
```typescript
COLORS = {
  primary: rgb(0.15, 0.35, 0.65),      // Medizinisches Blau (Titel)
  primaryLight: rgb(0.2, 0.4, 0.8),    // Helleres Blau (Überschriften)
  text: rgb(0.1, 0.1, 0.1),            // Haupttext (Schwarz)
  textLight: rgb(0.4, 0.4, 0.4),       // Sekundärtext (Grau)
  border: rgb(0.7, 0.7, 0.7),          // Rahmenlinien
  chartLine: rgb(0.93, 0.27, 0.27),    // Rot (Schmerzlinie)
  gridLine: rgb(0.9, 0.9, 0.9),        // Gitternetz
}
```

### Layout-Konstanten
```typescript
LAYOUT = {
  pageWidth: 595.28,    // A4
  pageHeight: 841.89,   // A4
  margin: 40,           // Seitenrand (40pt = ca. 14mm)
  lineHeight: 14,       // Standard-Zeilenabstand
  sectionGap: 20,       // Abstand zwischen Abschnitten
}
```

### Schriftgrößen
- **Titel**: 20pt, fett
- **Sektions-Überschriften**: 12-13pt, fett
- **Standardtext**: 9-10pt, normal
- **Tabellen-Text**: 8-9pt, normal
- **Footer**: 8pt, normal

---

## 🔧 Erweiterung & Wartung

### Neuen Abschnitt hinzufügen
1. Definiere neue `include*`-Flag in `BuildReportParams`
2. Füge Checkbox in `DiaryReport.tsx` hinzu
3. Implementiere Abschnitt in `buildDiaryPdf()` mit:
   - `ensureSpace()` für Pagebreak-Prüfung
   - `drawSectionHeader()` für Überschrift
   - `sanitizeForPDF()` für alle Benutzereingaben

### Tabelle mit Pagebreak erstellen
```typescript
// 1. Tabellenkopf zeichnen
yPos = drawTableHeader(page, yPos, font);

// 2. Pro Zeile:
for (const item of items) {
  // Berechne Zeilenhöhe (mit Textumbruch)
  const rowHeight = calculateRowHeight(item);
  
  // Prüfe Platz, erstelle ggf. neue Seite + neuer Tabellenkopf
  if (yPos - rowHeight < LAYOUT.margin + 30) {
    page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    yPos = LAYOUT.pageHeight - LAYOUT.margin;
    yPos = drawTableHeader(page, yPos, font);
  }
  
  // Zeichne Zeile
  // ...
  yPos -= rowHeight;
}
```

### Best Practices
✅ **IMMER** `sanitizeForPDF()` für Benutzereingaben verwenden  
✅ **IMMER** `ensureSpace()` vor neuen Abschnitten aufrufen  
✅ **IMMER** deutsche Datumsformate (`formatDateGerman`) verwenden  
✅ **NIEMALS** direkt `page.drawText()` ohne Platz-Prüfung bei dynamischen Inhalten  
✅ **NIEMALS** hardcodierte Testdaten verwenden  

---

## 🐛 Häufige Fehler & Lösungen

### "WinAnsi cannot encode" Error
**Ursache**: Unicode-Zeichen (⌀, Emojis, etc.) in Text  
**Lösung**: `sanitizeForPDF()` für alle Texte verwenden

### Text wird abgeschnitten
**Ursache**: Fehlende Pagebreak-Prüfung  
**Lösung**: `ensureSpace()` vor großen Blöcken aufrufen

### Tabelle bricht mitten in Zeile um
**Ursache**: Keine Zeilenhöhen-Berechnung vor Pagebreak-Prüfung  
**Lösung**: Erst `rowHeight` berechnen, dann prüfen ob `yPos - rowHeight < margin`

### Footer überschreibt Content
**Ursache**: `yPos` zu klein (< margin + 30)  
**Lösung**: Footer NACH allen Pages mit separater Schleife zeichnen

---

## 📊 KI-Analyse Integration

Die KI-Kurzauswertung wird von einer separaten Edge Function generiert:
- **Edge Function**: `supabase/functions/generate-diary-analysis/index.ts`
- **Prompt**: Fokus auf diagnostische Muster, keine Therapieempfehlungen
- **Format**: 4-6 kurze Bulletpoints (max. 1-2 Zeilen pro Punkt)
- **Darstellung**: Box mit hellblauem Hintergrund

Siehe separate Dokumentation für Prompt-Engineering der KI-Analyse.

---

## 📚 Weitere Ressourcen

- **pdf-lib Dokumentation**: https://pdf-lib.js.org/
- **Medizinische Layout-Standards**: DIN 5008 für Geschäftsbriefe
- **Accessibility**: WCAG 2.1 für Kontraste (min. 4.5:1)

---

**Letzte Aktualisierung**: 2025-01-21  
**Maintainer**: AI-Pair-Programmer
