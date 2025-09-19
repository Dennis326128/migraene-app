import { supabase } from "@/lib/supabaseClient";

export async function ensureUserProfile() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;

  const { data: existing } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (!existing) {
    await supabase.from("user_profiles").insert({ user_id: uid }).then(() => {}).catch(() => {});
  }
}
