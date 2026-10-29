export type QtyFields = {
  erpQty: number;
  reservedQty: number;
  outboundQty: number;
  defectQty: number;
  quarantineQty: number;
};

/** 판매 가능 수량 = ERP 현재수량 - 승인 예약 - 출고예정 - 하자 - 격리 */
export function availableQty(row: QtyFields): number {
  return row.erpQty - row.reservedQty - row.outboundQty - row.defectQty - row.quarantineQty;
}

export function stockAmount(erpQty: number, unitCost: number): number {
  return erpQty * unitCost;
}

export function seoulMonthStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return new Date(`${year}-${month}-01T00:00:00+09:00`);
}

export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

export function ageBucket(year: number | null, now = new Date()): string {
  if (!year) return "연도 없음";
  const current = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" }).format(now),
  );
  const age = current - year;
  if (age <= 0) return "1년 미만";
  if (age === 1) return "1–2년";
  if (age === 2) return "2–3년";
  return "3년 이상";
}
