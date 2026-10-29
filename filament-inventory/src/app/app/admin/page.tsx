import { Flash } from "@/components/ui";
import { saveBanner, saveMapping, savePost } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canEditContent } from "@/lib/permissions";
import { readQuery } from "@/lib/search";

export const metadata = { title: "관리자" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== "admin" && !canEditContent(user.role)) {
    return <p className="px-5 py-10 text-sm">콘텐츠를 고칠 권한이 없습니다.</p>;
  }
  const raw = readQuery(await searchParams);
  const db = getDb();
  const banners = db.prepare("SELECT * FROM banners ORDER BY sort_order").all() as {
    id: string;
    title: string;
    subtitle: string;
    link_url: string;
    sort_order: number;
    visible: number;
  }[];
  const categories = db.prepare("SELECT id, name FROM categories ORDER BY sort_order").all() as { id: string; name: string }[];
  const mappings = db.prepare(
    `SELECT m.source_value, c.name FROM category_mappings m JOIN categories c ON c.id = m.category_id ORDER BY m.source_value`,
  ).all() as { source_value: string; name: string }[];
  const inquiries = db.prepare("SELECT title, body, created_at FROM posts WHERE board = 'inquiry' ORDER BY created_at DESC LIMIT 20").all() as {
    title: string;
    body: string;
    created_at: string;
  }[];

  return (
    <div className="mx-auto w-full max-w-page space-y-10 px-5 py-8">
      <h1 className="text-3xl font-medium">운영</h1>
      <Flash error={raw.error} ok={raw.ok} />
      <section>
        <h2 className="text-xl">메인 배너</h2>
        {banners.map((banner) => (
          <form key={banner.id} action={saveBanner} className="mt-3 grid gap-2 border border-line p-3 md:grid-cols-2">
            <input type="hidden" name="id" value={banner.id} />
            <input name="title" defaultValue={banner.title} className="border border-line px-2 py-2 text-sm" />
            <input name="subtitle" defaultValue={banner.subtitle} className="border border-line px-2 py-2 text-sm" />
            <input name="link" defaultValue={banner.link_url} className="border border-line px-2 py-2 text-sm" />
            <input name="sort" type="number" defaultValue={banner.sort_order} className="border border-line px-2 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" value="1" defaultChecked={banner.visible === 1} /> 노출</label>
            <button className="border border-ink px-3 py-2 text-sm" type="submit">배너 저장</button>
          </form>
        ))}
      </section>
      <section>
        <h2 className="text-xl">게시글</h2>
        <form action={savePost} className="mt-3 grid gap-2 border border-line p-3">
          <select name="board" className="border border-line px-2 py-2 text-sm">
            <option value="notice">공지</option>
            <option value="project">시공 사례</option>
            <option value="procurement">조달</option>
            <option value="download">자료실</option>
          </select>
          <input name="title" placeholder="제목" className="border border-line px-2 py-2 text-sm" required />
          <textarea name="body" rows={4} placeholder="내용" className="border border-line px-2 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" value="1" defaultChecked /> 노출</label>
          <button className="bg-filament px-3 py-2 text-sm text-white" type="submit">등록</button>
        </form>
      </section>
      {user.role === "admin" ? (
        <section>
          <h2 className="text-xl">엑셀 품목구분 → 카테고리</h2>
          <ul className="mt-2 text-sm text-mute">
            {mappings.map((mapping) => <li key={mapping.source_value}>{mapping.source_value} → {mapping.name}</li>)}
          </ul>
          <form action={saveMapping} className="mt-3 flex flex-wrap gap-2">
            <input name="source" placeholder="엑셀 값" className="border border-line px-2 py-2 text-sm" />
            <select name="categoryId" className="border border-line px-2 py-2 text-sm">
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <button className="border border-ink px-3 py-2 text-sm" type="submit">매핑 저장</button>
          </form>
        </section>
      ) : null}
      <section>
        <h2 className="text-xl">공개 문의</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
          {inquiries.length === 0 ? <li className="py-4 text-mute">문의가 없습니다.</li> : null}
          {inquiries.map((item) => (
            <li key={item.created_at} className="py-3">
              <p className="font-medium">{item.title}</p>
              <p className="whitespace-pre-wrap text-mute">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
