import * as XLSX from "xlsx";

export type ImportMode = "full" | "delta";

export type ImportRecord = {
  code: string;
  name: string;
  itemClass: string;
  grade: string;
  stockClass: string;
  spec: string;
  watt: string;
  colorTemp: string;
  angle: string;
  size: string;
  manufacturer: string;
  qty: number | null;
  unitCost: number | null;
  amount: number | null;
  department: string;
  plan: string;
  history: string;
  action: string;
};

export type ExistingProduct = {
  code: string;
  name: string;
  itemClass: string;
  grade: string;
  stockClass: string;
  spec: string;
  watt: string;
  colorTemp: string;
  angle: string;
  size: string;
  manufacturer: string;
  qty: number;
  unitCost: number;
  department: string;
  plan: string;
  sellPrice: number;
};

export type DiffAction = "add" | "update" | "unchanged" | "delete_candidate" | "error";

export type DiffRow = {
  code: string;
  action: DiffAction;
  message: string;
  before: ExistingProduct | null;
  after: ImportRecord | null;
};

const HEADER_MAP: Record<string, keyof ImportRecord> = {
  품목코드: "code",
  품명: "name",
  품목구분: "itemClass",
  등급: "grade",
  재고구분: "stockClass",
  규격: "spec",
  적용W: "watt",
  색온도및연색성: "colorTemp",
  각도: "angle",
  사이즈: "size",
  제조사: "manufacturer",
  재고: "qty",
  단가: "unitCost",
  금액: "amount",
  관련부서: "department",
  소진방안및일정계획: "plan",
  품목이력: "history",
  처리구분: "action",
};

function cleanHeader(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

export function assertSafeSpreadsheet(filename: string, buffer: Buffer): void {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsm") || lower.endsWith(".xlsb") || lower.endsWith(".xltm")) {
    throw new Error("매크로가 포함될 수 있는 파일은 올릴 수 없습니다.");
  }
  const ext = lower.split(".").pop() ?? "";
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    throw new Error("xlsx, xls, csv 파일만 올릴 수 있습니다.");
  }
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error("파일 크기는 15MB를 넘을 수 없습니다.");
  }
  if (ext === "xlsx") {
    if (buffer.subarray(0, 2).toString("utf8") !== "PK") {
      throw new Error("엑셀 파일 형식이 올바르지 않습니다.");
    }
    if (buffer.includes(Buffer.from("vbaProject"))) {
      throw new Error("매크로가 포함된 파일은 올릴 수 없습니다.");
    }
  }
}

export function parseWorkbook(buffer: Buffer): { sheetName: string; rows: ImportRecord[] } {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName =
    book.SheetNames.find((name) => name.replace(/\s/g, "") === "전체목록") ?? book.SheetNames[0];
  if (!sheetName) throw new Error("시트가 없는 파일입니다.");
  const sheet = book.Sheets[sheetName];
  if (!sheet) throw new Error("시트를 읽지 못했습니다.");
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  const rows = rawRows.map((raw) => {
    const record: ImportRecord = {
      code: "",
      name: "",
      itemClass: "",
      grade: "",
      stockClass: "",
      spec: "",
      watt: "",
      colorTemp: "",
      angle: "",
      size: "",
      manufacturer: "",
      qty: null,
      unitCost: null,
      amount: null,
      department: "",
      plan: "",
      history: "",
      action: "",
    };
    for (const [key, value] of Object.entries(raw)) {
      const mapped = HEADER_MAP[cleanHeader(key)];
      if (!mapped) continue;
      if (mapped === "qty" || mapped === "unitCost" || mapped === "amount") {
        record[mapped] = numberOrNull(value);
      } else if (mapped === "action") {
        record.action = text(value).toUpperCase();
      } else {
        record[mapped] = text(value);
      }
    }
    return record;
  });
  return {
    sheetName,
    rows: rows.filter((row) => row.code || row.name || row.qty !== null),
  };
}

