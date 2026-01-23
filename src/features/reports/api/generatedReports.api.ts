/**
 * Generated Reports API
 * Manages the history of generated PDF reports
 */

import { supabase } from "@/lib/supabaseClient";

export type ReportType = 'diary' | 'medication_plan' | 'hit6' | 'daily_impact';

export interface GeneratedReport {
  id: string;
  user_id: string;
  report_type: ReportType;
  title: string;
  from_date: string | null;
  to_date: string | null;
  file_size_bytes: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Light version without blob for listing
type GeneratedReportListItem = Omit<GeneratedReport, 'pdf_blob'>;

export async function fetchGeneratedReports(): Promise<GeneratedReportListItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('generated_reports')
    .select('id, user_id, report_type, title, from_date, to_date, file_size_bytes, metadata, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching generated reports:', error);
    throw error;
  }

  return (data || []) as GeneratedReportListItem[];
}

export async function fetchGeneratedReportsByType(reportType: ReportType): Promise<GeneratedReportListItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('generated_reports')
    .select('id, user_id, report_type, title, from_date, to_date, file_size_bytes, metadata, created_at')
    .eq('user_id', user.id)
    .eq('report_type', reportType)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as GeneratedReportListItem[];
}

export async function downloadGeneratedReport(id: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from('generated_reports')
    .select('pdf_blob, title, file_size_bytes')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  // pdf_blob is stored as base64 string
  if (!data?.pdf_blob) {
    console.error('[downloadGeneratedReport] pdf_blob is null or empty');
    return null;
  }
  
  const blob = data.pdf_blob;
  console.log('[downloadGeneratedReport] Loading PDF:', {
    id,
    storedFileSize: data.file_size_bytes,
    blobType: typeof blob,
    blobLength: typeof blob === 'string' ? blob.length : 'N/A',
  });
  
  if (typeof blob === 'string') {
    // If it's a hex string (starts with \x), convert
    if (blob.startsWith('\\x')) {
      const hex = blob.slice(2);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      
      // Validate PDF header
      const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
      console.log('[downloadGeneratedReport] Hex decoded:', {
        byteLength: bytes.byteLength,
        headerASCII: header,
        startsWithPDF: header.startsWith('%PDF-'),
      });
      
      return bytes;
    }
    
    // Otherwise assume base64
    try {
      const binary = atob(blob);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      // Validate PDF header
      const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
      console.log('[downloadGeneratedReport] Base64 decoded:', {
        byteLength: bytes.byteLength,
        headerASCII: header,
        startsWithPDF: header.startsWith('%PDF-'),
      });
      
      if (!header.startsWith('%PDF-')) {
        console.error('[downloadGeneratedReport] Invalid PDF: header does not start with %PDF-');
      }
      
      return bytes;
    } catch (decodeError) {
      console.error('[downloadGeneratedReport] Failed to decode base64:', decodeError);
      return null;
    }
  }
  
  console.error('[downloadGeneratedReport] Unexpected blob type:', typeof blob);
  return null;
}

export async function deleteGeneratedReport(id: string): Promise<void> {
  const { error } = await supabase
    .from('generated_reports')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export interface SaveGeneratedReportInput {
  report_type: ReportType;
  title: string;
  from_date?: string | null;
  to_date?: string | null;
  pdf_bytes: Uint8Array;
  metadata?: Record<string, unknown> | null;
}

export async function saveGeneratedReport(input: SaveGeneratedReportInput): Promise<GeneratedReport> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht angemeldet');

  // Convert Uint8Array to base64 for storage
  // Using chunked approach to avoid call stack size exceeded for large PDFs
  const bytes = input.pdf_bytes;
  const chunkSize = 0x8000; // 32KB chunks
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  const base64 = btoa(chunks.join(''));
  
  // Debug logging for PDF validation
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  console.log('[saveGeneratedReport] PDF validation:', {
    isUint8Array: bytes instanceof Uint8Array,
    byteLength: bytes.byteLength,
    headerASCII: header,
    startsWithPDF: header.startsWith('%PDF-'),
    base64Length: base64.length,
  });

  const { data, error } = await supabase
    .from('generated_reports')
    .insert({
      user_id: user.id,
      report_type: input.report_type,
      title: input.title,
      from_date: input.from_date,
      to_date: input.to_date,
      pdf_blob: base64,
      file_size_bytes: input.pdf_bytes.length,
      metadata: input.metadata || {},
    })
    .select('id, user_id, report_type, title, from_date, to_date, file_size_bytes, metadata, created_at')
    .single();

  if (error) throw error;
  
  console.log('[saveGeneratedReport] Saved successfully:', {
    id: data.id,
    file_size_bytes: data.file_size_bytes,
  });
  
  return data as GeneratedReport;
}

export function getReportTypeLabel(type: ReportType): string {
  const labels: Record<ReportType, string> = {
    diary: 'Kopfschmerztagebuch',
    medication_plan: 'Medikationsplan',
    hit6: 'Fragebogen (alt)', // Legacy: HIT-6 PDFs die noch im Verlauf sind
    daily_impact: 'Alltagsbelastung (Kurzcheck)',
  };
  return labels[type] || type;
}
