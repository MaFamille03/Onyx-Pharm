"use client";

import { useState } from "react";
import Image from "next/image";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  BarChart3,
  Settings,
  History,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";

const ETAPES = [
  {
    icon: LayoutDashboard,
    titre: "Tableau de bord",
    description:
      "Votre page d'accueil : chiffre d'affaires, valeur du stock, créances, dettes, et les alertes de stock faible — tout en un coup d'œil.",
  },
  {
    icon: Package,
    titre: "Stock",
    description:
      "Vos articles et leurs quantités par emplacement, les inventaires physiques, et l'historique de tous les mouvements.",
  },
  {
    icon: Truck,
    titre: "Commandes",
    description:
      "Chaque arrivage de marchandise se déclare ici, avec son fournisseur, sa date et son coût — le point de départ de tout votre stock.",
  },
  {
    icon: ShoppingCart,
    titre: "Ventes",
    description:
      "Enregistrez vos ventes, suivez les paiements reçus, et gérez les retours clients.",
  },
  {
    icon: Users,
    titre: "Tiers",
    description:
      "Votre carnet de clients et fournisseurs, avec le suivi de ce qu'ils vous doivent et de ce que vous devez.",
  },
  {
    icon: Wallet,
    titre: "Caisse",
    description:
      "Votre livre de caisse : chaque encaissement et décaissement, avec le solde qui se met à jour automatiquement.",
  },
  {
    icon: BarChart3,
    titre: "Rapports",
    description:
      "Des statistiques prêtes à l'emploi, exportables en Excel, pour suivre l'activité sur la période de votre choix.",
  },
  {
    icon: History,
    titre: "Historique",
    description:
      "La trace de chaque action importante : qui a fait quoi, et quand — pour garder une entreprise transparente.",
  },
  {
    icon: Settings,
    titre: "Paramètres",
    description:
      "Vos emplacements, catégories, informations d'entreprise, et votre code PIN de sécurité se configurent ici.",
  },
];

export function OnboardingTour({ onDone }: { onDone: () => void }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [etape, setEtape] = useState(0); // 0 = accueil, 1..N = modules, N+1 = fin
  const total = ETAPES.length;

  async function handleTerminer() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ presentation_vue: true })
        .eq("id", user.id);
    }
    setSaving(false);
    onDone();
  }

  const surAccueil = etape === 0;
  const surFin = etape === total + 1;
  const moduleActuel = !surAccueil && !surFin ? ETAPES[etape - 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-onyx-950/70 p-4">
      <div className="flex h-[520px] w-full max-w-lg flex-col rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {surAccueil && (
            <>
              <Image
                src="/onyx-pharm-icon.png"
                alt="ONYX PHARM"
                width={64}
                height={64}
                className="h-16 w-16 object-contain"
              />
              <h1 className="mt-4 text-xl font-semibold text-onyx-900 sm:text-2xl">
                Bienvenue dans ONYX PHARM
              </h1>
              <p className="mt-2 max-w-sm text-sm text-onyx-500">
                Avant de commencer, une courte visite guidée des{" "}
                {total} modules de l&apos;application — moins de deux minutes.
              </p>
            </>
          )}

          {moduleActuel && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-onyx-900 text-accent-400">
                <moduleActuel.icon size={28} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-onyx-900">
                {moduleActuel.titre}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-onyx-500">
                {moduleActuel.description}
              </p>
            </>
          )}

          {surFin && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <ArrowRight size={28} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-onyx-900">
                Vous êtes prêt !
              </h2>
              <p className="mt-2 max-w-sm text-sm text-onyx-500">
                Dernière étape : donnez-nous votre nom pour personnaliser
                votre espace, et c&apos;est parti.
              </p>
            </>
          )}
        </div>

        {/* Points de progression */}
        {!surFin && (
          <div className="mb-4 flex justify-center gap-1.5">
            {Array.from({ length: total + 1 }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === etape ? "w-5 bg-onyx-900" : "w-1.5 bg-onyx-200"
                }`}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          {!surAccueil && !surFin && (
            <SecondaryButton onClick={() => setEtape((e) => e - 1)} className="flex-1">
              <ArrowLeft size={16} />
              Précédent
            </SecondaryButton>
          )}
          {!surFin ? (
            <PrimaryButton onClick={() => setEtape((e) => e + 1)} className="flex-1">
              {surAccueil ? "Commencer la visite" : "Suivant"}
              <ArrowRight size={16} />
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={handleTerminer} loading={saving} className="flex-1">
              Continuer
              <ArrowRight size={16} />
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}

// Bouton autonome pour "Revoir la présentation" depuis Paramètres.
export function RevoirPresentationButton() {
  const [show, setShow] = useState(false);

  return (
    <>
      <SecondaryButton onClick={() => setShow(true)} className="px-3 py-1.5 text-xs">
        Revoir la présentation
      </SecondaryButton>
      {show && <OnboardingTour onDone={() => setShow(false)} />}
    </>
  );
}
