"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ArticleOption = { id: string; designation: string };

export function ArticleSelect({
  value,
  onChange,
  label = "Article",
}: {
  value: string;
  onChange: (articleId: string) => void;
  label?: string;
}) {
  const supabase = createClient();
  const [options, setOptions] = useState<ArticleOption[]>([]);

  useEffect(() => {
    supabase
      .from("articles")
      .select("id, designation")
      .eq("statut", "Actif")
      .order("designation")
      .then(({ data }) => {
        if (data) setOptions(data as ArticleOption[]);
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
        required
        className="w-full rounded-lg border border-onyx-200 bg-white px-3.5 py-2.5 text-[15px] text-onyx-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
      >
        <option value="">— Sélectionner un article —</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.designation}
          </option>
        ))}
      </select>
    </div>
  );
}
