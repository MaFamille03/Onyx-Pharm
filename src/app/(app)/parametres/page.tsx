"use client";

import { useState } from "react";
import {
  Building2,
  MapPin,
  Tag,
  ListChecks,
  Warehouse,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { GeneralSection } from "@/components/parametres/GeneralSection";
import { EmplacementsSection } from "@/components/parametres/EmplacementsSection";
import { CategoriesSection } from "@/components/parametres/CategoriesSection";
import { OptionsSection } from "@/components/parametres/OptionsSection";
import { EntrepotSection } from "@/components/parametres/EntrepotSection";
import { SecuriteSection } from "@/components/parametres/SecuriteSection";
import { CompteSection } from "@/components/parametres/CompteSection";

const TABS = [
  { id: "general", label: "Général", icon: Building2 },
  { id: "emplacements", label: "Emplacements", icon: MapPin },
  { id: "categories", label: "Catégories", icon: Tag },
  { id: "listes", label: "Listes", icon: ListChecks },
  { id: "entrepot", label: "Entrepôt", icon: Warehouse },
  { id: "securite", label: "Sécurité", icon: ShieldCheck },
  { id: "compte", label: "Compte", icon: UserCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ParametresPage() {
  const [tab, setTab] = useState<TabId>("general");

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Paramètres
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Configurez l&apos;entreprise, le catalogue, le stock, la sécurité et
        votre compte.
      </p>

      <div className="mt-5 flex gap-1.5 overflow-x-auto rounded-lg bg-onyx-50 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-onyx-900 shadow-sm"
                : "text-onyx-500 hover:text-onyx-700"
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "general" && <GeneralSection />}
        {tab === "emplacements" && <EmplacementsSection />}
        {tab === "categories" && <CategoriesSection />}
        {tab === "listes" && <OptionsSection />}
        {tab === "entrepot" && <EntrepotSection />}
        {tab === "securite" && <SecuriteSection />}
        {tab === "compte" && <CompteSection />}
      </div>
    </div>
  );
}
