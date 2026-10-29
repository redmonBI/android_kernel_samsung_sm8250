import Link from "next/link";

const LINKS = [
  { href: "/company", label: "회사개요" },
  { href: "/company/history", label: "연혁" },
  { href: "/company/business", label: "사업" },
  { href: "/company/network", label: "시설·조직" },
];

export function CompanyNav({ current }: { current: string }) {
  return (
    <nav aria-label="회사 소개" className="flex gap-2 overflow-x-auto border-b border-line">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={current === link.href ? "page" : undefined}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm tracking-wide ${current === link.href ? "border-filament text-filament" : "border-transparent text-ink"}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
