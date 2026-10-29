"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function mode(pathname: string) {
  if (pathname.startsWith("/app")) return "staff";
  if (
    pathname.startsWith("/filament") ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/procurement") ||
    pathname.startsWith("/downloads")
  ) {
    return "filament";
  }
  return "youngjin";
}

export function SiteSwitcher() {
  const current = mode(usePathname());
  const item = (active: boolean) =>
    `flex h-10 items-center px-4 text-[13px] tracking-[0.12em] ${active ? "bg-white text-[#071833]" : "text-white/80 hover:text-white"}`;
  return (
    <div className="sticky top-0 z-40 border-b border-white/10 bg-[#071833] text-white">
      <div className="mx-auto flex h-10 w-full max-w-page items-stretch px-3">
        <nav aria-label="사이트 전환" className="flex">
          <Link href="/" className={item(current === "youngjin")} aria-current={current === "youngjin" ? "page" : undefined}>
            영진이엘
          </Link>
          <Link href="/filament" className={item(current === "filament")} aria-current={current === "filament" ? "page" : undefined}>
            필라멘트코리아
          </Link>
        </nav>
        <Link href="/app" className={`${item(current === "staff")} ml-auto`} aria-current={current === "staff" ? "page" : undefined}>
          사내 운영
        </Link>
      </div>
    </div>
  );
}
