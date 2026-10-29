"use client";

import { usePathname } from "next/navigation";
import { FilamentHeader, type NavItem } from "./FilamentHeader";
import { SiteSwitcher } from "./SiteSwitcher";

const YOUNGJIN: NavItem[] = [
  { href: "/company", label: "회사소개" },
  { href: "/company/business", label: "사업" },
  { href: "/company/network", label: "시설" },
  { href: "/company/history", label: "연혁" },
  { href: "/filament", label: "필라멘트" },
  { href: "/contact", label: "문의" },
];

const FILAMENT: NavItem[] = [
  { href: "/products", label: "PRODUCTS" },
  { href: "/projects", label: "PROJECTS" },
  { href: "/procurement", label: "PROCUREMENT" },
  { href: "/downloads", label: "DOWNLOAD" },
  { href: "/contact", label: "CONTACT" },
];

function isFilament(pathname: string) {
  return ["/filament", "/products", "/projects", "/procurement", "/downloads"].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

export function PublicFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const filament = isFilament(pathname);
  return (
    <>
      <SiteSwitcher />
      <FilamentHeader
        items={filament ? FILAMENT : YOUNGJIN}
        homeHref={filament ? "/filament" : "/"}
        brand={filament ? "filament" : "youngjin"}
        withSwitcher
      />
      <main>{children}</main>
    </>
  );
}
