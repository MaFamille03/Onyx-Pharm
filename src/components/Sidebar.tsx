"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NAVIGATION } from "@/config/navigation";
import { NavIcon } from "@/components/NavIcon";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-onyx-100 bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-onyx-100 px-4">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAVIGATION.map((section) => (
          <SidebarSection
            key={section.label}
            section={section}
            pathname={pathname}
          />
        ))}
      </nav>
      <SidebarFooter />
    </aside>
  );
}

function SidebarFooter() {
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("parametres_generaux")
      .select("valeur")
      .eq("cle", "date_conception_site")
      .maybeSingle()
      .then(({ data }) => {
        if (typeof data?.valeur === "string" && data.valeur) setDate(data.valeur);
      });
  }, []);

  if (!date) return null;

  return (
    <div className="border-t border-onyx-100 px-4 py-3">
      <p className="text-[11px] text-onyx-300">
        Site conçu le{" "}
        {new Date(date).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

function SidebarSection({
  section,
  pathname,
}: {
  section: (typeof NAVIGATION)[number];
  pathname: string;
}) {
  const hasChildren = !!section.children?.length;
  const isChildActive = section.children?.some((c) =>
    pathname.startsWith(c.href)
  );
  const [open, setOpen] = useState(Boolean(isChildActive));

  if (!hasChildren && section.href) {
    const active = pathname.startsWith(section.href);
    return (
      <Link
        href={section.href}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          active
            ? "bg-onyx-900 text-white"
            : "text-onyx-600 hover:bg-onyx-50 hover:text-onyx-900"
        }`}
      >
        <NavIcon name={section.icon} size={18} strokeWidth={2} />
        {section.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isChildActive
            ? "text-onyx-900"
            : "text-onyx-600 hover:bg-onyx-50 hover:text-onyx-900"
        }`}
      >
        <span className="flex items-center gap-3">
          <NavIcon name={section.icon} size={18} strokeWidth={2} />
          {section.label}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-onyx-100 pl-4">
          {section.children!.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent-50 font-medium text-accent-700"
                    : "text-onyx-500 hover:bg-onyx-50 hover:text-onyx-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
