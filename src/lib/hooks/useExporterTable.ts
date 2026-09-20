"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { exporterExcelMisEnForme } from "@/lib/excel";

export function useExporterTable() {
  const supabase = createClient();
  const [exportingType, setExportingType] = useState<string | null>(null);

  async function exporterTable(
    type: string,
    nomAffiche: string,
    table: string,
    select: string,
    mapper: (row: Record<string, unknown>) => Record<string, unknown>,
    champTotal?: string
  ) {
    setExportingType(type);
    const { data } = await supabase.from(table).select(select);
    if (data) {
      const lignesExport = (data as unknown as Record<string, unknown>[]).map(mapper);
      if (champTotal && lignesExport.length > 0) {
        const total = lignesExport.reduce(
          (s, l) => s + (Number(l[champTotal]) || 0),
          0
        );
        const ligneTotal: Record<string, unknown> = {};
        for (const cle of Object.keys(lignesExport[0])) ligneTotal[cle] = "";
        ligneTotal[Object.keys(lignesExport[0])[0]] = "TOTAL";
        ligneTotal[champTotal] = total;
        lignesExport.push(ligneTotal);
      }
      await exporterExcelMisEnForme(
        `Export_${nomAffiche.replace(/\s+/g, "_")}_Onyx_Pharm`,
        nomAffiche,
        lignesExport.length > 0 ? Object.keys(lignesExport[0]) : [],
        lignesExport
      );
    }
    setExportingType(null);
  }

  return { exportingType, exporterTable };
}
