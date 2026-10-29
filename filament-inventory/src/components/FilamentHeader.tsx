"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/actions";

export type NavItem = { href: string; label: string };

function isCurrent(pathname: string, href: string) {
  if (href === "/" || href === "/app") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FilamentHeader({
  items,
  userName,
  dark = false,
  homeHref = "/",
  brand = "filament",
  withSwitcher = false,
}: {
  items: NavItem[];
  userName?: string | null;
  dark?: boolean;
  homeHref?: string;
  brand?: "filament" | "youngjin";
  withSwitcher?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  const accent = brand === "youngjin" ? "border-[#0056B8] text-[#0056B8]" : "border-filament text-filament";

  return (
    <header className={`sticky z-30 border-b ${withSwitcher ? "top-10" : "top-0"} ${dark ? "border-white/15 bg-hero text-white" : "border-line bg-white text-ink"}`}>
      <div className="mx-auto flex h-[86px] w-full max-w-page items-center gap-6 px-5">
        <Link href={userName ? "/app" : homeHref} className="shrink-0">
          {brand === "youngjin" ? (
            <span className="text-[18px] font-medium tracking-[0.22em]">영진이엘</span>
          ) : (
            <img
              src={dark ? "/brand/logo-dark.png" : "/brand/logo-light.png"}
              alt="필라멘트코리아"
              className="h-9 w-auto"
            />
          )}
        </Link>
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="주요">
          {items.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`px-3 py-2 text-[13px] font-medium tracking-[0.14em] ${
                  current ? `border-b-2 ${accent}` : dark ? "text-white" : "text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {userName ? (
            <form action={logout}>
              <button type="submit" className="px-3 py-2 text-[13px] tracking-[0.08em] text-mute">
                로그아웃
              </button>
            </form>
          ) : (
            <Link href="/login" className="px-3 py-2 text-[13px] font-medium tracking-[0.14em]">
              사내
            </Link>
          )}
        </nav>
        <button
          type="button"
          className="ml-auto border border-current px-3 py-2 text-sm lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          메뉴
        </button>
      </div>
      {open ? (
        <nav id="mobile-nav" className={`border-t px-5 py-3 lg:hidden ${dark ? "border-white/15 bg-hero" : "border-line bg-white"}`} aria-label="모바일">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="block py-3 text-sm tracking-[0.12em]">
              {item.label}
            </Link>
          ))}
          {userName ? (
            <form action={logout}>
              <button type="submit" className="py-3 text-sm">
                로그아웃 ({userName})
              </button>
            </form>
          ) : (
            <Link href="/login" className="block py-3 text-sm tracking-[0.12em]">
              사내 로그인
            </Link>
          )}
        </nav>
      ) : null}
    </header>
  );
}
