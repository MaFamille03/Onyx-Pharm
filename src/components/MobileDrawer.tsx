"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { NAVIGATION } from "@/config/navigation";
import { NavIcon } from "@/components/NavIcon";
import { Logo } from "@/components/Logo";

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="Fermer le menu"
        className="absolute inset-0 bg-onyx-950/50"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-white shadow-xl">
        <div className="flex h-16 items-center justify-between border-b border-onyx-100 px-4">
          <Logo />
          <button
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-onyx-500 active:bg-onyx-50"
          >
            <X size={22} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAVIGATION.map((section) => (
            <MobileSection
              key={section.label}
              section={section}
              pathname={pathname}
              onNavigate={onClose}
            />
          ))}
        </nav>
      </div>
    </div>
  );
}

function MobileSection({
  section,
  pathname,
  onNavigate,
}: {
  section: (typeof NAVIGATION)[number];
  pathname: string;
  onNavigate: () => void;
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
        onClick={onNavigate}
        className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium ${
          active ? "bg-onyx-900 text-white" : "text-onyx-700 active:bg-onyx-50"
        }`}
      >
        <NavIcon name={section.icon} size={19} strokeWidth={2} />
        {section.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-[15px] font-medium text-onyx-700 active:bg-onyx-50"
      >
        <span className="flex items-center gap-3">
          <NavIcon name={section.icon} size={19} strokeWidth={2} />
          {section.label}
        </span>
        <ChevronDown
          size={17}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="ml-4 space-y-0.5 border-l border-onyx-100 pl-4">
          {section.children!.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex min-h-[44px] items-center rounded-md px-3 text-[15px] ${
                  active
                    ? "bg-accent-50 font-medium text-accent-700"
                    : "text-onyx-500 active:bg-onyx-50"
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
