/**
 * Parser for medication course voice input
 * Extracts medication name, dosage, rhythm, start date from German voice input
 */

import type { MedicationCourseType } from "@/features/medication-courses";
import { parseDoseText, type StructuredDosage, getDefaultStructuredDosage } from "@/components/PainApp/MedicationCourses/StructuredDosageInput";

export interface ParsedMedicationCourse {
  medicationName: string | null;
  medicationNameConfidence: number;
  type: MedicationCourseType | null;
  dosage: Partial<StructuredDosage>;
  startDate: Date | null;
  isActive: boolean;
  rawTranscript: string;
}

// Common medication names for fuzzy matching
const KNOWN_MEDICATIONS: { name: string; type: MedicationCourseType }[] = [
  // Prophylaxe - CGRP-Antikörper
  { name: "Ajovy", type: "prophylaxe" },
  { name: "Fremanezumab", type: "prophylaxe" },
  { name: "Aimovig", type: "prophylaxe" },
  { name: "Erenumab", type: "prophylaxe" },
  { name: "Emgality", type: "prophylaxe" },
  { name: "Galcanezumab", type: "prophylaxe" },
  { name: "Vyepti", type: "prophylaxe" },
  { name: "Eptinezumab", type: "prophylaxe" },
  
  // Prophylaxe - Beta-Blocker
  { name: "Propranolol", type: "prophylaxe" },
  { name: "Metoprolol", type: "prophylaxe" },
  { name: "Bisoprolol", type: "prophylaxe" },
  
  // Prophylaxe - Antiepileptika
  { name: "Topiramat", type: "prophylaxe" },
  { name: "Topamax", type: "prophylaxe" },
  { name: "Valproat", type: "prophylaxe" },
  
  // Prophylaxe - Antidepressiva
  { name: "Amitriptylin", type: "prophylaxe" },
  { name: "Venlafaxin", type: "prophylaxe" },
  
  // Prophylaxe - Andere
  { name: "Flunarizin", type: "prophylaxe" },
  { name: "Magnesium", type: "prophylaxe" },
  { name: "Botox", type: "prophylaxe" },
  
  // Akut - Triptane
  { name: "Sumatriptan", type: "akut" },
  { name: "Rizatriptan", type: "akut" },
  { name: "Maxalt", type: "akut" },
  { name: "Zolmitriptan", type: "akut" },
  { name: "Eletriptan", type: "akut" },
  { name: "Relpax", type: "akut" },
  { name: "Naratriptan", type: "akut" },
  { name: "Almotriptan", type: "akut" },
  { name: "Frovatriptan", type: "akut" },
  
  // Akut - Schmerzmittel
  { name: "Ibuprofen", type: "akut" },
  { name: "Paracetamol", type: "akut" },
  { name: "Aspirin", type: "akut" },
  { name: "Novaminsulfon", type: "akut" },
  { name: "Metamizol", type: "akut" },
  { name: "Diclofenac", type: "akut" },
  { name: "Naproxen", type: "akut" },
  
  // Akut - Antiemetika
  { name: "MCP", type: "akut" },
  { name: "Metoclopramid", type: "akut" },
  { name: "Domperidon", type: "akut" },
];

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Find medication name in transcript with fuzzy matching
 */
function findMedication(
  transcript: string,
  userMeds: Array<{ name: string }>
): { name: string; type: MedicationCourseType | null; confidence: number } | null {
  const normalized = transcript.toLowerCase();
  
  // First, check user's own medications (exact match)
  for (const med of userMeds) {
    if (normalized.includes(med.name.toLowerCase())) {
      // Try to find type from known medications
      const known = KNOWN_MEDICATIONS.find(
        (k) => k.name.toLowerCase() === med.name.toLowerCase()
      );
      return {
        name: med.name,
        type: known?.type || null,
        confidence: 0.95,
      };
    }
  }
  
  // Then check known medications (exact match)
  for (const med of KNOWN_MEDICATIONS) {
    if (normalized.includes(med.name.toLowerCase())) {
      return {
        name: med.name,
        type: med.type,
        confidence: 0.9,
      };
    }
  }
  
  // Fuzzy matching for known medications
  const words = normalized.split(/\s+/);
  let bestMatch: { name: string; type: MedicationCourseType; distance: number } | null = null;
  
  for (const word of words) {
    if (word.length < 4) continue; // Skip short words
    
    for (const med of KNOWN_MEDICATIONS) {
      const distance = levenshtein(word, med.name.toLowerCase());
      const maxDistance = Math.floor(med.name.length * 0.3); // 30% tolerance
      
      if (distance <= maxDistance) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { name: med.name, type: med.type, distance };
        }
      }
    }
  }
  
  if (bestMatch) {
    const confidence = Math.max(0.5, 1 - bestMatch.distance / bestMatch.name.length);
    return {
      name: bestMatch.name,
      type: bestMatch.type,
      confidence,
    };
  }
  
  // Fuzzy matching for user medications
  for (const med of userMeds) {
    for (const word of words) {
      if (word.length < 4) continue;
      
      const distance = levenshtein(word, med.name.toLowerCase());
      const maxDistance = Math.floor(med.name.length * 0.3);
      
      if (distance <= maxDistance) {
        const confidence = Math.max(0.5, 1 - distance / med.name.length);
        return {
          name: med.name,
          type: null,
          confidence,
        };
      }
    }
  }
  
  return null;
}

