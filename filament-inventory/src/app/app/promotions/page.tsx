import { ProductCatalogCard } from "@/components/ProductCatalogCard";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canSeeCost } from "@/lib/permissions";
import { listProducts } from "@/lib/queries";

export const metadata = { title: "프로모션" };

export default async function PromotionsPage() {
  const user = await requireUser();
  const promos = getDb().prepare("SELECT name, promo_type, description, ends_on FROM promotions WHERE active = 1").all() as {
    name: string;
    promo_type: string;
    description: string;
    ends_on: string;
  }[];
  const products = listProducts(getDb(), { promo: true, sort: "amount", pageSize: 40, page: 1 }).rows;
  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <h1 className="text-3xl font-medium">프로모션</h1>
      <ul className="mt-4 space-y-2 text-sm">
        {promos.map((promo) => (
          <li key={promo.name} className="border border-line px-3 py-3">
            <span className="font-medium">{promo.name}</span> · {promo.promo_type} · {promo.ends_on}까지
            <p className="text-mute">{promo.description}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((product) => (
          <ProductCatalogCard key={product.id} product={product} href={`/app/products/${product.slug}`} staff showCost={canSeeCost(user.role)} />
        ))}
      </div>
    </div>
  );
}
