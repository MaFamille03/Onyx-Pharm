"use client";

import { useEffect, useState } from "react";
import { Package, User, Truck, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { classerCorrespondances } from "@/lib/normaliser";
import { ArticleInfoPanel } from "@/components/articles/ArticleInfoPanel";
import { TiersInfoPanel } from "@/components/tiers/TiersInfoPanel";
import { VenteInfoPanel } from "@/components/ventes/VenteInfoPanel";

type TypeResultat = "article" | "client" | "fournisseur" | "vente";

type Resultat = {
  type: TypeResultat;
  id: string;
  label: string;
  sousLabel?: string;
};

const ICONES: Record<TypeResultat, typeof Package> = {
  article: Package,
  client: User,
  fournisseur: Truck,
  vente: ShoppingCart,
};

const LABELS: Record<TypeResultat, string> = {
  article: "Article",
  client: "Client",
  fournisseur: "Fournisseur",
  vente: "Vente",
};

/**
 * Recherche en direct par nom, à travers articles, clients, fournisseurs
 * et ventes (par référence). Purement consultatif : affiche un panneau
 * d'information complet dès qu'un seul résultat correspond, ou une
 * courte liste à choisir sinon. Aucune modification ni suppression
 * possible depuis ici.
 */
export function GlobalSearchPanel({ terme }: { terme: string }) {
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Resultat | null>(null);

  useEffect(() => {
    const requete = terme.trim();
    setSelection(null);
    if (requete.length < 2) {
      setResultats([]);
      return;
    }
    let annule = false;
    setLoading(true);
    const supabase = createClient();

    // Même logique de recherche souple que Stock > Articles & Stock :
    // on récupère des candidats puis on les classe avec classerCorrespondances.
    // La donnée enregistrée n'est jamais modifiée.
    const mots = requete
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase()
      .split(/\\s+/)
      .filter((m) => m.length >= 2)
      .sort((a, b) => b.length - a.length);

    const motCle = mots[0] ?? requete;
    const fragment = motCle.slice(0, Math.max(3, Math.min(5, motCle.length)));
    const motif = `%${fragment}%`;

    Promise.all([
      supabase
        .from("articles")
        .select("id, designation")
        .ilike("designation", motif)
        .limit(60),
      supabase
        .from("clients")
        .select("id, nom")
        .ilike("nom", motif)
        .limit(60),
      supabase
        .from("fournisseurs")
        .select("id, nom")
        .ilike("nom", motif)
        .limit(60),
      supabase
        .from("ventes")
        .select("id, reference, clients(nom)")
        .ilike("reference", motif)
        .limit(60),
    ]).then(([articlesRes, clientsRes, fournisseursRes, ventesRes]) => {
      if (annule) return;

      const articlesClasses = classerCorrespondances(
        requete,
        articlesRes.data ?? [],
        (a) => a.designation,
        0.35
      ).slice(0, 8);

      const clientsClasses = classerCorrespondances(
        requete,
        clientsRes.data ?? [],
        (c) => c.nom,
        0.35
      ).slice(0, 8);

      const fournisseursClasses = classerCorrespondances(
        requete,
        fournisseursRes.data ?? [],
        (f) => f.nom,
        0.35
      ).slice(0, 8);

      const ventesCandidates = (ventesRes.data ?? []).map((v) => ({
        ...v,
        _texteRecherche: `${v.reference} ${(v.clients as unknown as { nom: string } | null)?.nom ?? ""}`,
      }));

      const ventesClasses = classerCorrespondances(
        requete,
        ventesCandidates,
        (v) => v._texteRecherche,
        0.35
      ).slice(0, 8);

      const tous: Resultat[] = [
        ...articlesClasses.map((a) => ({
          type: "article" as const,
          id: a.id,
          label: a.designation,
        })),
        ...clientsClasses.map((c) => ({
          type: "client" as const,
          id: c.id,
          label: c.nom,
        })),
        ...fournisseursClasses.map((f) => ({
          type: "fournisseur" as const,
          id: f.id,
          label: f.nom,
        })),
        ...ventesClasses.map(
          (v) =>
            ({
              type: "vente" as const,
              id: v.id,
              label: v.reference,
              sousLabel: (v.clients as unknown as { nom: string } | null)?.nom,
            }) as Resultat
        ),
      ];

      setResultats(tous);
      setLoading(false);
    });

    return () => {
      annule = true;
    };
  }, [terme]);

  if (!terme.trim()) return null;

  const choix = selection ?? (resultats.length === 1 ? resultats[0] : null);

  if (choix) {
    if (choix.type === "article")
      return <ArticleInfoPanel designation="" id={choix.id} />;
    if (choix.type === "vente") return <VenteInfoPanel id={choix.id} />;
    return <TiersInfoPanel type={choix.type} id={choix.id} />;
  }

  return (
    <div className="mt-1.5 w-full rounded-xl border border-onyx-100 bg-white p-5 shadow-sm">
      {loading ? (
        <p className="text-sm text-onyx-400">Recherche...</p>
      ) : resultats.length === 0 ? (
        <p className="text-sm text-onyx-400">
          Aucun résultat pour &quot;{terme}&quot;.
        </p>
      ) : (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-onyx-400">
            {resultats.length} résultats — précisez :
          </p>
          <div className="space-y-1">
            {resultats.map((r) => {
              const Icone = ICONES[r.type];
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => setSelection(r)}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-onyx-50"
                >
                  <Icone size={15} className="shrink-0 text-onyx-400" />
                  <span className="text-onyx-700">{r.label}</span>
                  {r.sousLabel && (
                    <span className="text-xs text-onyx-400">— {r.sousLabel}</span>
                  )}
                  <span className="ml-auto text-[11px] text-onyx-300">
                    {LABELS[r.type]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
