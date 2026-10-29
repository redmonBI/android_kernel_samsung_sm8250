import Link from "next/link";
import { ProductCatalogCard } from "@/components/ProductCatalogCard";
import { BrandHero } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { won } from "@/lib/format";
import { ageBucket } from "@/lib/inventory";
import { canSeeCost } from "@/lib/permissions";
import { dashboardTotals, listProducts } from "@/lib/queries";
import { publicSrc } from "@/lib/format";

export const metadata = { title: "재고 홈" };

export default async function DashboardPage() {
  const user = await requireUser();
  const db = getDb();
  const totals = dashboardTotals(db);
  const showCost = canSeeCost(user.role);
  const top = listProducts(db, { sort: "amount", pageSize: 5, page: 1 }).rows;
  const recent = listProducts(db, { sort: "newest", pageSize: 5, page: 1 }).rows;
  const promos = db.prepare("SELECT name, description, ends_on FROM promotions WHERE active = 1").all() as { name: string; description: string; ends_on: string }[];
  const mine = db
    .prepare(
      `SELECT id, kind, created_at FROM approval_requests
       WHERE status = 'pending' AND (requested_by = ? OR ? IN ('admin', 'approver'))
       ORDER BY created_at DESC LIMIT 6`,
    )
    .all(user.id, user.role) as { id: string; kind: string; created_at: string }[];
  const buckets = new Map<string, number>();
  for (const row of totals.ages) {
    const key = ageBucket(row.year);
    buckets.set(key, (buckets.get(key) ?? 0) + row.amount);
  }
  const cards = [
    ["이번 달 감소액", totals.reduction_amount],
    ["총 장기재고 금액", totals.total_amount],
    ["담당 미지정", totals.unassigned_amount],
    ["계획 미등록", totals.noplan_amount],
    ["출고 예정", totals.outbound_amount],
  ];

  return (
    <>
      <BrandHero
        compact
        eyebrow="INVENTORY"
        title="장기재고를 사진으로 고르고 바로 제안합니다"
        body="금액은 품목 합계와 같습니다. 예시 데이터가 남아 있으면 위 노란 줄을 먼저 확인하세요."
        image={publicSrc("/products/ULDL-335-A.jpg")}
      />
      <div className="mx-auto w-full max-w-page px-5 py-8">
        <div className="grid gap-3 md:grid-cols-5">
          {cards.map(([label, amount]) => (
            <article key={String(label)} className="border border-line px-3 py-4">
              <h2 className="text-xs text-mute">{label}</h2>
              <p className="mt-2 text-lg font-medium">{showCost ? won(Number(amount)) : "권한 필요"}</p>
            </article>
          ))}
        </div>
        <section className="mt-8">
          <h2 className="text-lg">연령 구간</h2>
          <ul className="mt-3 grid gap-2 md:grid-cols-4">
            {Array.from(buckets.entries()).map(([label, amount]) => (
              <li key={label} className="border border-line px-3 py-3 text-sm">
                <span>{label}</span>
                <span className="mt-1 block font-medium">{showCost ? won(amount) : "권한 필요"}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-8 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-lg">고액 재고</h2>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {top.map((product) => (
                <li key={product.id} className="flex items-center justify-between py-3 text-sm">
                  <Link href={`/app/products/${product.slug}`} className="font-medium tracking-wide">{product.code}</Link>
                  <span>{showCost ? won(product.stock_amount) : `가용 ${product.available_qty}`}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-lg">진행 중 프로모션</h2>
            <ul className="mt-3 space-y-3">
              {promos.map((promo) => (
                <li key={promo.name} className="border border-line px-3 py-3 text-sm">
                  <Link href="/app/promotions" className="font-medium">{promo.name}</Link>
                  <p className="text-mute">{promo.description} · {promo.ends_on}까지</p>
                </li>
              ))}
            </ul>
            <h2 className="mt-6 text-lg">내 승인·업무</h2>
            {mine.length === 0 ? <p className="mt-2 text-sm text-mute">대기 중인 업무가 없습니다.</p> : null}
            <ul className="mt-2 text-sm">
              {mine.map((item) => (
                <li key={item.id} className="border-b border-line py-2">
                  <Link href="/app/work">{item.kind} · {item.created_at.slice(0, 10)}</Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="mt-10">
          <h2 className="text-lg">최근 등록</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {recent.map((product) => (
              <ProductCatalogCard key={product.id} product={product} href={`/app/products/${product.slug}`} staff showCost={showCost} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
