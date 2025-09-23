import { supabase } from "@/lib/supabaseClient";

export type Med = { id: string; name: string; class?: string | null; is_active?: boolean | null };

export async function listMeds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_medications")
    .select("name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((d: any) => d.name);
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