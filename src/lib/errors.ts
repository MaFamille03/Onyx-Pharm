import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Journalise le détail technique d'une erreur Supabase (code, message,
 * table, opération) dans la console — utile en développement et dans les
 * logs Vercel — puis renvoie un message compréhensible à afficher à
 * l'utilisateur, sans exposer d'information technique sensible.
 */
export function logSupabaseError(
  contexte: { table: string; operation: string },
  error: PostgrestError | Error | null,
  messageUtilisateur: string
): string {
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[ONYX PHARM] Erreur Supabase", {
      table: contexte.table,
      operation: contexte.operation,
      code: "code" in error ? error.code : undefined,
      message: error.message,
      details: "details" in error ? error.details : undefined,
      hint: "hint" in error ? error.hint : undefined,
    });
  }

  if (error && "code" in error && error.code === "42501") {
    return "Accès refusé par la base de données (permissions). Contactez un administrateur si le problème persiste.";
  }

  return messageUtilisateur;
}
