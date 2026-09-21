import { createClient } from "@/lib/supabase/client";

/**
 * Retourne l'identifiant du conteneur technique "Stock Initial", en le
 * recréant automatiquement s'il n'existe plus (il est volontairement
 * supprimable, voir migration 0037) — via la fonction SQL dédiée, pour
 * ne jamais renvoyer null par erreur et bloquer silencieusement une
 * écriture de stock.
 */
export async function getStockInitialId(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_stock_initial_id");
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[ONYX PHARM] Erreur get_stock_initial_id", error);
    return null;
  }
  return data ?? null;
}
