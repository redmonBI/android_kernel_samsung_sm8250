import { Flash } from "@/components/ui";
import { sendInquiry } from "@/lib/actions";
import { readQuery } from "@/lib/search";

export const metadata = { title: "문의" };

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = readQuery(await searchParams);
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-medium">Contact</h1>
      <p className="mt-2 text-sm text-mute">제품 선정과 프로젝트 문의를 남기면 사내 업무함에서 확인합니다.</p>
      <div className="mt-4"><Flash error={raw.error} ok={raw.ok} /></div>
      <form action={sendInquiry} className="mt-6 space-y-3">
        <label className="block text-sm">이름
          <input name="name" required className="mt-1 w-full border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">연락처
          <input name="contact" className="mt-1 w-full border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">내용
          <textarea name="body" required rows={6} className="mt-1 w-full border border-line px-3 py-2" />
        </label>
        <button className="bg-filament px-4 py-2 text-sm text-white" type="submit">보내기</button>
      </form>
    </div>
  );
}
