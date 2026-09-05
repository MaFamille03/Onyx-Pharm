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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";

const MODULES = [
  {
    icon: LayoutDashboard,
    titre: "Tableau de bord",
    description: "Vue d'ensemble : chiffre d'affaires, stock, caisse.",
  },
  {
    icon: Package,
    titre: "Stock",
    description: "Articles, quantités par emplacement, transferts, inventaires.",
  },
  {
    icon: ShoppingCart,
    titre: "Ventes",
    description: "Ventes, paiements et retours clients.",
  },
  {
    icon: Truck,
    titre: "Conteneurs",
    description: "Entrées de marchandise par lot, avec leur propre suivi de paiement.",
  },
  {
    icon: Users,
    titre: "Tiers",
    description: "Clients et fournisseurs, avec le suivi des dettes fournisseurs.",
  },
  {
    icon: Wallet,
    titre: "Caisse",
    description: "Encaissements et décaissements, liés automatiquement.",
  },
  {
    icon: BarChart3,
    titre: "Rapports",
    description: "Statistiques et exports Excel par module.",
  },
  {
    icon: Settings,
    titre: "Paramètres",
    description: "Catégories, emplacements, sécurité, entreprise.",
  },
  {
    icon: History,
    titre: "Historique",
    description: "Traçabilité complète de toutes les opérations.",
  },
];

export function OnboardingTour({ onDone }: { onDone: () => void }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function handleCommencer() {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-onyx-950/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/onyx-pharm-icon.png"
            alt="ONYX PHARM"
            width={56}
            height={56}
            className="h-14 w-14 object-contain"
          />
          <h1 className="mt-3 text-xl font-semibold text-onyx-900 sm:text-2xl">
            Bienvenue dans ONYX PHARM
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-onyx-500">
            Voici un aperçu rapide des modules disponibles pour gérer le
            stock, les ventes, les achats et la caisse de l&apos;entreprise.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MODULES.map((m) => (
            <div
              key={m.titre}
              className="flex items-start gap-3 rounded-xl border border-onyx-100 bg-onyx-50/40 p-3.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-onyx-900 text-accent-400">
                <m.icon size={17} />
              </div>
              <div>
                <p className="text-sm font-medium text-onyx-800">
                  {m.titre}
                </p>
                <p className="mt-0.5 text-xs text-onyx-500">
                  {m.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 flex justify-center">
          <PrimaryButton onClick={handleCommencer} loading={saving} className="px-8">
            Commencer
            <ArrowRight size={16} />
          </PrimaryButton>
        </div>
        <p className="mt-3 text-center text-xs text-onyx-300">
          Vous pourrez revoir cette présentation depuis Paramètres à tout
          moment.
        </p>
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
