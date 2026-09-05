import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Journalise le détail technique d'une erreur Supabase (code, message,
 * table, opération) dans la console — utile en développement et dans les
 * logs Vercel — puis renvoie un message compréhensible à afficher à
 * l'utilisateur.
 *
 * Important : quand l'erreur vient d'un `raise exception` écrit à la main
 * dans une fonction PostgreSQL du projet (code Postgres "P0001"), son
 * message est déjà une phrase française rédigée pour être lue par
 * l'utilisateur (ex. "Stock insuffisant...", "Code PIN incorrect.") — on
 * l'affiche donc telle quelle plutôt que de la remplacer par un message
 * générique qui cacherait la vraie raison du refus.
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

  if (error && "code" in error) {
    if (error.code === "42501") {
      return "Accès refusé par la base de données (permissions). Contactez un administrateur si le problème persiste.";
    }
    // Message métier volontairement écrit pour l'utilisateur (raise
    // exception dans une fonction du projet) : on l'affiche directement.
    if (error.code === "P0001" && error.message) {
      return error.message;
    }
  }

  return messageUtilisateur;
}
