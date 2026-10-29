import fs from "fs";
import os from "os";
import path from "path";
import * as XLSX from "xlsx";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createImportJob, loadExisting } from "@/lib/apply-import";
import { openDatabase, type Sql } from "@/lib/db";
import { selectionCsv } from "@/lib/format";
import { availableQty, stockAmount } from "@/lib/inventory";
import { assertSafeSpreadsheet, diffImport, parseWorkbook, type ImportRecord } from "@/lib/importer";
import { canSeeCost } from "@/lib/permissions";
import { dashboardTotals, listProducts } from "@/lib/queries";
import { seedDemo } from "@/lib/seed";
import { toClientProduct, type CatalogSource } from "@/lib/serialize";
import { decideApproval, requestReservation, restoreProduct, softDeleteProduct } from "@/lib/workflow";

let db: Sql;
let file: string;

beforeAll(() => {
  file = path.join(os.tmpdir(), `filament-${process.pid}.db`);
  fs.rmSync(file, { force: true });
  db = openDatabase(file);
  seedDemo(db);
});

afterAll(() => {
  db.close();
  fs.rmSync(file, { force: true });
});

function adminId() {
  return (db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string }).id;
}

describe("재고 계산", () => {
  it("판매 가능 수량을 예약·출고·하자·격리만큼 뺀다", () => {
    expect(availableQty({ erpQty: 10, reservedQty: 3, outboundQty: 2, defectQty: 1, quarantineQty: 1 })).toBe(3);
    expect(stockAmount(4, 2500)).toBe(10000);
  });

  it("대시보드 총액과 목록 합계가 같다", () => {
    const totals = dashboardTotals(db);
    const listed = listProducts(db, { page: 1, pageSize: 5, sort: "amount" });
    expect(listed.amount).toBe(totals.total_amount);
    expect(listed.total).toBeGreaterThan(20);
  });
});

describe("권한", () => {
  it("구매원가는 허용된 역할의 응답에만 있다", () => {
    const row = listProducts(db, { pageSize: 1 }).rows[0] as CatalogSource;
    const sales = JSON.parse(JSON.stringify(toClientProduct(row, "sales"))) as Record<string, unknown>;
    const finance = JSON.parse(JSON.stringify(toClientProduct(row, "finance_viewer"))) as Record<string, unknown>;
    const guest = JSON.parse(JSON.stringify(toClientProduct(row, "public"))) as Record<string, unknown>;
    expect(canSeeCost("sales")).toBe(false);
    expect(sales.unitCost).toBeUndefined();
    expect(sales.stockAmount).toBeUndefined();
    expect(sales.erpQty).toBe(row.erp_qty);
    expect(finance.unitCost).toBe(row.unit_cost);
    expect(guest.erpQty).toBeUndefined();
    expect(guest.sellPrice).toBeUndefined();
  });
});

