import Link from "next/link";
import { ProductCatalogCard } from "@/components/ProductCatalogCard";
import { BrandHero } from "@/components/ui";
import { getDb } from "@/lib/db";
import { publicSrc } from "@/lib/format";
import { listProducts } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "필라멘트코리아" };

export default function FilamentHomePage() {
  const db = getDb();
  const settings = getSettings(db);
  const banner = db.prepare("SELECT * FROM banners WHERE slot IN ('filament', 'home') AND visible = 1 ORDER BY sort_order LIMIT 1").get() as
    | { title: string; subtitle: string; image_path: string }
    | undefined;
  const featured = listProducts(db, { publishedOnly: true, sort: "code", pageSize: 40, page: 1 }).rows.filter((row) => row.featured === 1).slice(0, 8);
  const projects = db.prepare("SELECT id, title, image_path FROM posts WHERE board = 'project' AND visible = 1 ORDER BY created_at DESC LIMIT 4").all() as {
    id: string;
    title: string;
    image_path: string;
  }[];
  const categories = db.prepare("SELECT slug, name FROM categories ORDER BY sort_order").all() as { slug: string; name: string }[];

  return (
    <>
      <BrandHero
        eyebrow={settings.filament_kicker}
        title={settings.filament_title || banner?.title || "상업 조명의 기준을 카탈로그로"}
        body={settings.filament_body || banner?.subtitle || "사진과 품목코드로 제품을 고릅니다."}
        image={banner?.image_path ? publicSrc(banner.image_path) : "/products/ALSL-OPT07.jpg"}
      />
      <section className="mx-auto w-full max-w-page px-5 py-10">
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((category) => (
            <Link key={category.slug} href={`/products?category=${category.slug}`} className="shrink-0 border border-line px-3 py-2 text-sm hover:border-filament hover:text-filament">
              {category.name}
            </Link>
          ))}
        </div>
        <div className="mt-8 flex items-end justify-between">
          <h2 className="text-2xl font-medium">Products</h2>
          <Link href="/products" className="border border-filament px-4 py-2 text-sm text-filament">전체 보기</Link>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((product) => (
            <ProductCatalogCard key={product.id} product={product} href={`/products/${product.slug}`} staff={false} />
          ))}
        </div>
      </section>
      <section className="border-t border-line">
        <div className="mx-auto w-full max-w-page px-5 py-10">
          <h2 className="text-2xl font-medium">Projects</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <Link key={project.id} href="/projects" className="block border border-line">
                <div className="aspect-[16/10] bg-soft">
                  {project.image_path ? <img src={publicSrc(project.image_path)} alt={project.title} className="h-full w-full object-cover" /> : null}
                </div>
                <p className="px-3 py-3 text-sm">{project.title}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
