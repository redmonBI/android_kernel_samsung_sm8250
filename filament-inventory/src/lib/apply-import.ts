import type { Sql } from "./db";
import { audit, now, uid } from "./db";
import { codeToSlug } from "./format";
import type { DiffRow, ExistingProduct, ImportMode, ImportRecord } from "./importer";
import { diffImport, summarizeDiff } from "./importer";

type JobRow = {
  id: string;
  code: string;
  action: string;
  before_json: string | null;
  after_json: string | null;
  include_row: number;
};

export function loadExisting(db: Sql): ExistingProduct[] {
  return db
    .prepare(
      `SELECT p.code AS code, p.name AS name, p.item_class AS itemClass, p.grade AS grade,
              p.stock_class AS stockClass, p.spec AS spec, p.watt AS watt, p.color_temp AS colorTemp,
              p.beam_angle AS angle, p.size_text AS size, p.manufacturer AS manufacturer,
              i.erp_qty AS qty, i.unit_cost AS unitCost, COALESCE(d.name, '') AS department,
              p.plan_text AS plan, i.sell_price AS sellPrice
       FROM products p
       JOIN inventory_items i ON i.product_id = p.id
       LEFT JOIN departments d ON d.id = p.department_id
       WHERE p.deleted_at IS NULL`,
    )
    .all() as ExistingProduct[];
}

function categoryIdFor(db: Sql, itemClass: string): string {
  const mapped = db
    .prepare(
      `SELECT category_id FROM category_mappings
       WHERE ? LIKE '%' || source_value || '%'
       ORDER BY length(source_value) DESC LIMIT 1`,
    )
    .get(itemClass) as { category_id: string } | undefined;
  if (mapped) return mapped.category_id;
  const fallback = db.prepare("SELECT id FROM categories WHERE slug = 'etc'").get() as { id: string };
  return fallback.id;
}