describe("엑셀", () => {
  it("금액이 재고 곱하기 단가와 다르면 오류로 구분한다", () => {
    const current = loadExisting(db);
    const incoming: ImportRecord[] = [
      {
        code: "NEW-001",
        name: "새 제품",
        itemClass: "다운라이트",
        grade: "B",
        stockClass: "장기재고",
        spec: "",
        watt: "",
        colorTemp: "",
        angle: "",
        size: "",
        manufacturer: "",
        qty: 2,
        unitCost: 1000,
        amount: 9999,
        department: "",
        plan: "",
        history: "",
        action: "",
      },
    ];
    const diffs = diffImport("full", incoming, current);
    expect(diffs.find((row) => row.code === "NEW-001")?.action).toBe("error");
    expect(diffs.filter((row) => row.action === "delete_candidate").length).toBe(current.length);
  });

  it("승인 전에는 재고가 그대로이고, 반영 후에도 사진과 판매가를 지우지 않는다", () => {
    const existing = loadExisting(db)[0]!;
    const sell = (db.prepare("SELECT sell_price FROM inventory_items WHERE product_id = (SELECT id FROM products WHERE code = ?)").get(existing.code) as { sell_price: number }).sell_price;
    const images = (db.prepare("SELECT COUNT(*) AS count FROM product_images").get() as { count: number }).count;
    const sheet = XLSX.utils.json_to_sheet([
      {
        품목코드: existing.code,
        품명: existing.name,
        품목구분: existing.itemClass,
        등급: existing.grade,
        재고구분: existing.stockClass,
        규격: existing.spec,
        "적용 W": existing.watt,
        "색온도및 연색성": existing.colorTemp,
        각도: existing.angle,
        사이즈: existing.size,
        제조사: existing.manufacturer,
        재고: existing.qty + 4,
        단가: existing.unitCost,
        금액: (existing.qty + 4) * existing.unitCost,
        "관련 부서": existing.department,
        "소진 방안 및 일정 계획": existing.plan,
        처리구분: "UPDATE",
      },
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "전체 목록");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseWorkbook(buffer);
    expect(parsed.rows[0]?.qty).toBe(existing.qty + 4);
    const qtyBefore = (db.prepare("SELECT erp_qty FROM inventory_items WHERE product_id = (SELECT id FROM products WHERE code = ?)").get(existing.code) as { erp_qty: number }).erp_qty;
    const jobId = createImportJob(db, adminId(), "delta", "sample.xlsx", parsed.rows);
    const qtyDuring = (db.prepare("SELECT erp_qty FROM inventory_items WHERE product_id = (SELECT id FROM products WHERE code = ?)").get(existing.code) as { erp_qty: number }).erp_qty;
    expect(qtyDuring).toBe(qtyBefore);
    const approval = db.prepare("SELECT id FROM approval_requests WHERE kind = 'import' AND entity_id = ? AND status = 'pending'").get(jobId) as { id: string };
    decideApproval(db, approval.id, adminId(), true);
    const after = db.prepare("SELECT i.erp_qty, i.sell_price FROM inventory_items i JOIN products p ON p.id = i.product_id WHERE p.code = ?").get(existing.code) as {
      erp_qty: number;
      sell_price: number;
    };
    expect(after.erp_qty).toBe(existing.qty + 4);
    expect(after.sell_price).toBe(sell);
    expect((db.prepare("SELECT COUNT(*) AS count FROM product_images").get() as { count: number }).count).toBe(images);
  });

  it("매크로 파일을 거부한다", () => {
    const buf = Buffer.concat([Buffer.from("PK"), Buffer.from("vbaProject")]);
    expect(() => assertSafeSpreadsheet("bad.xlsm", buf)).toThrow(/매크로/);
    expect(() => assertSafeSpreadsheet("bad.xlsx", buf)).toThrow(/매크로/);
  });
});

describe("예약과 삭제", () => {
  it("두 예약을 이어서 승인해도 가용수량을 넘지 않는다", () => {
    const product = db.prepare("SELECT id FROM products WHERE deleted_at IS NULL ORDER BY code LIMIT 1 OFFSET 3").get() as { id: string };
    db.prepare("UPDATE inventory_items SET erp_qty = 5, reserved_qty = 0, outbound_qty = 0, defect_qty = 0, quarantine_qty = 0 WHERE product_id = ?").run(product.id);
    const sales = (db.prepare("SELECT id FROM users WHERE role = 'sales'").get() as { id: string }).id;
    const first = requestReservation(db, sales, product.id, 4, "A");
    const second = requestReservation(db, sales, product.id, 4, "B");
    decideApproval(db, first, adminId(), true);
    expect(() => decideApproval(db, second, adminId(), true)).toThrow(/가용수량/);
    const left = db.prepare(
      "SELECT erp_qty - reserved_qty - outbound_qty - defect_qty - quarantine_qty AS available FROM inventory_items WHERE product_id = ?",
    ).get(product.id) as { available: number };
    expect(left.available).toBe(1);
  });

  it("다른 연결이 잠그고 있으면 승인을 막는다", () => {
    const other = openDatabase(file);
    other.pragma("busy_timeout = 80");
    const pending = db.prepare("SELECT id FROM approval_requests WHERE status = 'pending' AND kind = 'reservation' LIMIT 1").get() as { id: string } | undefined;
    expect(pending).toBeTruthy();
    db.exec("BEGIN IMMEDIATE");
    try {
      expect(() => decideApproval(other, pending!.id, adminId(), true)).toThrow(/다른 사용자/);
    } finally {
      db.exec("ROLLBACK");
      other.close();
    }
  });

  it("삭제와 복구가 이력에 남는다", () => {
    const product = db.prepare("SELECT id, code FROM products WHERE code LIKE 'NOIMG%' LIMIT 1").get() as { id: string; code: string };
    softDeleteProduct(db, adminId(), product.id, "테스트");
    const deleted = db.prepare("SELECT deleted_at FROM products WHERE id = ?").get(product.id) as { deleted_at: string | null };
    expect(deleted.deleted_at).toBeTruthy();
    restoreProduct(db, adminId(), product.id);
    const restored = db.prepare("SELECT deleted_at FROM products WHERE id = ?").get(product.id) as { deleted_at: string | null };
    expect(restored.deleted_at).toBeNull();
    const logs = db.prepare("SELECT action FROM audit_logs WHERE entity_id = ? ORDER BY created_at").all(product.id) as { action: string }[];
    expect(logs.map((row) => row.action)).toEqual(expect.arrayContaining(["product.delete", "product.restore"]));
  });
});

describe("ERP 파일", () => {
  it("선택 수량과 파일의 품목코드가 같다", () => {
    const csv = selectionCsv([
      { code: "ULDL-335-A", qty: 2 },
      { code: "ALSL-OPT07", qty: 1 },
    ]);
    expect(csv).toContain("품목코드,수량");
    expect(csv).toContain("ULDL-335-A,2");
    expect(csv).toContain("ALSL-OPT07,1");
  });
});
