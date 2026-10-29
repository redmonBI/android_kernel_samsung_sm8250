import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata = { title: "변경 이력" };

export default async function AuditPage() {
  const user = await requireUser();
  if (!["admin", "approver", "finance_viewer"].includes(user.role)) {
    return <p className="px-5 py-10 text-sm">이력은 관리자, 승인자, 재무 조회만 봅니다.</p>;
  }
  const rows = getDb()
    .prepare(
      `SELECT a.action, a.entity, a.entity_id, a.before_json, a.after_json, a.created_at, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 80`,
    )
    .all() as { action: string; entity: string; entity_id: string; before_json: string | null; after_json: string | null; created_at: string; user_name: string | null }[];
  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <h1 className="text-3xl font-medium">변경 이력</h1>
      <ul className="mt-6 divide-y divide-line border-y border-line text-sm">
        {rows.map((row) => (
          <li key={row.created_at + row.action + row.entity_id} className="py-3">
            <p>{row.created_at.slice(0, 19).replace("T", " ")} · {row.user_name || "시스템"} · {row.action} · {row.entity}</p>
            <p className="mt-1 break-all text-xs text-mute">전 {row.before_json || "-"}</p>
            <p className="break-all text-xs text-mute">후 {row.after_json || "-"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
