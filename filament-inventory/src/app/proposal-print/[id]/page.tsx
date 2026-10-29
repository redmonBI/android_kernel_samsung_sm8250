import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { won } from "@/lib/format";

export const metadata = { title: "제안서 인쇄" };

export default async function ProposalPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/proposals");
  const { id } = await params;
  const db = getDb();
  const proposal = db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as {
    user_id: string;
    title: string;
    customer: string;
    project_name: string;
    intro_text: string;
    terms_text: string;
    updated_at: string;
  } | undefined;
  if (!proposal || (proposal.user_id !== user.id && user.role !== "admin")) notFound();
  const items = db.prepare("SELECT code, name, qty, unit_price, description, is_sample FROM proposal_items WHERE proposal_id = ? ORDER BY sort_order").all(id) as {
    code: string;
    name: string;
    qty: number;
    unit_price: number;
    description: string;
    is_sample: number;
  }[];
  const amount = items.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
  const sample = items.some((item) => item.is_sample === 1);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-white px-8 py-10 text-ink">
      <style>{`@media print { .no-print { display: none !important } body { background: white } }`}</style>
      <div className="no-print mb-6 flex gap-2">
        <a href={`/app/proposals/${id}`} className="border border-line px-3 py-2 text-sm">편집으로</a>
        <button className="border border-filament px-3 py-2 text-sm text-filament" type="button" id="print-btn">PDF로 저장</button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-btn')?.addEventListener('click',()=>window.print())" }} />
      <img src="/brand/logo-light.png" alt="필라멘트코리아" className="h-10 w-auto" />
      <p className="mt-8 text-xs tracking-[0.18em] text-mute">PROPOSAL</p>
      <h1 className="mt-2 text-3xl font-medium">{proposal.title}</h1>
      <p className="mt-3 text-sm">고객 {proposal.customer || "미입력"} · 프로젝트 {proposal.project_name || "미입력"} · {proposal.updated_at.slice(0, 10)}</p>
      {sample ? <p className="mt-3 border border-amber-600 px-3 py-2 text-sm text-amber-950">예시 단가가 포함되어 있습니다. 거래처 전달 전에 금액을 확인하세요.</p> : null}
      <p className="mt-6 whitespace-pre-wrap text-sm leading-6">{proposal.intro_text}</p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="py-2">코드</th>
            <th>품명</th>
            <th>수량</th>
            <th>단가</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.code} className="border-b border-line align-top">
              <td className="py-3 pr-2 font-medium">{item.code}</td>
              <td className="py-3 pr-2">
                {item.name}
                <p className="mt-1 whitespace-pre-wrap text-mute">{item.description}</p>
              </td>
              <td className="py-3 pr-2">{item.qty.toLocaleString("ko-KR")}</td>
              <td className="py-3 pr-2">{won(item.unit_price)}</td>
              <td className="py-3">{won(item.qty * item.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-right text-sm font-medium">합계 {won(amount)}</p>
      <p className="mt-6 whitespace-pre-wrap text-sm leading-6">{proposal.terms_text}</p>
      <p className="mt-10 text-xs text-mute">(주)영진이엘 · 02-6278-4227 · yjel1040@naver.com</p>
    </main>
  );
}
