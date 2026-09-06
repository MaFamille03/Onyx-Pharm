"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  Search,
  LogOut,
  ChevronDown,
  User,
  Package,
  Users,
  Truck,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ResultatRecherche = {
  type: "article" | "client" | "fournisseur" | "conteneur" | "vente";
  id: string;
  label: string;
  sousLabel?: string;
};

const ICONES: Record<ResultatRecherche["type"], typeof Package> = {
  article: Package,
  client: Users,
  fournisseur: Truck,
  conteneur: Package,
  vente: ShoppingCart,
};

const LABELS: Record<ResultatRecherche["type"], string> = {
  article: "Articles",
  client: "Clients",
  fournisseur: "Fournisseurs",
  conteneur: "Conteneurs",
  vente: "Ventes",
};

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

  const [terme, setTerme] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [recherchant, setRechercharnt] = useState(false);
  const conteneurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clicExterieur = (e: MouseEvent) => {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target as Node)) {
        setRechercheOuverte(false);
      }
    };
    document.addEventListener("mousedown", clicExterieur);
    return () => document.removeEventListener("mousedown", clicExterieur);
  }, []);

  useEffect(() => {
    const requete = terme.trim();
    if (requete.length < 2) {
      setResultats([]);
      return;
    }
    const minuteur = setTimeout(async () => {
      setRechercharnt(true);
      const supabase = createClient();
      const motif = `%${requete}%`;

      const [articlesRes, clientsRes, fournisseursRes, conteneursRes, ventesRes] =
        await Promise.all([
          supabase
            .from("articles")
            .select("id, designation")
            .ilike("designation", motif)
            .limit(5),
          supabase.from("clients").select("id, nom").ilike("nom", motif).limit(5),
          supabase
            .from("fournisseurs")
            .select("id, nom")
            .ilike("nom", motif)
            .limit(5),
          supabase
            .from("conteneurs")
            .select("id, code")
            .ilike("code", motif)
            .limit(5),
          supabase
            .from("ventes")
            .select("id, reference, clients(nom)")
            .ilike("reference", motif)
            .limit(5),
        ]);

      const tous: ResultatRecherche[] = [
        ...(articlesRes.data ?? []).map((a) => ({
          type: "article" as const,
          id: a.id,
          label: a.designation,
        })),
        ...(clientsRes.data ?? []).map((c) => ({
          type: "client" as const,
          id: c.id,
          label: c.nom,
        })),
        ...(fournisseursRes.data ?? []).map((f) => ({
          type: "fournisseur" as const,
          id: f.id,
          label: f.nom,
        })),
        ...(conteneursRes.data ?? []).map((c) => ({
          type: "conteneur" as const,
          id: c.id,
          label: c.code,
        })),
        ...(ventesRes.data ?? []).map(
          (v) =>
            ({
              type: "vente" as const,
              id: v.id,
              label: v.reference,
              sousLabel: (v.clients as unknown as { nom: string } | null)?.nom,
            }) as ResultatRecherche
        ),
      ];

      setResultats(tous);
      setRechercharnt(false);
    }, 300);

    return () => clearTimeout(minuteur);
  }, [terme]);

  function ouvrirResultat(r: ResultatRecherche) {
    setRechercheOuverte(false);
    setTerme("");
    setResultats([]);
    switch (r.type) {
      case "article":
        router.push("/stock");
        break;
      case "client":
      case "fournisseur":
        router.push("/tiers/annuaire");
        break;
      case "conteneur":
        router.push(`/stock/conteneurs?ouvrir=${r.id}`);
        break;
      case "vente":
        router.push(`/ventes/ventes?ouvrir=${r.id}`);
        break;
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  const parType = resultats.reduce<Record<string, ResultatRecherche[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

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

      <div ref={conteneurRef} className="relative hidden flex-1 max-w-md sm:block">
        <Search
          size={17}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onyx-300"
        />
        <input
          type="search"
          value={terme}
          onChange={(e) => setTerme(e.target.value)}
          onFocus={() => setRechercheOuverte(true)}
          placeholder="Rechercher un article, un client, une vente..."
          className="w-full rounded-lg border border-onyx-100 bg-onyx-50/50 py-2 pl-9 pr-9 text-sm text-onyx-700 outline-none placeholder:text-onyx-300 focus:border-accent-400 focus:bg-white focus:ring-2 focus:ring-accent-100"
        />
        {recherchant && (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-onyx-300"
          />
        )}

        {rechercheOuverte && terme.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-96 overflow-y-auto rounded-lg border border-onyx-100 bg-white shadow-lg">
            {resultats.length === 0 ? (
              <p className="px-4 py-4 text-sm text-onyx-400">
                {recherchant ? "Recherche..." : "Aucun résultat."}
              </p>
            ) : (
              (Object.keys(parType) as ResultatRecherche["type"][]).map((type) => (
                <div key={type} className="border-b border-onyx-50 py-1.5 last:border-0">
                  <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-onyx-400">
                    {LABELS[type]}
                  </p>
                  {parType[type].map((r) => {
                    const Icone = ICONES[r.type];
                    return (
                      <button
                        key={`${r.type}-${r.id}`}
                        onClick={() => ouvrirResultat(r)}
                        className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-onyx-50"
                      >
                        <Icone size={15} className="shrink-0 text-onyx-400" />
                        <span className="truncate text-onyx-700">{r.label}</span>
                        {r.sousLabel && (
                          <span className="truncate text-xs text-onyx-400">
                            — {r.sousLabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}
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
