"use client";

import { useState } from "react";
import { ArrowLeftRight, AlertTriangle, Package2 } from "lucide-react";
import { ArticlesManager } from "@/components/articles/ArticlesManager";
import { StocksManager } from "@/components/stock/StocksManager";
import { InventairesManager } from "@/components/inventaires/InventairesManager";
import { MouvementModal } from "@/components/stock/MouvementModal";
import { AlerteModal } from "@/components/stock/AlerteModal";
import { NouveauConteneur } from "@/components/conteneurs/ConteneursManager";
import { SecondaryButton } from "@/components/ui/Buttons";

const ONGLETS = [
  { id: "articles", label: "Articles" },
  { id: "stock", label: "Stock" },
  { id: "inventaire", label: "Inventaire" },
] as const;

type OngletId = (typeof ONGLETS)[number]["id"];

export function StockUnifieManager() {
  const [onglet, setOnglet] = useState<OngletId>("articles");
  const [mouvementOuvert, setMouvementOuvert] = useState(false);
  const [alerteOuverte, setAlerteOuverte] = useState(false);
  const [conteneurOuvert, setConteneurOuvert] = useState(false);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
          Stock
        </h1>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => setMouvementOuvert(true)} className="shrink-0">
            <ArrowLeftRight size={15} />
            Mouvements
          </SecondaryButton>
          <SecondaryButton onClick={() => setAlerteOuverte(true)} className="shrink-0">
            <AlertTriangle size={15} />
            Alerte
          </SecondaryButton>
          <SecondaryButton onClick={() => setConteneurOuvert(true)} className="shrink-0">
            <Package2 size={15} />
            Conteneur
          </SecondaryButton>
        </div>
      </div>

      <div className="mt-5 flex gap-1.5 overflow-x-auto rounded-lg bg-onyx-50 p-1">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              onglet === o.id
                ? "bg-white text-onyx-900 shadow-sm"
                : "text-onyx-500 hover:text-onyx-700"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {onglet === "articles" && <ArticlesManager embarque />}
        {onglet === "stock" && <StocksManager embarque />}
        {onglet === "inventaire" && <InventairesManager embarque />}
      </div>

      {mouvementOuvert && (
        <MouvementModal onClose={() => setMouvementOuvert(false)} />
      )}
      {alerteOuverte && <AlerteModal onClose={() => setAlerteOuverte(false)} />}
      {conteneurOuvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-onyx-950/60 p-4">
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-xl sm:p-7">
            <NouveauConteneur onDone={() => setConteneurOuvert(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
