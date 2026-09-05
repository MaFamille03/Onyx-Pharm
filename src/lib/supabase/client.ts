import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Ne fait jamais planter le build : sans ce garde-fou, Next.js échouerait
  // à générer toute page qui importe ce fichier dès que les variables
  // NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ne sont pas
  // définies (en local sans .env.local, ou sur Vercel avant configuration).
  // eslint-disable-next-line no-console
  console.warn(
    "Variables Supabase manquantes : vérifie ton fichier .env.local en local, " +
      "ou les Environment Variables du projet sur Vercel en production."
  );
}

export function createClient() {
  return createBrowserClient(
    supabaseUrl || "https://placeholder.supabase.co",
    supabaseAnonKey || "placeholder-anon-key"
  );
}
