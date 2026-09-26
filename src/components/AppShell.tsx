"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { MobileDrawer } from "@/components/MobileDrawer";
import { BottomTabBar } from "@/components/BottomTabBar";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { CreationProfilObligatoire } from "@/components/onboarding/CreationProfilObligatoire";

export function AppShell({
  userEmail,
  presentationVue,
  nomComplet,
  children,
}: {
  userEmail: string | null;
  presentationVue: boolean;
  nomComplet: string | null;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [demoVue, setDemoVue] = useState(presentationVue);
  const [profilCree, setProfilCree] = useState(Boolean(nomComplet));
  const router = useRouter();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <Sidebar />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar userEmail={userEmail} onOpenMenu={() => setDrawerOpen(true)} />
        <main className="mobile-responsive min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      <BottomTabBar onOpenMenu={() => setDrawerOpen(true)} />

      {/* Bloquant : un nouveau compte doit voir la démo puis créer son
          profil avant de pouvoir utiliser l'application, quelle que
          soit la page visitée en premier. */}
      {!demoVue && <OnboardingTour onDone={() => setDemoVue(true)} />}
      {demoVue && !profilCree && (
        <CreationProfilObligatoire
          onDone={() => {
            setProfilCree(true);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
