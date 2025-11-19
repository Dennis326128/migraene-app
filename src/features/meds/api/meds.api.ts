import { supabase } from "@/lib/supabaseClient";

export type Med = { id: string; name: string; class?: string | null; is_active?: boolean | null };
export type RecentMed = Med & { use_count: number; last_used: string | null };

export async function listMeds(): Promise<Med[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_medications")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((d: any) => ({ id: d.id, name: d.name }));
}

export async function addMed(name: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  const trimmed = name.trim();
  if (!trimmed) return;
  const { error } = await supabase
    .from("user_medications")
    .insert({ user_id: user.id, name: trimmed });
  if (error) throw error;
}

export async function deleteMed(name: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  const { error } = await supabase
    .from("user_medications")
    .delete()
    .eq("user_id", user.id)
    .eq("name", name);
  if (error) throw error;
}

export async function listRecentMeds(limit: number = 5): Promise<RecentMed[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data, error } = await supabase.rpc('get_recent_medications', {
    p_user_id: user.id,
    p_limit: limit
  });
  
  if (error) throw error;
  return (data || []).map((d: any) => ({ 
    id: d.id, 
    name: d.name, 
    use_count: d.use_count || 0,
    last_used: d.last_used 
  }));
}