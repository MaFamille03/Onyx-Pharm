export type NavItem = {
  label: string;
  href: string;
  /** Étape (du plan de développement) à laquelle la page devient fonctionnelle */
  step: number;
};

export type NavSection = {
  label: string;
  /** Certaines entrées (Tableau de bord, Rapports...) n'ont pas de sous-menu */
  href?: string;
  step?: number;
  icon: string;
  children?: NavItem[];
};

// Reprend exactement la structure définie en section 5 du cahier des charges.
export const NAVIGATION: NavSection[] = [
  {
    label: "Tableau de bord",
    href: "/tableau-de-bord",
    step: 10,
    icon: "layout-dashboard",
  },
  {
    label: "Stock",
    href: "/stock",
    step: 4,
    icon: "package",
  },
  {
    label: "Conteneurs",
    href: "/stock/conteneurs",
    step: 10,
    icon: "package",
  },
  {
    label: "Ventes",
    icon: "shopping-cart",
    children: [
      { label: "Ventes", href: "/ventes/ventes", step: 7 },
      { label: "Paiements", href: "/ventes/paiements", step: 7 },
      { label: "Retours", href: "/ventes/retours", step: 7 },
    ],
  },
  {
    label: "Caisse",
    href: "/caisse/solde",
    step: 8,
    icon: "wallet",
  },
  {
    label: "Tiers",
    icon: "users",
    children: [
      { label: "Annuaire", href: "/tiers/annuaire", step: 3 },
      { label: "Dettes fournisseurs", href: "/tiers/dettes", step: 10 },
    ],
  },
  {
    label: "Rapports",
    href: "/rapports",
    step: 10,
    icon: "bar-chart-3",
  },
  {
    label: "Import / Export",
    href: "/import-export",
    step: 10,
    icon: "file-spreadsheet",
  },
  {
    label: "Utilisateurs",
    href: "/utilisateurs",
    step: 1,
    icon: "user-cog",
  },
  {
    label: "Historique",
    href: "/historique",
    step: 9,
    icon: "history",
  },
  {
    label: "Paramètres",
    href: "/parametres",
    step: 3,
    icon: "settings",
  },
];
