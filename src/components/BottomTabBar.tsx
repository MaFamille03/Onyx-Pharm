"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NavIcon } from "@/components/NavIcon";

const TABS = [
  { label: "Accueil", href: "/tableau-de-bord", icon: "layout-dashboard" },
  { label: "Stock", href: "/stock", icon: "package" },
  { label: "Ventes", href: "/ventes/ventes", icon: "shopping-cart" },
  { label: "Caisse", href: "/caisse/solde", icon: "wallet" },
];

export function BottomTabBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-onyx-100 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-1 flex-col items-center gap-1 py-2.5"
          >
            <NavIcon
              name={tab.icon}
              size={21}
              strokeWidth={2}
              className={active ? "text-accent-500" : "text-onyx-400"}
            />
            <span
              className={`text-[11px] font-medium ${
                active ? "text-accent-600" : "text-onyx-400"
              }`}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex flex-1 flex-col items-center gap-1 py-2.5"
      >
        <Menu size={21} strokeWidth={2} className="text-onyx-400" />
        <span className="text-[11px] font-medium text-onyx-400">Menu</span>
      </button>
    </nav>
  );
}
