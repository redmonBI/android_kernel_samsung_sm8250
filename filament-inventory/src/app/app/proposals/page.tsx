import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata = { title: "제안서" };

export default async function ProposalsPage() {
  const user = await requireUser();
  const rows = getDb()
    .prepare("SELECT id, title, customer, project_name, status, updated_at FROM proposals WHERE user_id = ? OR ? = 'admin' ORDER BY updated_at DESC")
    .all(user.id, user.role) as { id: string; title: string; customer: string; project_name: string; status: string; updated_at: string }[];
  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <h1 className="text-3xl font-medium">제안서</h1>
      <p className="mt-2 text-sm text-mute">선택 목록에서 만든 뒤, 문구와 단가를 고치고 PDF로 저장합니다.</p>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {rows.length === 0 ? <li className="py-6 text-sm text-mute">아직 없습니다.</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <Link href={`/app/proposals/${row.id}`} className="font-medium">{row.title}</Link>
            <span className="text-mute">{row.customer || "고객 미입력"} · {row.project_name || "프로젝트 미입력"} · {row.status} · {row.updated_at.slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
