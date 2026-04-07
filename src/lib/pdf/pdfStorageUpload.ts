/**
 * Fire-and-forget PDF Storage Upload
 * Uploads generated PDFs to Supabase Storage and upserts a generated_reports row.
 * Never throws — all errors are logged silently so the user download is never blocked.
 */

import { supabase } from '@/integrations/supabase/client';
import { buildStoragePath, buildPdfFilename } from './filenameUtils';

export interface UploadPdfOptions {
  userId: string;
  rangeStart: string;   // ISO date "YYYY-MM-DD"
  rangeEnd: string;     // ISO date "YYYY-MM-DD"
  lastName?: string;
  firstName?: string;
  pdfBytes: Uint8Array;
}

/**
 * Fire-and-forget: upload PDF to Storage and upsert generated_reports row.
 * Never throws — all errors are logged silently.
 */
export async function uploadPdfToStorage(opts: UploadPdfOptions): Promise<void> {
  try {
    const storagePath = buildStoragePath(opts.userId, opts.rangeStart, opts.rangeEnd);
    const filename = buildPdfFilename({
      lastName: opts.lastName,
      firstName: opts.firstName,
      fromDate: opts.rangeStart,
      toDate: opts.rangeEnd,
      reportType: 'diary',
    });

    // 1. Upload to Storage (upsert=true → overwrite if range already cached)
    const blob = new Blob([opts.pdfBytes], { type: 'application/pdf' });
    const { error: uploadError } = await supabase.storage
      .from('generated-reports')
      .upload(storagePath, blob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[pdfStorageUpload] Upload failed:', uploadError.message);
      return;
    }

    console.log('[pdfStorageUpload] Upload success:', storagePath);

    // 2. Upsert into generated_reports (use existing table columns)
    const { error: dbError } = await supabase
      .from('generated_reports')
      .insert({
        user_id: opts.userId,
        report_type: 'diary',
        title: filename,
        from_date: opts.rangeStart,
        to_date: opts.rangeEnd,
        storage_path: storagePath,
        file_size_bytes: opts.pdfBytes.length,
        pdf_blob: null,
        metadata: { source: 'app_export', cached_at: new Date().toISOString() },
      } as any);

    if (dbError) {
      console.error('[pdfStorageUpload] DB insert failed:', dbError.message);
    } else {
      console.log('[pdfStorageUpload] DB record saved for', opts.rangeStart, '→', opts.rangeEnd);
    }
  } catch (err) {
    console.error('[pdfStorageUpload] Unexpected error:', err);
  }
}
