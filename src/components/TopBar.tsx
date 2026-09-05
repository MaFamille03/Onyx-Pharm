"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search, LogOut, ChevronDown, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function TopBar({
  userEmail,
  onOpenMenu,
}: {
  userEmail: string | null;
  onOpenMenu: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-onyx-100 bg-white/95 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-onyx-600 active:bg-onyx-50 lg:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu size={22} />
      </button>

      <div className="relative hidden flex-1 max-w-md sm:block">
        <Search
          size={17}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onyx-300"
        />
        <input
          type="search"
          placeholder="Rechercher un article, un client, une vente..."
          className="w-full rounded-lg border border-onyx-100 bg-onyx-50/50 py-2 pl-9 pr-3 text-sm text-onyx-700 outline-none placeholder:text-onyx-300 focus:border-accent-400 focus:bg-white focus:ring-2 focus:ring-accent-100"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2.5 hover:bg-onyx-50"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-onyx-900 text-white">
              <User size={16} />
            </div>
            <span className="hidden max-w-[140px] truncate text-sm font-medium text-onyx-700 sm:block">
              {userEmail ?? "Utilisateur"}
            </span>
            <ChevronDown size={15} className="hidden text-onyx-400 sm:block" />
          </button>

          {menuOpen && (
            <>
              <button
                className="fixed inset-0 z-30 cursor-default"
                aria-label="Fermer"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-onyx-100 bg-white shadow-lg">
                <div className="border-b border-onyx-100 px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-onyx-800">
                    {userEmail ?? "Utilisateur"}
                  </p>
                  <p className="text-xs text-onyx-400">Compte connecté</p>
                </div>
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-onyx-600 hover:bg-onyx-50 disabled:opacity-60"
                >
                  <LogOut size={16} />
                  {loggingOut ? "Déconnexion..." : "Se déconnecter"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
