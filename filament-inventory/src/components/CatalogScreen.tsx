import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { won } from "@/lib/format";
import { canSeeCost } from "@/lib/permissions";
import { listProducts, type CatalogFilters } from "@/lib/queries";
import type { CatalogSource } from "@/lib/serialize";
import { FilterDrawer } from "./FilterDrawer";
import { ProductCatalogCard } from "./ProductCatalogCard";
import { Breadcrumb, EmptyState, GradeBadge, StatusBadge } from "./ui";

function text(value: string | undefined) {
  return value?.trim() || undefined;
}

function filtersFrom(mode: "public" | "staff", raw: Record<string, string | undefined>): CatalogFilters {
  return {
    q: text(raw.q),
    category: text(raw.category),
    grade: text(raw.grade),
    physical: text(raw.physical),
    work: text(raw.work),
    department: text(raw.department),
    priority: text(raw.priority),
    year: text(raw.year),
    promo: raw.promo === "1",
    noimage: raw.noimage === "1",
    noowner: raw.noowner === "1",
    noplan: raw.noplan === "1",
    defect: raw.defect === "1",
    sort: text(raw.sort) || (mode === "staff" ? "amount" : "code"),
    page: Number(raw.page || 1) || 1,
    pageSize: 20,
    publishedOnly: mode === "public",
  };
}

function keep(raw: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const merged = { ...raw, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export async function CatalogScreen({
  mode,
  raw,
  selected,
}: {
  mode: "public" | "staff";
  raw: Record<string, string | undefined>;
  selected: Set<string>;
}) {
  const base = mode === "staff" ? "/app/catalog" : "/products";
  const filters = filtersFrom(mode, raw);
  const db = getDb();
  const user = mode === "staff" ? await getCurrentUser() : null;
  const result = listProducts(db, filters);
  const categories = db.prepare("SELECT id, slug, name FROM categories ORDER BY sort_order").all() as { id: string; slug: string; name: string }[];
  const departments = db.prepare("SELECT id, name FROM departments ORDER BY name").all() as { id: string; name: string }[];
  const showCost = user ? canSeeCost(user.role) : false;
  const view = raw.view === "table" ? "table" : "card";
  const back = `${base}${keep(raw, {}) ? `?${keep(raw, {})}` : ""}`;
  const pages = Math.max(1, Math.ceil(result.total / 20));

  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <Breadcrumb items={[{ href: mode === "staff" ? "/app" : "/", label: mode === "staff" ? "재고 홈" : "홈" }, { label: mode === "staff" ? "제품·재고" : "제품" }]} />
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        <Link href={base} className={`shrink-0 border px-3 py-2 text-sm ${raw.category ? "border-line" : "border-filament bg-filament text-white"}`}>전체</Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`${base}?${keep(raw, { category: category.slug, page: undefined })}`}
            className={`shrink-0 border px-3 py-2 text-sm ${raw.category === category.slug ? "border-filament bg-filament text-white" : "border-line bg-white"}`}
          >
            {category.name}
          </Link>
        ))}
      </div>
      <form className="mt-4 flex flex-wrap items-center gap-2" method="get" action={base}>
        <label className="sr-only" htmlFor="catalog-q">검색</label>
        <input id="catalog-q" name="q" defaultValue={raw.q ?? ""} placeholder="품목코드, 품명, 규격, 제조사" className="min-w-[220px] flex-1 border border-line px-3 py-2 text-sm" />
        {raw.category ? <input type="hidden" name="category" value={raw.category} /> : null}
        <label className="text-sm text-mute">정렬
          <select name="sort" defaultValue={filters.sort} className="ml-2 border border-line px-2 py-2 text-ink">
            <option value="amount">재고금액 높은 순</option>
            <option value="available">가용수량</option>
            <option value="code">품목코드</option>
            <option value="grade">등급</option>
            <option value="newest">최근 등록</option>
          </select>
        </label>
        <input type="hidden" name="view" value={view} />
        <button className="border border-ink px-3 py-2 text-sm" type="submit">검색</button>
        <FilterDrawer action={base} staff={mode === "staff"} categories={categories} departments={departments} values={raw as Record<string, string>} />
        <Link className="border border-line px-3 py-2 text-sm" href={`${base}?${keep(raw, { view: view === "card" ? "table" : "card", page: undefined })}`}>
          {view === "card" ? "표로 보기" : "카드로 보기"}
        </Link>
      </form>
      <p className="mt-4 text-sm text-mute">
        {result.total.toLocaleString("ko-KR")}개
        {mode === "staff" ? ` · 선택 ${selected.size}개` : ""}
        {showCost ? ` · 재고금액 ${won(result.amount)}` : ""}
      </p>
      {result.rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="조건에 맞는 제품이 없습니다" body="검색어나 필터를 바꾸면 다른 제품이 나옵니다." href={base} label="필터 지우기" />
        </div>
      ) : view === "table" ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-mute">
                <th className="py-2 pr-3">코드</th>
                <th className="py-2 pr-3">품명</th>
                {mode === "staff" ? <th className="py-2 pr-3">가용</th> : null}
                {mode === "staff" ? <th className="hidden py-2 pr-3 lg:table-cell">상태</th> : null}
                <th className="py-2">판매가</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((product) => (
                <tr key={product.id} className="border-b border-line">
                  <td className="py-3 pr-3 font-medium tracking-wide">
                    <Link href={mode === "staff" ? `/app/products/${product.slug}` : `/products/${product.slug}`}>{product.code}</Link>
                  </td>
                  <td className="py-3 pr-3">{product.name}</td>
                  {mode === "staff" ? <td className="py-3 pr-3">{product.available_qty.toLocaleString("ko-KR")}</td> : null}
                  {mode === "staff" ? (
                    <td className="hidden py-3 pr-3 lg:table-cell">
                      <span className="inline-flex gap-1"><GradeBadge grade={product.grade} /><StatusBadge value={product.work_status} /></span>
                    </td>
                  ) : null}
                  <td className="py-3">{mode === "staff" ? won(product.promo_price ?? product.sell_price) : "문의"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {result.rows.map((product: CatalogSource) => (
            <ProductCatalogCard
              key={product.id}
              product={product}
              staff={mode === "staff"}
              showCost={showCost}
              selected={selected.has(product.id)}
              back={back}
              href={mode === "staff" ? `/app/products/${product.slug}` : `/products/${product.slug}`}
            />
          ))}
        </div>
      )}
      {pages > 1 ? (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="페이지">
          {Array.from({ length: pages }).map((_, index) => {
            const page = String(index + 1);
            return (
              <Link key={page} href={`${base}?${keep(raw, { page })}`} className={`border px-3 py-1 text-sm ${String(filters.page) === page ? "border-filament bg-filament text-white" : "border-line"}`}>
                {page}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
