"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { TiersManager } from "@/components/tiers/TiersManager";
import { SecondaryButton } from "@/components/ui/Buttons";
import { ImportTiersSection } from "@/components/import-export/ImportTiersSection";

export function TiersUnifieManager() {
  const [type, setType] = useState<"clients" | "fournisseurs">("clients");
  const [importOuvert, setImportOuvert] = useState(false);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <SecondaryButton
          onClick={() => setImportOuvert((v) => !v)}
          className="min-h-0 px-3 py-1.5 text-xs"
        >
          <FileSpreadsheet size={14} />
          Importer une liste
        </SecondaryButton>
      </div>

      {importOuvert && (
        <div className="mb-5">
          <ImportTiersSection />
        </div>
      )}

      <div className="mb-5 flex gap-1.5 rounded-lg bg-onyx-50 p-1">
        <button
          onClick={() => setType("clients")}
          className={`flex-1 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            type === "clients"
              ? "bg-white text-onyx-900 shadow-sm"
              : "text-onyx-500 hover:text-onyx-700"
          }`}
        >
          Clients
        </button>
        <button
          onClick={() => setType("fournisseurs")}
          className={`flex-1 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            type === "fournisseurs"
              ? "bg-white text-onyx-900 shadow-sm"
              : "text-onyx-500 hover:text-onyx-700"
          }`}
        >
          Fournisseurs
        </button>
      </div>

      {type === "clients" ? (
        <TiersManager
          table="clients"
          titreSingulier="client"
          titrePluriel="Clients"
          description="Vos clients particuliers et professionnels."
        />
      ) : (
        <TiersManager
          table="fournisseurs"
          titreSingulier="fournisseur"
          titrePluriel="Fournisseurs"
          description="Vos fournisseurs de marchandises et services."
        />
      )}
    </div>
  );
}
