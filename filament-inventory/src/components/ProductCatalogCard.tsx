import Link from "next/link";
import { toggleSelection } from "@/lib/actions";
import { publicSrc, won } from "@/lib/format";
import type { CatalogSource } from "@/lib/serialize";
import { GradeBadge, PromotionBadge, StatusBadge } from "./ui";

export function ProductCatalogCard({
  product,
  href,
  staff,
  selected,
  back,
  showCost,
}: {
  product: CatalogSource;
  href: string;
  staff: boolean;
  selected?: boolean;
  back?: string;
  showCost?: boolean;
}) {
  const price = product.promo_price ?? product.sell_price;
  const stockMissing = product.erp_qty === 0 && product.sell_price === 0 && !product.promo_price;
  return (
    <article className="relative border border-line bg-white">
      {staff ? (
        <form action={toggleSelection} className="absolute left-2 top-2 z-10">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="selected" value={selected ? "0" : "1"} />
          <input type="hidden" name="back" value={back ?? "/app/catalog"} />
          <button
            type="submit"
            aria-pressed={selected}
            className={`flex h-6 w-6 items-center justify-center border ${selected ? "border-filament bg-filament text-white" : "border-ink bg-white"}`}
          >
            <span className="sr-only">{selected ? `${product.code} 선택 해제` : `${product.code} 선택`}</span>
            {selected ? "✓" : ""}
          </button>
        </form>
      ) : null}
      <div className="absolute right-2 top-2 z-10 flex max-w-[70%] flex-wrap justify-end gap-1">
        {product.promo_price ? <PromotionBadge /> : null}
        {staff && product.physical_status === "하자" ? <StatusBadge value="하자" /> : null}
        {staff && !product.department_name ? <StatusBadge value="담당 미지정" /> : null}
      </div>
      <Link href={href} className="block bg-soft">
        <div className="flex aspect-[4/5] items-center justify-center p-4">
          {product.image_path ? (
            <img src={publicSrc(product.image_path)} alt={`${product.name} 제품 사진`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-mute">이미지 없음</span>
          )}
        </div>
      </Link>
      <div className="space-y-1 border-t border-line px-3 py-3">
        <p className="text-[15px] font-medium tracking-wide">{product.code}</p>
        <p className="line-clamp-2 text-sm text-mute">{product.name}</p>
        {staff ? (
          <div className="space-y-1 pt-1 text-xs">
            {stockMissing ? (
              <p>재고 미등록</p>
            ) : (
              <>
                <p>가용 {product.available_qty.toLocaleString("ko-KR")}</p>
                <div className="flex flex-wrap gap-1">
                  <GradeBadge grade={product.grade} />
                  <StatusBadge value={product.physical_status} />
                  <StatusBadge value={product.work_status} />
                </div>
                <p>{product.promo_price ? `프로모션가 ${won(product.promo_price)}` : `판매가 ${won(price)}`}</p>
                {showCost ? <p className="text-mute">구매원가 {won(product.unit_cost)}</p> : null}
                <p className="text-mute">{product.department_name || "담당 부서 없음"} · {product.sales_priority}</p>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-mute">{product.category_name}</p>
        )}
      </div>
    </article>
  );
}
