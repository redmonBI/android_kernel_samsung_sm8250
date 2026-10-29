import Link from "next/link";
import { getDb } from "@/lib/db";
import { won } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  const bad = Boolean(error);
  return (
    <p role="status" className={`border px-3 py-2 text-sm ${bad ? "border-red-700 text-red-800" : "border-emerald-700 text-emerald-900"}`}>
      {error || ok}
    </p>
  );
}

export function EmptyState({ title, body, href, label }: { title: string; body: string; href?: string; label?: string }) {
  return (
    <div className="border border-line bg-soft px-6 py-16 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-mute">{body}</p>
      {href && label ? (
        <Link href={href} className="mt-6 inline-block border border-filament px-4 py-2 text-sm text-filament">
          {label}
        </Link>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-page grid-cols-2 gap-4 px-5 py-8 md:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="animate-pulse border border-line">
          <div className="aspect-[4/5] bg-soft" />
          <div className="h-14 bg-white" />
        </div>
      ))}
    </div>
  );
}

export function PriceDisplay({ amount, label = "판매가" }: { amount: number | null; label?: string }) {
  return (
    <p className="text-sm">
      <span className="text-mute">{label} </span>
      <span className="font-medium">{amount === null ? "미정" : won(amount)}</span>
    </p>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "판매가능" || value === "정상"
      ? "border-emerald-700 text-emerald-900"
      : value === "검토" || value === "예약중" || value === "출고예정"
        ? "border-amber-600 text-amber-900"
        : value === "하자" || value === "사용불가" || value === "오류"
          ? "border-red-700 text-red-800"
          : "border-neutral-400 text-neutral-600";
  return (
    <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] leading-4 ${tone}`}>
      <span aria-hidden>•</span>
      {value}
    </span>
  );
}

export function GradeBadge({ grade }: { grade: string }) {
  return <span className="inline-flex border border-ink px-1.5 py-0.5 text-[11px] tracking-wide">등급 {grade}</span>;
}

export function PromotionBadge() {
  return <span className="inline-flex border border-filament px-1.5 py-0.5 text-[11px] text-filament">프로모션</span>;
}

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="경로" className="text-xs tracking-wide text-mute">
      <ol className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex gap-2">
            {index > 0 ? <span aria-hidden>/</span> : null}
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span className="text-ink">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function BrandHero({
  eyebrow,
  title,
  body,
  image,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  image?: string;
  compact?: boolean;
}) {
  return (
    <section className={`relative overflow-hidden bg-hero text-white ${compact ? "min-h-[320px]" : "min-h-[520px]"}`}>
      {image ? <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" /> : null}
      <div className="absolute inset-0 bg-gradient-to-r from-hero via-hero/85 to-hero/30" />
      <div className="relative mx-auto flex w-full max-w-page flex-col justify-end px-5 py-12" style={{ minHeight: compact ? 320 : 520 }}>
        <p className="text-xs tracking-[0.22em] text-white/80">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-medium leading-tight md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">{body}</p>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const settings = getSettings(getDb());
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-5 py-10 md:flex-row md:justify-between">
        <div>
          <p className="text-lg tracking-[0.16em]">영진이엘</p>
          <p className="mt-3 text-sm text-ink">{settings.company_name} · 대표 {settings.ceo}</p>
          <p className="text-sm text-mute">{settings.address}</p>
          <a href="/company" className="mt-2 inline-block text-sm text-[#0056B8]">회사 소개</a>
        </div>
        <div className="text-sm leading-7 text-ink">
          <p>T {settings.phone}</p>
          <p>F {settings.fax}</p>
          <p>E {settings.email}</p>
          <p className="text-mute">필라멘트 {settings.filament_email}</p>
        </div>
      </div>
    </footer>
  );
}

export function SampleBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="bg-amber-50 px-5 py-2 text-center text-sm text-amber-950">
      수량과 가격 {count}건은 화면 검토용 예시입니다. 실제 재고는 업데이트 센터에서 엑셀을 승인한 뒤에 바뀌며, 예시 금액으로 거래처에 제안하지 마세요.
    </p>
  );
}
