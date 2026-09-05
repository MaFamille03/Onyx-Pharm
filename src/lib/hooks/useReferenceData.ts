"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type RefCategorie = { id: string; nom: string; actif: boolean };
export type RefSousCategorie = {
  id: string;
  categorie_id: string;
  nom: string;
  actif: boolean;
};
export type RefFournisseur = { id: string; nom: string; actif: boolean };
export type RefEmplacement = { id: string; nom: string; actif: boolean };
export type RefOption = { valeur: string; ordre: number; actif: boolean };

export function useReferenceData() {
  const supabase = createClient();
  const [categories, setCategories] = useState<RefCategorie[]>([]);
  const [sousCategories, setSousCategories] = useState<RefSousCategorie[]>([]);
  const [fournisseurs, setFournisseurs] = useState<RefFournisseur[]>([]);
  const [emplacements, setEmplacements] = useState<RefEmplacement[]>([]);
  const [statutsArticle, setStatutsArticle] = useState<RefOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [catRes, sousCatRes, fourRes, emplRes, optRes] = await Promise.all([
      supabase.from("categories").select("id, nom, actif").order("nom"),
      supabase
        .from("sous_categories")
        .select("id, categorie_id, nom, actif")
        .order("nom"),
      supabase
        .from("fournisseurs")
        .select("id, nom, actif:statut")
        .order("nom"),
      supabase.from("emplacements").select("id, nom, actif").order("nom"),
      supabase
        .from("parametres_options")
        .select("valeur, ordre, actif")
        .eq("groupe", "statut_article")
        .order("ordre"),
    ]);

    if (catRes.data) setCategories(catRes.data as RefCategorie[]);
    if (sousCatRes.data) setSousCategories(sousCatRes.data as RefSousCategorie[]);
    if (fourRes.data) {
      // "actif" pour un fournisseur vient de son champ statut ('Actif'/'Inactif')
      setFournisseurs(
        (fourRes.data as { id: string; nom: string; actif: string }[]).map(
          (f) => ({ id: f.id, nom: f.nom, actif: f.actif === "Actif" })
        )
      );
    }
    if (emplRes.data) setEmplacements(emplRes.data as RefEmplacement[]);
    if (optRes.data) setStatutsArticle(optRes.data as RefOption[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    categories,
    sousCategories,
    fournisseurs,
    emplacements,
    statutsArticle,
    loading,
    reload: load,
  };
}
