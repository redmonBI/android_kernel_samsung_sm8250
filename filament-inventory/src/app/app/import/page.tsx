import { Flash } from "@/components/ui";
import { decide, rollbackJob, uploadExcel } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canApprove, canImport } from "@/lib/permissions";
import { readQuery } from "@/lib/search";

export const metadata = { title: "업데이트 센터" };

const TABS = [
  ["add", "추가"],
  ["update", "변경"],
  ["delete_candidate", "삭제 후보"],
  ["unchanged", "변경 없음"],
  ["error", "오류"],
] as const;

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!canImport(user.role) && !canApprove(user.role)) {
    return <p className="px-5 py-10 text-sm">엑셀 업데이트는 구매지원, 승인자, 관리자만 엽니다.</p>;
  }
  const raw = readQuery(await searchParams);
  const db = getDb();
  const jobs = db.prepare("SELECT id, filename, mode, status, summary_json, created_at FROM import_jobs ORDER BY created_at DESC LIMIT 12").all() as {
    id: string;
    filename: string;
    mode: string;
    status: string;
    summary_json: string;
    created_at: string;
  }[];
  const jobId = raw.job || jobs[0]?.id;
  const job = jobId ? jobs.find((item) => item.id === jobId) || (db.prepare("SELECT id, filename, mode, status, summary_json, created_at FROM import_jobs WHERE id = ?").get(jobId) as (typeof jobs)[number] | undefined) : undefined;
  const tab = TABS.some(([key]) => key === raw.tab) ? raw.tab! : "add";
  const rows = job
    ? (db.prepare("SELECT code, action, message, before_json, after_json FROM import_job_rows WHERE job_id = ? AND action = ? ORDER BY code LIMIT 200").all(job.id, tab) as {
        code: string;
        action: string;
        message: string;
        before_json: string | null;
        after_json: string | null;
      }[])
    : [];
  const approval = job
    ? (db.prepare("SELECT id, status FROM approval_requests WHERE kind = 'import' AND entity_id = ? ORDER BY created_at DESC LIMIT 1").get(job.id) as { id: string; status: string } | undefined)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <h1 className="text-3xl font-medium">업데이트 센터</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-mute">
        품목코드로 비교합니다. 승인 전에는 운영 재고가 바뀌지 않고, 파일에 없는 품목은 자동으로 지우지 않습니다. 사진, 하자, 판매가, 예약, 제안서는 엑셀이 덮지 않습니다.
      </p>
      <div className="mt-4"><Flash error={raw.error} ok={raw.ok} /></div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <a className="border border-line px-3 py-2" href="/templates/full-sync.xlsx">전체 동기화 템플릿</a>
        <a className="border border-line px-3 py-2" href="/templates/delta.xlsx">변경분 템플릿</a>
      </div>
      {canImport(user.role) ? (
        <form action={uploadExcel} className="mt-6 flex flex-wrap items-end gap-3 border border-line p-4">
          <label className="text-sm">방식
            <select name="mode" className="mt-1 block border border-line px-2 py-2">
              <option value="full">전체 동기화</option>
              <option value="delta">변경분</option>
            </select>
          </label>
          <label className="text-sm">엑셀
            <input name="file" type="file" accept=".xlsx,.xls,.csv" required className="mt-1 block text-sm" />
          </label>
          <button className="bg-filament px-4 py-2 text-sm text-white" type="submit">비교하기</button>
        </form>
      ) : null}
      {job ? (
        <section className="mt-8">
          <h2 className="text-lg">{job.filename} · {job.mode} · {job.status}</h2>
          <p className="mt-1 text-sm text-mute">{job.summary_json}</p>
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {TABS.map(([key, label]) => (
              <a key={key} href={`/app/import?job=${job.id}&tab=${key}`} className={`shrink-0 border px-3 py-2 text-sm ${tab === key ? "border-filament bg-filament text-white" : "border-line"}`}>{label}</a>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-mute"><th className="py-2">코드</th><th>설명</th><th>이전</th><th>이후</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.action}-${row.code}-${row.message}`} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-medium">{row.code || "-"}</td>
                    <td className="py-2 pr-3">{row.message}</td>
                    <td className="py-2 pr-3 text-xs text-mute">{row.before_json}</td>
                    <td className="py-2 text-xs">{row.after_json}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <p className="py-4 text-sm text-mute">이 구분에는 행이 없습니다.</p> : null}
          </div>
          {approval?.status === "pending" && canApprove(user.role) ? (
            <form action={decide} className="mt-4">
              <input type="hidden" name="id" value={approval.id} />
              <input type="hidden" name="accept" value="1" />
              <button className="bg-filament px-4 py-2 text-sm text-white" type="submit">이 비교를 승인하고 반영</button>
            </form>
          ) : null}
          {job.status === "approved" && canApprove(user.role) ? (
            <form action={rollbackJob} className="mt-3">
              <input type="hidden" name="jobId" value={job.id} />
              <button className="border border-ink px-3 py-2 text-sm" type="submit">이 반영 되돌리기</button>
            </form>
          ) : null}
        </section>
      ) : <p className="mt-8 text-sm text-mute">아직 올린 파일이 없습니다.</p>}
    </div>
  );
}
