
## 1. App-PDF-Erzeugung aktuell

- Einstieg: `src/components/PainApp/DiaryReport.tsx` → `generatePDF()` (Z. 827) ruft `buildDiaryPdf` aus `src/lib/pdf/report.ts` auf.
- KI-Block: `src/lib/ai/buildAiPdfSummary.ts` (kurze, doctor-oriented Verlaufszusammenfassung, „letzte 30 Tage im Berichtszeitraum"). Edge-Function `generate-ai-diary-report` liefert nur den KI-Rohtext.
- Datenbasis: `buildReportData` + `computeClinicalAnalysis` (SSOT, korrekter Donut, Umlaute, etc.).
- Nach dem Build: `uploadPdfToStorage` → Bucket `generated-reports`, Eintrag in Tabelle `generated_reports` (report_type=`diary`).
- **Diese fertige PDF-Datei ist der einzige „kanonische" Kopfschmerztagebuch-Bericht.**

## 2. Website-/Doctor-Share-PDF-Erzeugung aktuell (App/Supabase-Seite)

Im App-/Supabase-Projekt existieren genau zwei für die Website relevante Endpoints:

- `get-shared-report-data` (`supabase/functions/get-shared-report-data/index.ts`)
  - Liefert JSON (Snapshot, KPIs, patternAnalysisV21 etc.) **und** die Referenz auf die verknüpfte App-PDF:
    `historyDiaryId`, `historyDiaryCreatedAt`, `pdfFilePath`, `isTodayDiary`.
  - Erzeugt selbst KEIN PDF.
- `get-shared-report-pdf` (`supabase/functions/get-shared-report-pdf/index.ts`)
  - Lädt mit `historyDiaryId` exakt die unter „Verlauf" gespeicherte App-PDF aus dem Storage-Bucket `generated-reports` und gibt sie als `application/pdf` zurück.
  - Erzeugt KEIN neues PDF, rendert nichts, keine Snapshot-PDF, keine Legacy-KI.

Verknüpfung läuft über `doctor_share_settings.generated_report_id` → `generated_reports.id` (siehe `_shared/doctorSharedHistoryReport.ts`).

## 3. Ursache für unterschiedliche PDFs

Backend ist sauber: `get-shared-report-pdf` kann strukturell nur die finale App-PDF zurückgeben. Die Legacy-Überschriften („DATENBASIERTE MUSTERANALYSE (KI-GESTÜTZT)", „CHRONOBIOLOGISCHES MUSTER", „MOH FRÜHWARNUNG", „SCHMERZFREIE INTERVALLE & VERLAUFSTENDENZ", „ICHD-3 KRITERIEN-SCREENING") existieren in der aktuellen App-PDF-Pipeline nicht mehr (`rg` findet sie nur in alten Tests/Doku, nicht im aktiven Renderer).

→ Das bedeutet: Die Website rendert das PDF **selbst** aus dem JSON von `get-shared-report-data` (vermutlich aus `latestAiReport.patternAnalysisV21` + eigenem PDF-Builder/Legacy-Template) statt die fertige Datei via `get-shared-report-pdf` herunterzuladen. Alternativ ist auf der Website ein älterer Endpoint/Builder hartcodiert.

Zusätzlich möglich, aber zweitrangig: die im Share verknüpfte `generated_report_id` zeigt auf einen alten App-PDF-Verlaufseintrag, der noch mit der Legacy-Pipeline erzeugt wurde. Das würde aber dieselbe alte App-PDF liefern, nicht zwingend die genannten Legacy-Überschriften — diese Überschriften deuten klar auf einen Website-eigenen Renderer hin.

## 4. Wo muss gefixt werden

**Im Website-Projekt, nicht in App/Supabase.** Die App-/Supabase-Seite ist bereits korrekt und liefert über `get-shared-report-pdf` exakt die finale App-PDF.

Einzige optionale App-Seite: Nutzer sollte sicherstellen, dass die im Share-Setting verknüpfte `generated_report_id` auf einen **aktuellen** Bericht aus der neuen Pipeline zeigt (alten Verlaufseintrag löschen oder neuen Bericht erstellen und freigeben).

## 5. Exakter Ziel-Endpoint / Ziel-Flow für Website

Die Website MUSS folgenden Zwei-Schritt-Flow verwenden:

```text
1) POST/GET  <SUPABASE_URL>/functions/v1/get-shared-report-data
   Header:   x-doctor-access: <signed HMAC token>
   Query:    range=3m  (optional: page=1)
   → JSON, daraus auslesen:
        historyDiaryId            (string|null)
        pdfFilePath               (string|null)
        historyDiaryCreatedAt
        isTodayDiary

2) GET       <SUPABASE_URL>/functions/v1/get-shared-report-pdf?historyDiaryId=<historyDiaryId>
   Header:   x-doctor-access: <signed HMAC token>
   → application/pdf  (exakt die App-PDF aus Storage; als Blob downloaden/öffnen)
```

- Die Website darf KEINE eigene PDF-Erzeugung mehr ausführen (kein eigener jsPDF/pdfmake/Server-Render, kein eigenes Template, keine eigene KI-Analyse-Rendering).
- Falls `historyDiaryId` / `pdfFilePath` `null` ist: Hinweis anzeigen „Noch kein freigegebener Bericht vorhanden" — NICHT eigenes PDF generieren.

## 6. Konkreter nächster Prompt für das Website-Projekt

> PROJEKT: WEBSITE (Doctor-Share)
>
> Bitte den PDF-Download nach Code-Freigabe so umstellen, dass die Website KEIN eigenes PDF mehr rendert, sondern ausschließlich die fertige App-PDF aus Supabase herunterlädt.
>
> 1. Entferne jeden website-seitigen PDF-Renderer/Template (jsPDF/pdfmake/serverseitiger Render) inklusive aller Legacy-Blöcke:
>    - „DATENBASIERTE MUSTERANALYSE (KI-GESTÜTZT)"
>    - „CHRONOBIOLOGISCHES MUSTER"
>    - „MEDIKAMENTEN-ÜBERGEBRAUCH (MOH) FRÜHWARNUNG"
>    - „SCHMERZFREIE INTERVALLE & VERLAUFSTENDENZ"
>    - „ICHD-3 KRITERIEN-SCREENING"
>    - alles, was `possiblePatterns`, `clinicalSummary`, `chronobiologicalPattern`, `mohWarning`, `icd3Screening` als PDF-Inhalt verwendet.
> 2. Neuer Download-Flow:
>    a) `get-shared-report-data` (Header `x-doctor-access`) aufrufen und `historyDiaryId` aus der Response lesen.
>    b) Wenn `historyDiaryId` vorhanden: `GET .../functions/v1/get-shared-report-pdf?historyDiaryId=<id>` (Header `x-doctor-access`) aufrufen, Response als Blob (`application/pdf`) speichern und als Download anbieten.
>    c) Wenn nicht vorhanden: UI-Hinweis „Noch kein freigegebener Kopfschmerztagebuch-Bericht vorhanden" anzeigen, KEIN PDF erzeugen.
> 3. KI-/Musteranalyse-Inhalte dürfen auf der Website ausschließlich im Web-Dashboard angezeigt werden (aus `latestAiReport.patternAnalysisV21`), nicht ins PDF gerendert werden.
> 4. Keine neuen Edge-Functions, keine Änderungen am Supabase-Schema. Nur Frontend-Fix im Website-Projekt.
>
> Bitte am Ende antworten mit: geänderte Dateien, alter PDF-Renderer entfernt (ja/nein), neuer Download-Flow getestet (ja/nein).

## Hinweis vor dem Website-Fix

Bitte im App-Projekt einen neuen Bericht erstellen und in der Code-Freigabe als Verlaufs-PDF verknüpfen, damit der Website-Download nach dem Fix definitiv die aktuelle Version zieht (alte `generated_report_id` ersetzen).
