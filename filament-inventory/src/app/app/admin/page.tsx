import Link from "next/link";
import { Flash } from "@/components/ui";
import { deletePost, saveBanner, saveMapping, savePost, saveSiteSettings } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canEditContent } from "@/lib/permissions";
import { readQuery } from "@/lib/search";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "사이트 운영" };

const SECTIONS = [
  ["site", "사이트 정보"],
  ["youngjin", "영진이엘 메인"],
  ["filament", "필라멘트 메인"],
  ["banners", "배너"],
  ["posts", "게시글"],
  ["inquiries", "문의"],
  ["mapping", "분류 매핑"],
] as const;

const BOARDS: Record<string, string> = {
  notice: "공지",
  news: "영진소식",
  project: "시공 사례",
  procurement: "조달",
  download: "자료실",
};

const field = "mt-1 w-full border border-line bg-white px-3 py-2 text-sm";

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
  const section = SECTIONS.some(([key]) => key === raw.section) ? raw.section! : "site";
  const db = getDb();
  const settings = getSettings(db);
  const banners = db.prepare("SELECT * FROM banners ORDER BY slot, sort_order").all() as {
    id: string;
    slot: string;
    title: string;
    subtitle: string;
    image_path: string;
    link_url: string;
    sort_order: number;
    visible: number;
  }[];
  const posts = db.prepare("SELECT id, board, title, body, image_path, visible, updated_at FROM posts WHERE board != 'inquiry' ORDER BY updated_at DESC LIMIT 40").all() as {
    id: string;
    board: string;
    title: string;
    body: string;
    image_path: string;
    visible: number;
    updated_at: string;
  }[];
  const inquiries = db.prepare("SELECT title, body, created_at FROM posts WHERE board = 'inquiry' ORDER BY created_at DESC LIMIT 30").all() as {
    title: string;
    body: string;
    created_at: string;
  }[];
  const categories = db.prepare("SELECT id, name FROM categories ORDER BY sort_order").all() as { id: string; name: string }[];
  const mappings = db.prepare(
    `SELECT m.source_value, c.name FROM category_mappings m JOIN categories c ON c.id = m.category_id ORDER BY m.source_value`,
  ).all() as { source_value: string; name: string }[];

  return (
    <div className="mx-auto grid w-full max-w-page gap-8 px-5 py-8 lg:grid-cols-[220px_1fr]">
      <aside>
        <p className="text-xs tracking-[0.16em] text-mute">SITE ADMIN</p>
        <h1 className="mt-2 text-2xl font-medium">사이트 운영</h1>
        <nav className="mt-6 flex gap-2 overflow-x-auto lg:flex-col" aria-label="운영 메뉴">
          {SECTIONS.map(([key, label]) => (
            <Link key={key} href={`/app/admin?section=${key}`} className={`shrink-0 border px-3 py-2 text-sm ${section === key ? "border-[#071833] bg-[#071833] text-white" : "border-line"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-6 text-xs leading-5 text-mute">저장하면 공개 사이트에 바로 반영됩니다. 재고·예약·제안서는 기존 메뉴를 그대로 씁니다.</p>
      </aside>
      <div className="min-w-0">
        <Flash error={raw.error} ok={raw.ok} />
        {section === "site" ? (
          <form action={saveSiteSettings} className="mt-4 grid gap-4 border border-line p-5 md:grid-cols-2">
            <input type="hidden" name="section" value="site" />
            <h2 className="md:col-span-2 text-xl font-medium">회사 기본 정보</h2>
            <Field label="회사명" name="company_name" value={settings.company_name} />
            <Field label="대표" name="ceo" value={settings.ceo} />
            <Field label="주소" name="address" value={settings.address} className="md:col-span-2" />
            <Field label="전화" name="phone" value={settings.phone} />
            <Field label="팩스" name="fax" value={settings.fax} />
            <Field label="대표 메일" name="email" value={settings.email} />
            <Field label="필라멘트 메일" name="filament_email" value={settings.filament_email} />
            <button className="bg-[#071833] px-4 py-2 text-sm text-white md:col-span-2" type="submit">저장</button>
          </form>
        ) : null}
        {section === "youngjin" ? (
          <form action={saveSiteSettings} className="mt-4 grid gap-4 border border-line p-5">
            <input type="hidden" name="section" value="youngjin" />
            <h2 className="text-xl font-medium">영진이엘 메인 문구</h2>
            <p className="text-sm text-mute">홈 첫 화면의 작은 영문, 큰 제목, 설명입니다. <Link href="/" className="text-[#0056B8]">미리보기</Link></p>
            <Field label="작은 문구" name="youngjin_kicker" value={settings.youngjin_kicker} />
            <label className="text-sm">큰 제목
              <textarea name="youngjin_title" defaultValue={settings.youngjin_title} rows={2} className={field} />
            </label>
            <label className="text-sm">설명
              <textarea name="youngjin_body" defaultValue={settings.youngjin_body} rows={4} className={field} />
            </label>
            <button className="bg-[#071833] px-4 py-2 text-sm text-white" type="submit">메인 저장</button>
          </form>
        ) : null}
        {section === "filament" ? (
          <form action={saveSiteSettings} className="mt-4 grid gap-4 border border-line p-5">
            <input type="hidden" name="section" value="filament" />
            <h2 className="text-xl font-medium">필라멘트코리아 메인 문구</h2>
            <p className="text-sm text-mute">브랜드 홈 히어로 문구입니다. <Link href="/filament" className="text-filament">미리보기</Link></p>
            <Field label="작은 문구" name="filament_kicker" value={settings.filament_kicker} />
            <label className="text-sm">큰 제목
              <textarea name="filament_title" defaultValue={settings.filament_title} rows={2} className={field} />
            </label>
            <label className="text-sm">설명
              <textarea name="filament_body" defaultValue={settings.filament_body} rows={4} className={field} />
            </label>
            <button className="bg-filament px-4 py-2 text-sm text-white" type="submit">메인 저장</button>
          </form>
        ) : null}
        {section === "banners" ? (
          <section className="mt-4 space-y-4">
            <form action={saveBanner} className="grid gap-3 border border-line p-5 md:grid-cols-2">
              <input type="hidden" name="section" value="banners" />
              <h2 className="md:col-span-2 text-xl font-medium">배너 등록</h2>
              <label className="text-sm">노출 위치
                <select name="slot" className={field} defaultValue="filament">
                  <option value="filament">필라멘트 메인</option>
                  <option value="youngjin">영진이엘</option>
                  <option value="home">공통</option>
                </select>
              </label>
              <Field label="제목" name="title" value="" />
              <Field label="설명" name="subtitle" value="" className="md:col-span-2" />
              <Field label="이미지 경로" name="image" value="/products/ALSL-OPT07.jpg" />
              <Field label="링크" name="link" value="/products" />
              <Field label="순서" name="sort" value="1" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" value="1" defaultChecked /> 노출</label>
              <button className="bg-[#071833] px-4 py-2 text-sm text-white" type="submit">등록</button>
            </form>
            {banners.map((banner) => (
              <form key={banner.id} action={saveBanner} className="grid gap-3 border border-line p-4 md:grid-cols-2">
                <input type="hidden" name="section" value="banners" />
                <input type="hidden" name="id" value={banner.id} />
                <label className="text-sm">위치
                  <select name="slot" defaultValue={banner.slot} className={field}>
                    <option value="filament">필라멘트 메인</option>
                    <option value="youngjin">영진이엘</option>
                    <option value="home">공통</option>
                  </select>
                </label>
                <Field label="제목" name="title" value={banner.title} />
                <Field label="설명" name="subtitle" value={banner.subtitle} className="md:col-span-2" />
                <Field label="이미지 경로" name="image" value={banner.image_path} />
                <Field label="링크" name="link" value={banner.link_url} />
                <Field label="순서" name="sort" value={String(banner.sort_order)} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" value="1" defaultChecked={banner.visible === 1} /> 노출</label>
                <button className="border border-ink px-3 py-2 text-sm" type="submit">수정 저장</button>
              </form>
            ))}
          </section>
        ) : null}
        {section === "posts" ? (
          <section className="mt-4 space-y-4">
            <form action={savePost} className="grid gap-3 border border-line p-5">
              <input type="hidden" name="section" value="posts" />
              <h2 className="text-xl font-medium">게시글 등록</h2>
              <BoardSelect />
              <Field label="제목" name="title" value="" />
              <label className="text-sm">내용<textarea name="body" rows={4} className={field} /></label>
              <Field label="이미지 경로" name="image" value="" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" value="1" defaultChecked /> 노출</label>
              <button className="bg-[#071833] px-4 py-2 text-sm text-white" type="submit">등록</button>
            </form>
            {posts.map((post) => (
              <form key={post.id} action={savePost} className="grid gap-3 border border-line p-4">
                <input type="hidden" name="section" value="posts" />
                <input type="hidden" name="id" value={post.id} />
                <div className="flex items-center justify-between text-xs text-mute">
                  <span>{BOARDS[post.board] ?? post.board} · {post.visible ? "노출" : "숨김"} · {post.updated_at.slice(0, 10)}</span>
                  <button formAction={deletePost} className="text-red-800" type="submit">삭제</button>
                </div>
                <BoardSelect current={post.board} />
                <Field label="제목" name="title" value={post.title} />
                <label className="text-sm">내용<textarea name="body" rows={3} defaultValue={post.body} className={field} /></label>
                <Field label="이미지 경로" name="image" value={post.image_path} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" value="1" defaultChecked={post.visible === 1} /> 노출</label>
                <button className="border border-ink px-3 py-2 text-sm" type="submit">수정 저장</button>
              </form>
            ))}
          </section>
        ) : null}
        {section === "inquiries" ? (
          <section className="mt-4">
            <h2 className="text-xl font-medium">들어온 문의</h2>
            <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
              {inquiries.length === 0 ? <li className="py-6 text-mute">문의가 없습니다.</li> : null}
              {inquiries.map((item) => (
                <li key={item.created_at + item.title} className="py-4">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-mute">{item.created_at.slice(0, 16).replace("T", " ")}</p>
                  <p className="mt-2 whitespace-pre-wrap leading-6">{item.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {section === "mapping" && user.role === "admin" ? (
          <section className="mt-4">
            <h2 className="text-xl font-medium">엑셀 품목구분</h2>
            <ul className="mt-3 text-sm text-mute">
              {mappings.map((mapping) => <li key={mapping.source_value} className="border-b border-line py-2">{mapping.source_value} → {mapping.name}</li>)}
            </ul>
            <form action={saveMapping} className="mt-4 flex flex-wrap gap-2">
              <input type="hidden" name="section" value="mapping" />
              <input name="source" placeholder="엑셀 값" className="border border-line px-3 py-2 text-sm" />
              <select name="categoryId" className="border border-line px-3 py-2 text-sm">
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <button className="border border-ink px-3 py-2 text-sm" type="submit">매핑 저장</button>
            </form>
          </section>
        ) : null}
        {section === "mapping" && user.role !== "admin" ? <p className="mt-4 text-sm">분류 매핑은 관리자만 바꿉니다.</p> : null}
      </div>
    </div>
  );
}

function Field({ label, name, value, className = "" }: { label: string; name: string; value: string; className?: string }) {
  return (
    <label className={`text-sm ${className}`}>{label}
      <input name={name} defaultValue={value} className={field} />
    </label>
  );
}

function BoardSelect({ current = "notice" }: { current?: string }) {
  return (
    <label className="text-sm">게시판
      <select name="board" defaultValue={current} className={field}>
        {Object.entries(BOARDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}
