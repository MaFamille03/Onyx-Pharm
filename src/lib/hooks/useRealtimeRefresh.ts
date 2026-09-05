import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * S'abonne aux changements en temps réel (Supabase Realtime) d'une ou
 * plusieurs tables et déclenche `onChange` à chaque insertion, modification
 * ou suppression — pour que les actions d'un utilisateur se reflètent chez
 * tous les autres sans qu'ils aient besoin de recharger la page.
 */
export function useRealtimeRefresh(tables: string[], onChange: () => void) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`realtime:${tables.join(",")}`);

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => onChange()
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(",")]);
}