/**
 * Parse start date from transcript
 */
function parseStartDate(transcript: string): Date | null {
  const normalized = transcript.toLowerCase();
  const now = new Date();
  
  // Month names mapping
  const months: Record<string, number> = {
    januar: 0, jänner: 0, jan: 0,
    februar: 1, feb: 1,
    märz: 2, mar: 2,
    april: 3, apr: 3,
    mai: 4,
    juni: 5, jun: 5,
    juli: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    oktober: 9, okt: 9,
    november: 10, nov: 10,
    dezember: 11, dez: 11,
  };
  
  // "seit März" / "seit März 2024"
  const seitMatch = normalized.match(/seit\s+(\w+)(?:\s+(\d{4}))?/);
  if (seitMatch) {
    const monthName = seitMatch[1];
    const year = seitMatch[2] ? parseInt(seitMatch[2]) : now.getFullYear();
    
    if (months[monthName] !== undefined) {
      const month = months[monthName];
      // If month is in future and no year specified, use previous year
      const date = new Date(year, month, 1);
      if (date > now && !seitMatch[2]) {
        date.setFullYear(date.getFullYear() - 1);
      }
      return date;
    }
  }
  
  // "seit 3 Monaten" / "seit einem halben Jahr"
  const relativMatch = normalized.match(/seit\s+(\d+|einem?|zwei|drei|vier|fünf|sechs)\s+(monat|jahr|woch)/);
  if (relativMatch) {
    const numberMap: Record<string, number> = {
      ein: 1, einem: 1, eine: 1, einer: 1,
      zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6,
    };
    
    const amount = numberMap[relativMatch[1]] || parseInt(relativMatch[1]) || 1;
    const unit = relativMatch[2];
    
    const date = new Date(now);
    if (unit.startsWith("monat")) {
      date.setMonth(date.getMonth() - amount);
    } else if (unit.startsWith("jahr")) {
      date.setFullYear(date.getFullYear() - amount);
    } else if (unit.startsWith("woch")) {
      date.setDate(date.getDate() - amount * 7);
    }
    return date;
  }
  
  // "seit halben Jahr" / "seit einem halben Jahr"
  if (normalized.includes("halben jahr") || normalized.includes("halbes jahr")) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - 6);
    return date;
  }
  
  return null;
}

/**
 * Parse medication type from context
 */
function parseType(transcript: string): MedicationCourseType | null {
  const normalized = transcript.toLowerCase();
  
  if (
    normalized.includes("prophylaxe") ||
    normalized.includes("vorbeugen") ||
    normalized.includes("vorbeugend") ||
    normalized.includes("präventiv")
  ) {
    return "prophylaxe";
  }
  
  if (
    normalized.includes("akut") ||
    normalized.includes("bei bedarf") ||
    normalized.includes("anfall") ||
    normalized.includes("attacke")
  ) {
    return "akut";
  }
  
  return null;
}

/**
 * Main parser function for medication course voice input
 */
export function parseMedicationCourseFromVoice(
  transcript: string,
  userMeds: Array<{ name: string }> = []
): ParsedMedicationCourse {
  const result: ParsedMedicationCourse = {
    medicationName: null,
    medicationNameConfidence: 0,
    type: null,
    dosage: {},
    startDate: null,
    isActive: true,
    rawTranscript: transcript,
  };
  
  // Find medication name
  const medMatch = findMedication(transcript, userMeds);
  if (medMatch) {
    result.medicationName = medMatch.name;
    result.medicationNameConfidence = medMatch.confidence;
    result.type = medMatch.type;
  }
  
  // Override type if explicitly mentioned
  const explicitType = parseType(transcript);
  if (explicitType) {
    result.type = explicitType;
  }
  
  // Parse dosage information
  result.dosage = parseDoseText(transcript);
  
  // Parse start date
  result.startDate = parseStartDate(transcript);
  
  // Check if still active
  const normalized = transcript.toLowerCase();
  if (
    normalized.includes("nicht mehr") ||
    normalized.includes("abgesetzt") ||
    normalized.includes("beendet") ||
    normalized.includes("gestoppt")
  ) {
    result.isActive = false;
  }
  
  return result;
}

/**
 * Apply parsed voice data to form state
 */
export function applyParsedDataToForm(
  parsed: ParsedMedicationCourse,
  currentDosage: StructuredDosage
): {
  medicationName: string;
  type: MedicationCourseType;
  dosage: StructuredDosage;
  startDate: Date | undefined;
  isActive: boolean;
} {
  return {
    medicationName: parsed.medicationName || "",
    type: parsed.type || "prophylaxe",
    dosage: {
      ...currentDosage,
      ...parsed.dosage,
    },
    startDate: parsed.startDate || undefined,
    isActive: parsed.isActive,
  };
}
