import { Flash } from "@/components/ui";
import { decide } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canApprove } from "@/lib/permissions";
import { readQuery } from "@/lib/search";

export const metadata = { title: "업무함" };

const KIND: Record<string, string> = {
  reservation: "예약",
  adjustment: "재고 조정",
  shipment: "출고 예정",
  import: "엑셀 반영",
};

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = readQuery(await searchParams);
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.kind, a.payload_json, a.created_at, u.name AS requester
       FROM approval_requests a
       LEFT JOIN users u ON u.id = a.requested_by
       WHERE a.status = 'pending' AND (a.requested_by = ? OR ? IN ('admin', 'approver'))
       ORDER BY a.created_at DESC`,
    )
    .all(user.id, user.role) as { id: string; kind: string; payload_json: string; created_at: string; requester: string | null }[];
  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <h1 className="text-3xl font-medium">업무함</h1>
      <div className="mt-4"><Flash error={raw.error} ok={raw.ok} /></div>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {rows.length === 0 ? <li className="py-6 text-sm text-mute">대기 항목이 없습니다.</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <div>
              <p className="font-medium">{KIND[row.kind] ?? row.kind}</p>
              <p className="text-mute">{row.requester || "시스템"} · {row.created_at.slice(0, 16).replace("T", " ")}</p>
              <p className="mt-1 break-all text-mute">{row.payload_json}</p>
            </div>
            {canApprove(user.role) ? (
              <div className="flex gap-2">
                <form action={decide}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="accept" value="1" /><button className="bg-filament px-3 py-2 text-white" type="submit">승인</button></form>
                <form action={decide}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="accept" value="0" /><button className="border border-ink px-3 py-2" type="submit">반려</button></form>
              </div>
            ) : <p className="text-mute">승인 대기</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