function same(existing: ExistingProduct, incoming: ImportRecord): boolean {
  return (
    existing.name === incoming.name &&
    existing.itemClass === incoming.itemClass &&
    existing.grade === (incoming.grade || existing.grade) &&
    existing.stockClass === incoming.stockClass &&
    existing.spec === incoming.spec &&
    existing.watt === incoming.watt &&
    existing.colorTemp === incoming.colorTemp &&
    existing.angle === incoming.angle &&
    existing.size === incoming.size &&
    existing.manufacturer === incoming.manufacturer &&
    existing.qty === incoming.qty &&
    existing.unitCost === incoming.unitCost &&
    (incoming.department === "" || existing.department === incoming.department) &&
    (incoming.plan === "" || existing.plan === incoming.plan)
  );
}

function validate(row: ImportRecord): string | null {
  if (!row.code) return "품목코드가 없습니다.";
  if (!row.name) return "품명이 없습니다.";
  if (row.qty === null || row.qty < 0) return "재고 수량이 없거나 0보다 작습니다.";
  if (row.unitCost === null || row.unitCost < 0) return "단가가 없거나 0보다 작습니다.";
  if (row.amount !== null && row.amount !== row.qty * row.unitCost) {
    return `금액이 재고×단가와 다릅니다. 파일 ${row.amount.toLocaleString("ko-KR")}원, 계산 ${ (row.qty * row.unitCost).toLocaleString("ko-KR") }원.`;
  }
  if (row.grade && !["A", "B", "C", "D"].includes(row.grade)) return "등급은 A, B, C, D 중 하나여야 합니다.";
  return null;
}

export function diffImport(mode: ImportMode, incoming: ImportRecord[], existing: ExistingProduct[]): DiffRow[] {
  const byCode = new Map(existing.map((row) => [row.code, row]));
  const seen = new Set<string>();
  const diffs: DiffRow[] = [];

  for (const row of incoming) {
    const problem = validate(row);
    if (!row.code) {
      diffs.push({ code: "", action: "error", message: problem ?? "품목코드가 없습니다.", before: null, after: row });
      continue;
    }
    if (seen.has(row.code)) {
      diffs.push({ code: row.code, action: "error", message: "파일 안에서 품목코드가 중복되었습니다.", before: byCode.get(row.code) ?? null, after: row });
      continue;
    }
    seen.add(row.code);
    if (problem) {
      diffs.push({ code: row.code, action: "error", message: problem, before: byCode.get(row.code) ?? null, after: row });
      continue;
    }
    const current = byCode.get(row.code) ?? null;
    if (mode === "delta" && row.action === "DELETE") {
      diffs.push({
        code: row.code,
        action: "delete_candidate",
        message: current ? "삭제 요청으로 보관합니다. 바로 지우지 않습니다." : "없는 품목의 삭제 요청입니다.",
        before: current,
        after: row,
      });
      continue;
    }
    if (!current) {
      diffs.push({ code: row.code, action: "add", message: "새 품목입니다.", before: null, after: row });
      continue;
    }
    if (same(current, row)) {
      diffs.push({ code: row.code, action: "unchanged", message: "변경 없습니다.", before: current, after: row });
    } else {
      diffs.push({ code: row.code, action: "update", message: "값이 변경되었습니다.", before: current, after: row });
    }
  }

  if (mode === "full") {
    for (const current of existing) {
      if (!seen.has(current.code)) {
        diffs.push({
          code: current.code,
          action: "delete_candidate",
          message: "파일에 없습니다. 자동 삭제하지 않고 비활성화 후보로 둡니다.",
          before: current,
          after: null,
        });
      }
    }
  }
  return diffs;
}

export function summarizeDiff(rows: DiffRow[]): Record<DiffAction, number> {
  const summary: Record<DiffAction, number> = {
    add: 0,
    update: 0,
    unchanged: 0,
    delete_candidate: 0,
    error: 0,
  };
  for (const row of rows) summary[row.action] += 1;
  return summary;
}
