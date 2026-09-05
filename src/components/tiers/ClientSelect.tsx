"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ClientOption = { id: string; nom: string };

export function ClientSelect({
  value,
  onChange,
  label = "Client",
  optionnel = true,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  optionnel?: boolean;
}) {
  const supabase = createClient();
  const [options, setOptions] = useState<ClientOption[]>([]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, nom")
      .eq("statut", "Actif")
      .order("nom")
      .then(({ data }) => {
        if (data) setOptions(data as ClientOption[]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-onyx-700">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={!optionnel}
        className="w-full rounded-lg border border-onyx-200 bg-white px-3.5 py-2.5 text-[15px] text-onyx-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
      >
        <option value="">
          {optionnel ? "— Client de passage —" : "— Sélectionner un client —"}
        </option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </select>
    </div>
  );
}
