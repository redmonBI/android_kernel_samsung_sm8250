import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui";
import { getDb } from "@/lib/db";
import { blank, publicSrc } from "@/lib/format";
import { getProduct } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(getDb(), slug);
  return { title: product ? product.code : "제품" };
}

export default async function PublicProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  const product = getProduct(db, slug);
  if (!product || product.featured === 0 && db.prepare("SELECT published FROM products WHERE slug = ?").get(slug) === undefined) {
    notFound();
  }
  const published = db.prepare("SELECT published, deleted_at FROM products WHERE slug = ?").get(slug) as { published: number; deleted_at: string | null } | undefined;
  if (!published || published.deleted_at || published.published !== 1) notFound();
  const images = db
    .prepare("SELECT path, alt FROM product_images WHERE product_id = ? AND kind = 'normal' ORDER BY sort_order")
    .all(product.id) as { path: string; alt: string }[];
  const rows = [
    ["품명", product.name],
    ["규격", blank(product.spec)],
    ["W", blank(product.watt)],
    ["색온도·연색성", blank(product.color_temp)],
    ["각도", blank(product.beam_angle)],
    ["사이즈", blank(product.size_text)],
    ["제조사", blank(product.manufacturer)],
    ["마감", blank(product.finish)],
    ["옵션", blank(product.options_text)],
  ];

  return (
    <article>
      <div className="bg-filament text-white">
        <div className="mx-auto w-full max-w-page px-5 py-8">
          <p className="text-sm text-white/80">[{product.category_name}]</p>
          <h1 className="mt-2 text-4xl font-medium tracking-wide">{product.code}</h1>
          <p className="mt-2 text-white/90">{product.name}</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-page px-5 py-8">
        <Breadcrumb items={[{ href: "/", label: "홈" }, { href: "/products", label: "제품" }, { label: product.code }]} />
        <div className="mt-6 grid gap-8 lg:grid-cols-[55%_45%]">
          <div>
            <div className="flex aspect-[4/5] items-center justify-center bg-soft p-6">
              {images[0] ? <img src={publicSrc(images[0].path)} alt={images[0].alt} className="h-full w-full object-contain" /> : <span className="text-mute">이미지 없음</span>}
            </div>
            {images.length > 1 ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {images.map((image) => (
                  <div key={image.path} className="aspect-square bg-soft p-1">
                    <img src={publicSrc(image.path)} alt={image.alt} className="h-full w-full object-contain" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <h2 className="text-2xl font-medium">{product.name}</h2>
            <dl className="mt-6">
              {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[140px_1fr] gap-3 border-b border-line py-3 text-sm">
                  <dt className="text-mute">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm text-mute">재고 수량과 구매 조건은 공개하지 않습니다. 프로젝트 문의로 연결합니다.</p>
            <Link href="/contact" className="mt-4 inline-block border border-filament px-4 py-2 text-sm text-filament">문의하기</Link>
          </div>
        </div>
      </div>
    </article>
  );
}
