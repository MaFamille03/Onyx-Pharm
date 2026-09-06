"use client";

import { useEffect, useState } from "react";
import { User, Truck, Phone, Mail, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatutBadge } from "@/components/ui/Badges";

type DetailTiers = {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  statut: string;
  observations: string | null;
};

export function TiersInfoPanel({
  type,
  id,
}: {
  type: "client" | "fournisseur";
  id: string;
}) {
  const [tiers, setTiers] = useState<DetailTiers | null>(null);
  const [montant, setMontant] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    setLoading(true);
    const supabase = createClient();
    const table = type === "client" ? "clients" : "fournisseurs";

    Promise.all([
      supabase
        .from(table)
        .select("id, nom, telephone, email, adresse, statut, observations")
        .eq("id", id)
        .maybeSingle(),
      type === "client"
        ? supabase
            .from("v_creances_clients")
            .select("creance")
            .eq("client_id", id)
        : supabase
            .from("v_dettes_conteneurs")
            .select("dette")
            .eq("fournisseur_id", id),
    ]).then(([tiersRes, montantRes]) => {
      if (annule) return;
      setTiers(tiersRes.data as unknown as DetailTiers | null);
      const total = (montantRes.data ?? []).reduce(
        (s: number, l: { creance?: number; dette?: number }) =>
          s + (l.creance ?? l.dette ?? 0),
        0
      );
      setMontant(total);
      setLoading(false);
    });

    return () => {
      annule = true;
    };
  }, [type, id]);

  const Icone = type === "client" ? User : Truck;

  return (
    <div className="mt-1.5 w-full rounded-xl border border-onyx-100 bg-white p-5 shadow-sm">
      {loading ? (
        <p className="text-sm text-onyx-400">Chargement...</p>
      ) : !tiers ? (
        <p className="text-sm text-onyx-400">Introuvable.</p>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icone size={17} className="text-onyx-400" />
              <h3 className="text-base font-semibold text-onyx-900">
                {tiers.nom}
              </h3>
            </div>
            <StatutBadge statut={tiers.statut} />
          </div>

          <div className="mt-3 space-y-1.5 text-sm text-onyx-600">
            {tiers.telephone && (
              <p className="flex items-center gap-2">
                <Phone size={14} className="text-onyx-400" /> {tiers.telephone}
              </p>
            )}
            {tiers.email && (
              <p className="flex items-center gap-2">
                <Mail size={14} className="text-onyx-400" /> {tiers.email}
              </p>
            )}
            {tiers.adresse && (
              <p className="flex items-center gap-2">
                <MapPin size={14} className="text-onyx-400" /> {tiers.adresse}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2">
            <div className="rounded-lg bg-onyx-50 p-3 text-center">
              <p
                className={`text-lg font-semibold ${
                  montant > 0 ? "text-red-500" : "text-onyx-900"
                }`}
              >
                {montant.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">
                {type === "client" ? "Créance (nous doit)" : "Dette (nous devons)"}
              </p>
            </div>
          </div>

          {tiers.observations && (
            <p className="mt-3 text-xs text-onyx-400">{tiers.observations}</p>
          )}
        </div>
      )}
    </div>
  );
}
