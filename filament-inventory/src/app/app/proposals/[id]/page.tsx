import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/ui";
import { duplicateProposal, saveProposal } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { won } from "@/lib/format";
import { readQuery } from "@/lib/search";

export const metadata = { title: "제안서 편집" };

export default async function ProposalEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const raw = readQuery(await searchParams);
  const db = getDb();
  const proposal = db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as {
    id: string;
    user_id: string;
    title: string;
    customer: string;
    project_name: string;
    intro_text: string;
    terms_text: string;
    status: string;
  } | undefined;
  if (!proposal || (proposal.user_id !== user.id && user.role !== "admin")) notFound();
  const items = db.prepare("SELECT * FROM proposal_items WHERE proposal_id = ? ORDER BY sort_order").all(id) as {
    id: string;
    code: string;
    name: string;
    qty: number;
    unit_price: number;
    description: string;
    is_sample: number;
  }[];
  const amount = items.reduce((sum, item) => sum + item.qty * item.unit_price, 0);

  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-medium">제안서 편집</h1>
        <Link href={`/proposal-print/${id}`} className="border border-filament px-3 py-2 text-sm text-filament">미리보기 · PDF</Link>
      </div>
      <div className="mt-4"><Flash error={raw.error} ok={raw.ok} /></div>
      <form action={saveProposal} className="mt-6 space-y-4">
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">제목<input name="title" defaultValue={proposal.title} className="mt-1 w-full border border-line px-2 py-2" /></label>
          <label className="text-sm">고객<input name="customer" defaultValue={proposal.customer} className="mt-1 w-full border border-line px-2 py-2" /></label>
          <label className="text-sm">프로젝트<input name="project" defaultValue={proposal.project_name} className="mt-1 w-full border border-line px-2 py-2" /></label>
          <label className="text-sm">상태
            <select name="status" defaultValue={proposal.status} className="mt-1 w-full border border-line px-2 py-2">
              <option value="draft">작성 중</option>
              <option value="sent">전달함</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">인사·설명
          <textarea name="intro" rows={4} defaultValue={proposal.intro_text} className="mt-1 w-full border border-line px-2 py-2" />
        </label>
        <div className="space-y-4">
          {items.map((item) => (
            <fieldset key={item.id} className="border border-line p-3">
              <legend className="px-1 text-sm font-medium tracking-wide">{item.code} · {item.name}</legend>
              {item.is_sample ? <p className="text-xs text-amber-900">예시 단가가 포함된 품목입니다.</p> : null}
              <div className="mt-2 grid gap-2 md:grid-cols-[120px_160px_1fr]">
                <label className="text-sm">수량<input name={`qty:${item.id}`} type="number" min={0} defaultValue={item.qty} className="mt-1 w-full border border-line px-2 py-2" /></label>
                <label className="text-sm">단가<input name={`price:${item.id}`} type="number" min={0} defaultValue={item.unit_price} className="mt-1 w-full border border-line px-2 py-2" /></label>
                <label className="text-sm">설명
                  <textarea name={`desc:${item.id}`} rows={2} defaultValue={item.description} className="mt-1 w-full border border-line px-2 py-2" />
                </label>
              </div>
            </fieldset>
          ))}
        </div>
        <label className="block text-sm">조건
          <textarea name="terms" rows={3} defaultValue={proposal.terms_text} className="mt-1 w-full border border-line px-2 py-2" />
        </label>
        <p className="text-sm">합계 {won(amount)} · 구매원가는 제안서에 들어가지 않습니다.</p>
        <div className="flex gap-2">
          <button className="bg-filament px-4 py-2 text-sm text-white" type="submit">저장</button>
          <button className="border border-ink px-4 py-2 text-sm" type="submit" formAction={duplicateProposal}>복제</button>
        </div>
      </form>
    </div>
  );
}
