import { createClient } from "@/lib/supabase/server";
import { TableauDeBordManager } from "@/components/dashboard/TableauDeBordManager";

export default async function TableauDeBordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let nomUtilisateur: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("nom_complet")
      .eq("id", user.id)
      .maybeSingle();
    nomUtilisateur = profile?.nom_complet || user.email?.split("@")[0] || null;
  }

  return <TableauDeBordManager nomUtilisateur={nomUtilisateur} />;
}
