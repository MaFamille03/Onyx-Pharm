import { createClient } from "@/lib/supabase/client";

/**
 * Retourne l'identifiant du conteneur technique "Stock Initial", utilisé
 * comme cible par défaut pour toute écriture de stock qui ne provient pas
 * (encore) d'un conteneur réel identifié. Le FIFO entre conteneurs sera
 * introduit à l'étape 3 ; en attendant, toutes les écritures manuelles ou
 * automatiques ciblent ce conteneur technique.
 */
export async function getStockInitialId(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data } = await supabase
    .from("conteneurs")
    .select("id")
    .eq("code", "STOCK-INITIAL")
    .maybeSingle();
  return data?.id ?? null;
}
