import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { won } from "@/lib/format";

export const metadata = { title: "공유 목록" };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const list = db.prepare("SELECT id, project_name, customer, purpose FROM saved_lists WHERE share_token = ?").get(token) as
    | { id: string; project_name: string; customer: string; purpose: string }
    | undefined;
  if (!list) notFound();
  const items = db
    .prepare(
      `SELECT p.code, p.name, sli.qty, sli.unit_price
       FROM saved_list_items sli JOIN products p ON p.id = sli.product_id
       WHERE sli.list_id = ? ORDER BY p.code`,
    )
    .all(list.id) as { code: string; name: string; qty: number; unit_price: number }[];
  return (
    <div className="mx-auto w-full max-w-page px-5 py-10">
      <h1 className="text-3xl font-medium">{list.project_name || "선택 목록"}</h1>
      <p className="mt-2 text-sm text-mute">{list.customer} {list.purpose}</p>
      <p className="mt-2 text-sm text-mute">구매원가와 내부 하자는 이 링크에 없습니다.</p>
      <table className="mt-6 w-full text-sm">
        <thead><tr className="border-b border-line text-left"><th className="py-2">코드</th><th>품명</th><th>수량</th><th>단가</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.code} className="border-b border-line">
              <td className="py-2 font-medium">{item.code}</td>
              <td>{item.name}</td>
              <td>{item.qty}</td>
              <td>{won(item.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
