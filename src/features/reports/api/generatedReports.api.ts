/**
 * Generated Reports API
 * Manages the history of generated PDF reports
 * Now uses Supabase Storage for robust binary handling
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
  storage_path: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Light version without blob for listing
type GeneratedReportListItem = Omit<GeneratedReport, 'pdf_blob'>;

/**
 * Compute simple checksum for verification (sum of all bytes mod 2^32)
 */
function computeChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    sum = (sum + bytes[i]) >>> 0; // Keep as unsigned 32-bit
  }
  return sum;
}

/**
 * Extract header and tail for PDF validation
 */
function getPdfSignatures(bytes: Uint8Array): { header: string; tail: string; byteLength: number; checksum: number; hasEOF: boolean } {
  const header = bytes.length >= 5 
    ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4])
    : '';
  
  // Check last 50 bytes for %%EOF marker
  const tailStart = Math.max(0, bytes.length - 50);
  const tailBytes = bytes.slice(tailStart);
  let tail = '';
  for (let i = 0; i < tailBytes.length; i++) {
    const char = tailBytes[i];
    if (char >= 32 && char <= 126) {
      tail += String.fromCharCode(char);
    }
  }
  
  const hasEOF = tail.includes('%%EOF');
  
  return {
    header,
    tail,
    byteLength: bytes.length,
    checksum: computeChecksum(bytes),
    hasEOF,
  };
}

export async function fetchGeneratedReports(): Promise<GeneratedReportListItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('generated_reports')
    .select('id, user_id, report_type, title, from_date, to_date, file_size_bytes, storage_path, metadata, created_at')
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
    .select('id, user_id, report_type, title, from_date, to_date, file_size_bytes, storage_path, metadata, created_at')
    .eq('user_id', user.id)
    .eq('report_type', reportType)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as GeneratedReportListItem[];
}

