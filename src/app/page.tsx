import { redirect } from "next/navigation";

export default function RootPage() {
  // Le middleware a déjà redirigé les utilisateurs non connectés vers
  // /connexion avant d'atteindre cette page : on est donc forcément
  // authentifié ici.
  redirect("/tableau-de-bord");
}
