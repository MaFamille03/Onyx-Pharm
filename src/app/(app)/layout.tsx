import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le middleware protège déjà ces routes ; ce contrôle est une deuxième
  // ligne de défense côté serveur (défense en profondeur).
  if (!user) {
    redirect("/connexion");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nom_complet, compte_statut, presentation_vue")
    .eq("id", user.id)
    .maybeSingle();

  // Un compte désactivé ou supprimé ne doit plus pouvoir se connecter,
  // même si la session d'authentification est encore valide.
  if (profile?.compte_statut && profile.compte_statut !== "Actif") {
    await supabase.auth.signOut();
    redirect(
      profile.compte_statut === "Désactivé"
        ? "/connexion?erreur=compte_desactive"
        : "/connexion?erreur=compte_supprime"
    );
  }

  return (
    <AppShell userEmail={user.email ?? null} presentationVue={profile?.presentation_vue ?? true}>
      {children}
    </AppShell>
  );
}