export async function downloadGeneratedReport(id: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from('generated_reports')
    .select('pdf_blob, storage_path, title, file_size_bytes')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  console.log('[downloadGeneratedReport] Report metadata:', {
    id,
    storedFileSize: data.file_size_bytes,
    hasStoragePath: !!data.storage_path,
    hasPdfBlob: !!data.pdf_blob,
  });

  // NEW: Try storage_path first (preferred method)
  if (data.storage_path) {
    console.log('[downloadGeneratedReport] Using Storage path:', data.storage_path);
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('generated-reports')
      .download(data.storage_path);
    
    if (downloadError) {
      console.error('[downloadGeneratedReport] Storage download failed:', downloadError);
      // Fall through to legacy pdf_blob
    } else if (fileData) {
      const arrayBuffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      const signatures = getPdfSignatures(bytes);
      console.log('[downloadGeneratedReport] Storage download success:', {
        byteLength: signatures.byteLength,
        header: signatures.header,
        startsWithPDF: signatures.header.startsWith('%PDF-'),
        tail: signatures.tail,
        checksum: signatures.checksum,
      });
      
      if (!signatures.header.startsWith('%PDF-')) {
        console.error('[downloadGeneratedReport] Invalid PDF from storage: header mismatch');
      }
      
      return bytes;
    }
  }

  // LEGACY: Fall back to pdf_blob (base64 in bytea column)
  if (!data?.pdf_blob) {
    console.error('[downloadGeneratedReport] No storage_path and pdf_blob is null');
    return null;
  }
  
  const blob = data.pdf_blob;
  console.log('[downloadGeneratedReport] Using legacy pdf_blob:', {
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
      
      const signatures = getPdfSignatures(bytes);
      console.log('[downloadGeneratedReport] Hex decoded:', signatures);
      
      return bytes;
    }
    
    // Otherwise assume base64
    try {
      const binary = atob(blob);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      const signatures = getPdfSignatures(bytes);
      console.log('[downloadGeneratedReport] Base64 decoded:', signatures);
      
      if (!signatures.header.startsWith('%PDF-')) {
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
  // First get the storage_path to delete from storage
  const { data } = await supabase
    .from('generated_reports')
    .select('storage_path')
    .eq('id', id)
    .single();
  
  // Delete from storage if path exists
  if (data?.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('generated-reports')
      .remove([data.storage_path]);
    
    if (storageError) {
      console.warn('[deleteGeneratedReport] Failed to delete from storage:', storageError);
      // Continue with DB delete anyway
    }
  }

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

  const bytes = input.pdf_bytes;
  
  // STEP 1: Validate PDF before upload
  const beforeSignatures = getPdfSignatures(bytes);
  console.log('[saveGeneratedReport] BEFORE upload - PDF validation:', {
    isUint8Array: bytes instanceof Uint8Array,
    byteOffset: bytes.byteOffset,
    byteLength: bytes.byteLength,
    bufferByteLength: bytes.buffer.byteLength,
    ...beforeSignatures,
    startsWithPDF: beforeSignatures.header.startsWith('%PDF-'),
  });
  
  if (!beforeSignatures.header.startsWith('%PDF-')) {
    throw new Error('Invalid PDF: header does not start with %PDF-');
  }

  // STEP 2: Upload to Supabase Storage (robust binary handling)
  const timestamp = Date.now();
  const storagePath = `${user.id}/${timestamp}_${input.report_type}.pdf`;
  
  console.log('[saveGeneratedReport] Uploading to storage:', {
    bucket: 'generated-reports',
    path: storagePath,
    byteLength: bytes.length,
  });
  
  // CRITICAL: Create exact Blob from Uint8Array slice (ensures exact bytes, not shared buffer)
  const exactBytes = new Uint8Array(bytes);
  const pdfBlob = new Blob([exactBytes.buffer.slice(exactBytes.byteOffset, exactBytes.byteOffset + exactBytes.byteLength)], { type: 'application/pdf' });
  
  console.log('[saveGeneratedReport] Blob created:', {
    blobSize: pdfBlob.size,
    blobType: pdfBlob.type,
  });
  
  const { error: uploadError } = await supabase.storage
    .from('generated-reports')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false,
    });
  
  if (uploadError) {
    console.error('[saveGeneratedReport] Storage upload failed:', uploadError);
    throw new Error(`PDF upload failed: ${uploadError.message}`);
  }
  
  console.log('[saveGeneratedReport] Storage upload success');

  // STEP 3: Verify round-trip by immediately downloading
  const { data: verifyData, error: verifyError } = await supabase.storage
    .from('generated-reports')
    .download(storagePath);
  
  if (verifyError || !verifyData) {
    console.error('[saveGeneratedReport] Round-trip verification FAILED:', verifyError);
    // Clean up the uploaded file
    await supabase.storage.from('generated-reports').remove([storagePath]);
    throw new Error('PDF verification failed after upload');
  }
  
  const verifyArrayBuffer = await verifyData.arrayBuffer();
  const verifyBytes = new Uint8Array(verifyArrayBuffer);
  const afterSignatures = getPdfSignatures(verifyBytes);
  
  console.log('[saveGeneratedReport] AFTER upload - Round-trip verification:', {
    ...afterSignatures,
    startsWithPDF: afterSignatures.header.startsWith('%PDF-'),
    hasEOF: afterSignatures.hasEOF,
  });
  
  // Compare checksums and lengths
  const isIdentical = beforeSignatures.checksum === afterSignatures.checksum 
    && beforeSignatures.byteLength === afterSignatures.byteLength;
  
  console.log('[saveGeneratedReport] Round-trip comparison:', {
    beforeChecksum: beforeSignatures.checksum,
    afterChecksum: afterSignatures.checksum,
    beforeLength: beforeSignatures.byteLength,
    afterLength: afterSignatures.byteLength,
    beforeHasEOF: beforeSignatures.hasEOF,
    afterHasEOF: afterSignatures.hasEOF,
    isIdentical,
  });
  
  if (!isIdentical) {
    console.error('[saveGeneratedReport] CORRUPTION DETECTED: checksum mismatch!');
    await supabase.storage.from('generated-reports').remove([storagePath]);
    throw new Error('PDF corruption detected: checksum mismatch after upload');
  }
  
  if (!afterSignatures.header.startsWith('%PDF-')) {
    console.error('[saveGeneratedReport] CORRUPTION DETECTED: PDF header invalid after upload!');
    await supabase.storage.from('generated-reports').remove([storagePath]);
    throw new Error('PDF corruption detected: invalid header after upload');
  }

  // STEP 4: Save metadata to generated_reports table
  const { data, error } = await supabase
    .from('generated_reports')
    .insert({
      user_id: user.id,
      report_type: input.report_type,
      title: input.title,
      from_date: input.from_date,
      to_date: input.to_date,
      storage_path: storagePath,
      pdf_blob: null, // No longer using bytea
      file_size_bytes: bytes.length,
      metadata: input.metadata || {},
    })
    .select('id, user_id, report_type, title, from_date, to_date, file_size_bytes, storage_path, metadata, created_at')
    .single();

  if (error) {
    // Clean up storage on DB error
    await supabase.storage.from('generated-reports').remove([storagePath]);
    throw error;
  }
  
  console.log('[saveGeneratedReport] Saved successfully:', {
    id: data.id,
    storage_path: data.storage_path,
    file_size_bytes: data.file_size_bytes,
    roundTripVerified: true,
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