function departmentId(db: Sql, name: string, userId: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const found = db.prepare("SELECT id FROM departments WHERE name = ?").get(trimmed) as { id: string } | undefined;
  if (found) return found.id;
  const id = uid();
  const stamp = now();
  db.prepare(
    `INSERT INTO departments (id, name, created_at, updated_at, created_by, updated_by, version)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  ).run(id, trimmed, stamp, stamp, userId, userId);
  return id;
}

export function createImportJob(db: Sql, userId: string, mode: ImportMode, filename: string, incoming: ImportRecord[]): string {
  const existing = loadExisting(db);
  const diffs = diffImport(mode, incoming, existing);
  const summary = summarizeDiff(diffs);
  const jobId = uid();
  const stamp = now();
  const approvalId = uid();
  db.prepare(
    `INSERT INTO import_jobs (
      id, mode, filename, status, summary_json, created_at, updated_at, created_by, updated_by, version
    ) VALUES (?, ?, ?, 'preview', ?, ?, ?, ?, ?, 1)`,
  ).run(jobId, mode, filename, JSON.stringify(summary), stamp, stamp, userId, userId);
  const insertRow = db.prepare(
    `INSERT INTO import_job_rows (id, job_id, code, action, before_json, after_json, message, include_row, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  for (const diff of diffs) {
    insertRow.run(
      uid(),
      jobId,
      diff.code,
      diff.action,
      diff.before ? JSON.stringify(diff.before) : null,
      diff.after ? JSON.stringify(diff.after) : null,
      diff.message,
      stamp,
    );
  }
  db.prepare(
    `INSERT INTO approval_requests (
      id, kind, entity_id, status, payload_json, requested_by, created_at, updated_at, version
    ) VALUES (?, 'import', ?, 'pending', ?, ?, ?, ?, 1)`,
  ).run(approvalId, jobId, JSON.stringify(summary), userId, stamp, stamp);
  audit(db, userId, "import.preview", "import_job", jobId, null, summary);
  return jobId;
}

function insertProduct(db: Sql, userId: string, incoming: ImportRecord): void {
  const stamp = now();
  const productId = uid();
  const slug = uniqueSlug(db, codeToSlug(incoming.code));
  const grade = ["A", "B", "C", "D"].includes(incoming.grade) ? incoming.grade : "C";
  db.prepare(
    `INSERT INTO products (
      id, slug, code, name, spec, category_id, manufacturer, watt, color_temp, beam_angle, size_text, finish, options_text,
      grade, stock_class, item_class, physical_status, work_status, sales_priority, priority_reason, published, featured,
      public_url, year_occurred, last_in, last_out, department_id, owner_name, plan_text, is_sample, deleted_at,
      created_at, updated_at, created_by, updated_by, version
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, '정상', '판매가능', '일반', '', 1, 0,
      ?, NULL, NULL, NULL, ?, '', ?, 0, NULL, ?, ?, ?, ?, 1
    )`,
  ).run(
    productId,
    slug,
    incoming.code,
    incoming.name,
    incoming.spec,
    categoryIdFor(db, incoming.itemClass),
    incoming.manufacturer,
    incoming.watt,
    incoming.colorTemp,
    incoming.angle,
    incoming.size,
    grade,
    incoming.stockClass,
    incoming.itemClass,
    `/products/${slug}`,
    departmentId(db, incoming.department, userId),
    incoming.plan,
    stamp,
    stamp,
    userId,
    userId,
  );
  db.prepare(
    `INSERT INTO inventory_items (
      id, product_id, erp_qty, reserved_qty, outbound_qty, defect_qty, quarantine_qty, unit_cost, sell_price,
      created_at, updated_at, created_by, updated_by, version
    ) VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(uid(), productId, incoming.qty ?? 0, incoming.unitCost ?? 0, incoming.unitCost ?? 0, stamp, stamp, userId, userId);
}

function uniqueSlug(db: Sql, base: string): string {
  let slug = base || "item";
  let n = 2;
  while (db.prepare("SELECT 1 FROM products WHERE slug = ?").get(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function applyUpdate(db: Sql, userId: string, before: ExistingProduct, incoming: ImportRecord): void {
  const stamp = now();
  const grade = ["A", "B", "C", "D"].includes(incoming.grade) ? incoming.grade : before.grade;
  const dept = incoming.department ? departmentId(db, incoming.department, userId) : null;
  const category = incoming.itemClass ? categoryIdFor(db, incoming.itemClass) : null;
  db.prepare(
    `UPDATE products SET
      name = ?, spec = ?, manufacturer = ?, watt = ?, color_temp = ?, beam_angle = ?, size_text = ?,
      grade = ?, stock_class = ?, item_class = CASE WHEN ? = '' THEN item_class ELSE ? END,
      plan_text = CASE WHEN ? = '' THEN plan_text ELSE ? END,
      department_id = COALESCE(?, department_id),
      category_id = COALESCE(?, category_id),
      is_sample = 0, updated_at = ?, updated_by = ?, version = version + 1
     WHERE code = ? AND deleted_at IS NULL`,
  ).run(
    incoming.name,
    incoming.spec,
    incoming.manufacturer,
    incoming.watt,
    incoming.colorTemp,
    incoming.angle,
    incoming.size,
    grade,
    incoming.stockClass,
    incoming.itemClass,
    incoming.itemClass,
    incoming.plan,
    incoming.plan,
    dept,
    category,
    stamp,
    userId,
    incoming.code,
  );
  db.prepare(
    `UPDATE inventory_items SET erp_qty = ?, unit_cost = ?, updated_at = ?, updated_by = ?, version = version + 1
     WHERE product_id = (SELECT id FROM products WHERE code = ?)`,
  ).run(incoming.qty ?? before.qty, incoming.unitCost ?? before.unitCost, stamp, userId, incoming.code);
}

export function applyImportTx(db: Sql, jobId: string, userId: string): void {
  const job = db.prepare("SELECT status FROM import_jobs WHERE id = ?").get(jobId) as { status: string } | undefined;
  if (!job) throw new Error("반영할 엑셀 작업을 찾지 못했습니다.");
  if (job.status !== "preview") throw new Error("이미 처리된 엑셀 작업입니다.");
  const rows = db
    .prepare("SELECT * FROM import_job_rows WHERE job_id = ? AND include_row = 1")
    .all(jobId) as JobRow[];
  for (const row of rows) {
    if (row.action === "error" || row.action === "unchanged") continue;
    const after = row.after_json ? (JSON.parse(row.after_json) as ImportRecord) : null;
    const before = row.before_json ? (JSON.parse(row.before_json) as ExistingProduct) : null;
    if (row.action === "add" && after) insertProduct(db, userId, after);
    if (row.action === "update" && after && before) applyUpdate(db, userId, before, after);
    if (row.action === "delete_candidate" && before) {
      const product = db.prepare("SELECT id FROM products WHERE code = ? AND deleted_at IS NULL").get(before.code) as
        | { id: string }
        | undefined;
      if (!product) continue;
      const pending = db
        .prepare("SELECT id FROM delete_requests WHERE product_id = ? AND status = 'candidate'")
        .get(product.id);
      if (!pending) {
        const stamp = now();
        db.prepare(
          `INSERT INTO delete_requests (
            id, product_id, import_job_id, status, reason, created_at, updated_at, created_by, updated_by, version
          ) VALUES (?, ?, ?, 'candidate', ?, ?, ?, ?, ?, 1)`,
        ).run(uid(), product.id, jobId, "엑셀에 없거나 삭제 요청이 있습니다. 자동으로 지우지 않았습니다.", stamp, stamp, userId, userId);
      }
    }
  }
  const stamp = now();
  db.prepare(
    `UPDATE import_jobs SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ?, updated_by = ?, version = version + 1
     WHERE id = ?`,
  ).run(userId, stamp, stamp, userId, jobId);
  audit(db, userId, "import.apply", "import_job", jobId, null, { status: "approved" });
}

export function rollbackImportTx(db: Sql, jobId: string, userId: string): void {
  const job = db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(jobId) as { status: string; approved_at: string | null } | undefined;
  if (!job || job.status !== "approved") throw new Error("승인된 작업만 되돌릴 수 있습니다.");
  const newer = db
    .prepare("SELECT id FROM import_jobs WHERE status = 'approved' AND approved_at > ? LIMIT 1")
    .get(job.approved_at);
  if (newer) throw new Error("이후에 반영된 엑셀이 있어 이 작업만 되돌릴 수 없습니다.");
  const rows = db.prepare("SELECT * FROM import_job_rows WHERE job_id = ?").all(jobId) as JobRow[];
  for (const row of rows) {
    const before = row.before_json ? (JSON.parse(row.before_json) as ExistingProduct) : null;
    if (row.action === "update" && before) {
      db.prepare(
        `UPDATE products SET name=?, spec=?, manufacturer=?, watt=?, color_temp=?, beam_angle=?, size_text=?,
          grade=?, stock_class=?, item_class=?, plan_text=?, updated_at=?, updated_by=?, version=version+1
         WHERE code=?`,
      ).run(
        before.name,
        before.spec,
        before.manufacturer,
        before.watt,
        before.colorTemp,
        before.angle,
        before.size,
        before.grade,
        before.stockClass,
        before.itemClass,
        before.plan,
        now(),
        userId,
        before.code,
      );
      db.prepare(
        `UPDATE inventory_items SET erp_qty=?, unit_cost=?, updated_at=?, updated_by=?, version=version+1
         WHERE product_id = (SELECT id FROM products WHERE code=?)`,
      ).run(before.qty, before.unitCost, now(), userId, before.code);
    }
    if (row.action === "add") {
      const product = db.prepare("SELECT id FROM products WHERE code = ?").get(row.code) as { id: string } | undefined;
      if (!product) continue;
      const blocked = db
        .prepare("SELECT id FROM reservations WHERE product_id = ? AND status = 'approved'")
        .get(product.id);
      if (blocked) throw new Error(`${row.code}은 승인된 예약이 있어 되돌리지 못했습니다.`);
      db.prepare("UPDATE products SET deleted_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(
        now(),
        now(),
        userId,
        product.id,
      );
    }
  }
  db.prepare("UPDATE delete_requests SET status = 'cancelled', updated_at = ?, decided_by = ? WHERE import_job_id = ? AND status = 'candidate'").run(
    now(),
    userId,
    jobId,
  );
  db.prepare("UPDATE import_jobs SET status = 'rolled_back', updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(
    now(),
    userId,
    jobId,
  );
  audit(db, userId, "import.rollback", "import_job", jobId, { status: "approved" }, { status: "rolled_back" });
}

export type { DiffRow };
