import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
  Users,
  BarChart3,
  FileSpreadsheet,
  UserCog,
  History,
  Settings,
  type LucideProps,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  "layout-dashboard": LayoutDashboard,
  package: Package,
  "shopping-cart": ShoppingCart,
  truck: Truck,
  wallet: Wallet,
  users: Users,
  "bar-chart-3": BarChart3,
  "file-spreadsheet": FileSpreadsheet,
  "user-cog": UserCog,
  history: History,
  settings: Settings,
};

export function NavIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? Package;
  return <Icon {...props} />;
}
