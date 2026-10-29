import Link from "next/link";
import { Flash } from "@/components/ui";
import { makeProposal, removeSelectionItem, updateSelection } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { won } from "@/lib/format";
import { activeList, listItems } from "@/lib/lists";
import { canPropose } from "@/lib/permissions";
import { readQuery } from "@/lib/search";

export const metadata = { title: "선택 목록" };

export default async function SelectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = readQuery(await searchParams);
  const db = getDb();
  const list = db.prepare("SELECT * FROM saved_lists WHERE id = ?").get(activeList(db, user.id)) as {
    id: string;
    project_name: string;
    customer: string;
    purpose: string;
    need_by: string | null;
    share_token: string;
  };
  const items = listItems(db, list.id);
  const amount = items.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
  const copyText = items.map((item) => `${item.code}\t${item.qty}`).join("\n");

  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <h1 className="text-3xl font-medium">선택 목록</h1>
      <div className="mt-4"><Flash error={raw.error} ok={raw.ok} /></div>
      <form action={updateSelection} className="mt-6 space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">프로젝트<input name="project" defaultValue={list.project_name} className="mt-1 w-full border border-line px-2 py-2" /></label>
          <label className="text-sm">고객<input name="customer" defaultValue={list.customer} className="mt-1 w-full border border-line px-2 py-2" /></label>
          <label className="text-sm">사용 목적<input name="purpose" defaultValue={list.purpose} className="mt-1 w-full border border-line px-2 py-2" /></label>
          <label className="text-sm">필요일<input name="needBy" type="date" defaultValue={list.need_by ?? ""} className="mt-1 w-full border border-line px-2 py-2" /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-mute">
                <th className="py-2">품목코드</th>
                <th>품명</th>
                <th>선택 수량</th>
                <th>가용</th>
                <th>단가</th>
                <th>금액</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-3 font-medium tracking-wide"><Link href={`/app/products/${item.slug}`}>{item.code}</Link></td>
                  <td>{item.name}</td>
                  <td><input name={`qty:${item.id}`} type="number" min={1} defaultValue={item.qty} className="w-20 border border-line px-2 py-1" /></td>
                  <td>{item.available_qty.toLocaleString("ko-KR")}{item.qty > item.available_qty ? " · 초과" : ""}</td>
                  <td>{won(item.unit_price)}</td>
                  <td>{won(item.qty * item.unit_price)}</td>
                  <td>
                    <button formAction={removeSelectionItem} name="id" value={item.id} className="text-mute" type="submit">빼기</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 ? <p className="text-sm text-mute">카탈로그에서 제품을 담아 주세요.</p> : null}
        <p className="text-sm">예상 금액 {won(amount)}</p>
        <div className="flex flex-wrap gap-2">
          <button className="border border-ink px-3 py-2 text-sm" type="submit">목록 저장</button>
          {canPropose(user.role) ? <button className="bg-filament px-3 py-2 text-sm text-white" formAction={makeProposal} type="submit">제안서 만들기</button> : null}
          <Link className="border border-line px-3 py-2 text-sm" href={`/share/${list.share_token}`}>공유 링크</Link>
          <a className="border border-line px-3 py-2 text-sm" href="/api/selection/export">ERP CSV</a>
          <a className="border border-line px-3 py-2 text-sm" href="/api/selection/export?format=xlsx">ERP XLSX</a>
        </div>
      </form>
      <p className="mt-4 text-sm text-mute">ERP에 붙여 넣을 코드와 수량</p>
      <pre className="mt-2 overflow-auto border border-line bg-soft p-3 text-sm">{copyText || "없음"}</pre>
    </div>
  );
}
