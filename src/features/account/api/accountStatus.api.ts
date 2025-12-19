import { supabase } from "@/integrations/supabase/client";

export interface AccountStatus {
  status: 'active' | 'deactivated' | 'deletion_requested' | 'not_authenticated';
  deactivated_at: string | null;
  deletion_requested_at: string | null;
  deletion_scheduled_for: string | null;
}

export async function getAccountStatus(): Promise<AccountStatus> {
  const { data, error } = await supabase.rpc('get_account_status' as any);
  
  if (error) {
    console.error('[getAccountStatus] Error:', error);
    throw error;
  }
  
  return data as AccountStatus;
}

export async function deactivateAccount(): Promise<void> {
  const { error } = await supabase.rpc('deactivate_user_account' as any);
  
  if (error) {
    console.error('[deactivateAccount] Error:', error);
    throw error;
  }
  
  // Sign out after deactivation
  await supabase.auth.signOut();
}

export async function reactivateAccount(): Promise<void> {
  const { error } = await supabase.rpc('reactivate_user_account' as any);
  
  if (error) {
    console.error('[reactivateAccount] Error:', error);
    throw error;
  }
}

export async function requestAccountDeletion(): Promise<{ deletion_scheduled_for: string }> {
  const { data, error } = await supabase.rpc('request_account_deletion' as any);
  
  if (error) {
    console.error('[requestAccountDeletion] Error:', error);
    throw error;
  }
  
  // Sign out after deletion request
  await supabase.auth.signOut();
  
  return data as { success: boolean; deletion_scheduled_for: string };
}

export async function cancelAccountDeletion(): Promise<void> {
  const { error } = await supabase.rpc('cancel_account_deletion' as any);
  
  if (error) {
    console.error('[cancelAccountDeletion] Error:', error);
    throw error;
  }
}
