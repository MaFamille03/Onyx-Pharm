"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type EntrepriseInfo = {
  nom: string;
  activite?: string;
  telephone?: string;
  email?: string;
  logo_url?: string;
  adresse_postale?: string;
  adresse_physique?: string;
  fax?: string;
};

export function useEntrepriseInfo() {
  const supabase = createClient();
  const [info, setInfo] = useState<EntrepriseInfo | null>(null);

  useEffect(() => {
    supabase
      .from("parametres_generaux")
      .select("valeur")
      .eq("cle", "entreprise_info")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.valeur) setInfo(data.valeur as unknown as EntrepriseInfo);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return info;
}

/** Nom affiché de l'utilisateur connecté, pour la mention "imprimé par"
 * en bas des documents PDF. */
export function useNomUtilisateurConnecte() {
  const supabase = createClient();
  const [nom, setNom] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("nom_complet")
        .eq("id", user.id)
        .maybeSingle();
      setNom(profile?.nom_complet || user.email || null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return nom;
}
