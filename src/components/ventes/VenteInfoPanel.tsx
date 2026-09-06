"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatutBadge } from "@/components/ui/Badges";

type DetailVente = {
  id: string;
  reference: string;
  date_vente: string;
  montant_total: number;
  montant_paye: number;
  statut: string;
  clients: { nom: string } | null;
};

export function VenteInfoPanel({ id }: { id: string }) {
  const [vente, setVente] = useState<DetailVente | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("ventes")
      .select(
        "id, reference, date_vente, montant_total, montant_paye, statut, clients(nom)"
      )
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!annule) {
          setVente(data as unknown as DetailVente | null);
          setLoading(false);
        }
      });
    return () => {
      annule = true;
    };
  }, [id]);

  const reste = vente ? vente.montant_total - vente.montant_paye : 0;

  return (
    <div className="mt-1.5 w-full rounded-xl border border-onyx-100 bg-white p-5 shadow-sm">
      {loading ? (
        <p className="text-sm text-onyx-400">Chargement...</p>
      ) : !vente ? (
        <p className="text-sm text-onyx-400">Introuvable.</p>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={17} className="text-onyx-400" />
              <h3 className="text-base font-semibold text-onyx-900">
                {vente.reference}
              </h3>
            </div>
            <StatutBadge statut={vente.statut} />
          </div>
          <p className="mt-0.5 text-sm text-onyx-500">
            {vente.clients?.nom || "Client de passage"} ·{" "}
            {new Date(vente.date_vente).toLocaleDateString("fr-FR")}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-onyx-50 p-3 text-center">
              <p className="text-lg font-semibold text-onyx-900">
                {vente.montant_total.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Total</p>
            </div>
            <div className="rounded-lg bg-onyx-50 p-3 text-center">
              <p className="text-lg font-semibold text-emerald-600">
                {vente.montant_paye.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Payé</p>
            </div>
            <div className="rounded-lg bg-onyx-50 p-3 text-center">
              <p
                className={`text-lg font-semibold ${
                  reste > 0 ? "text-red-500" : "text-onyx-400"
                }`}
              >
                {reste.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Reste</p>
            </div>
          </div>

          <a
            href={`/ventes/ventes?ouvrir=${vente.id}`}
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-onyx-200 py-2 text-sm font-medium text-onyx-700 hover:bg-onyx-50"
          >
            <ExternalLink size={14} />
            Ouvrir cette vente
          </a>
        </div>
      )}
    </div>
  );
}
