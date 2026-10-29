import type { Sql } from "./db";
import { audit, immediate, now, uid } from "./db";
import { availableQty } from "./inventory";
import { applyImportTx, rollbackImportTx } from "./apply-import";

type Approval = {
  id: string;
  kind: string;
  entity_id: string;
  status: string;
  payload_json: string;
};

type Inventory = {
  erp_qty: number;
  reserved_qty: number;
  outbound_qty: number;
  defect_qty: number;
  quarantine_qty: number;
  unit_cost: number;
  sell_price: number;
};

function inventoryOf(db: Sql, productId: string): Inventory {
  const row = db.prepare("SELECT * FROM inventory_items WHERE product_id = ?").get(productId) as Inventory | undefined;
  if (!row) throw new Error("재고 원장을 찾지 못했습니다.");
  return row;
}

export function requestReservation(db: Sql, userId: string, productId: string, qty: number, projectName: string): string {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("예약 수량은 1 이상의 정수여야 합니다.");
  const stamp = now();
  const reservationId = uid();
  const approvalId = uid();
  db.prepare(
    `INSERT INTO reservations (
      id, product_id, user_id, qty, status, project_name, created_at, updated_at, created_by, updated_by, version
    ) VALUES (?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, 1)`,
  ).run(reservationId, productId, userId, qty, projectName, stamp, stamp, userId, userId);
  db.prepare(
    `INSERT INTO approval_requests (
      id, kind, entity_id, status, payload_json, requested_by, created_at, updated_at, version
    ) VALUES (?, 'reservation', ?, 'pending', ?, ?, ?, ?, 1)`,
  ).run(approvalId, reservationId, JSON.stringify({ qty, productId }), userId, stamp, stamp);
  audit(db, userId, "reservation.request", "reservation", reservationId, null, { qty, productId });
  return approvalId;
}

export function requestAdjustment(
  db: Sql,
  userId: string,
  productId: string,
  field: "erp_qty" | "unit_cost",
  value: number,
  reason: string,
): string {
  if (!Number.isInteger(value) || value < 0) throw new Error("수량과 원가는 0 이상의 정수로 입력합니다.");
  if (reason.trim().length < 2) throw new Error("조정 사유를 입력해 주세요.");
  const current = inventoryOf(db, productId);
  const before = field === "erp_qty" ? current.erp_qty : current.unit_cost;
  const stamp = now();
  const id = uid();
  db.prepare(
    `INSERT INTO inventory_adjustments (
      id, product_id, field, before_value, after_value, reason, evidence, status, requested_by,
      created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, '', 'pending', ?, ?, ?, 1)`,
  ).run(id, productId, field, String(before), String(value), reason.trim(), userId, stamp, stamp);
  const approvalId = uid();
  db.prepare(
    `INSERT INTO approval_requests (
      id, kind, entity_id, status, payload_json, requested_by, created_at, updated_at, version
    ) VALUES (?, 'adjustment', ?, 'pending', ?, ?, ?, ?, 1)`,
  ).run(approvalId, id, JSON.stringify({ field, value }), userId, stamp, stamp);
  audit(db, userId, "adjustment.request", "inventory_adjustment", id, { [field]: before }, { [field]: value, reason });
  return approvalId;
}

export function requestShipment(db: Sql, userId: string, productId: string, qty: number): string {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("출고 수량은 1 이상의 정수여야 합니다.");
  const stamp = now();
  const id = uid();
  db.prepare(
    `INSERT INTO shipments (
      id, product_id, user_id, qty, status, shipped_at, created_at, updated_at, created_by, updated_by, version
    ) VALUES (?, ?, ?, ?, 'requested', NULL, ?, ?, ?, ?, 1)`,
  ).run(id, productId, userId, qty, stamp, stamp, userId, userId);
  const approvalId = uid();
  db.prepare(
    `INSERT INTO approval_requests (
      id, kind, entity_id, status, payload_json, requested_by, created_at, updated_at, version
    ) VALUES (?, 'shipment', ?, 'pending', ?, ?, ?, ?, 1)`,
  ).run(approvalId, id, JSON.stringify({ qty }), userId, stamp, stamp);
  audit(db, userId, "shipment.request", "shipment", id, null, { qty });
  return approvalId;
}

export function softDeleteProduct(db: Sql, userId: string, productId: string, reason: string): void {
  const blocked = db
    .prepare("SELECT id FROM reservations WHERE product_id = ? AND status = 'approved'")
    .get(productId) as { id: string } | undefined;
  if (blocked) throw new Error("승인된 예약이 있어 삭제할 수 없습니다. 예약을 먼저 해제해 주세요.");
  const before = db.prepare("SELECT code, deleted_at FROM products WHERE id = ?").get(productId) as
    | { code: string; deleted_at: string | null }
    | undefined;
  if (!before) throw new Error("품목을 찾지 못했습니다.");
  if (before.deleted_at) throw new Error("이미 삭제된 품목입니다.");
  const stamp = now();
  db.prepare("UPDATE products SET deleted_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(
    stamp,
    stamp,
    userId,
    productId,
  );
  db.prepare("UPDATE delete_requests SET status = 'done', decided_by = ?, updated_at = ? WHERE product_id = ? AND status = 'candidate'").run(
    userId,
    stamp,
    productId,
  );
  audit(db, userId, "product.delete", "product", productId, before, { deleted_at: stamp, reason });
}

export function restoreProduct(db: Sql, userId: string, productId: string): void {
  const before = db.prepare("SELECT code, deleted_at FROM products WHERE id = ?").get(productId) as
    | { code: string; deleted_at: string | null }
    | undefined;
  if (!before?.deleted_at) throw new Error("복구할 삭제 품목이 없습니다.");
  const stamp = now();
  db.prepare("UPDATE products SET deleted_at = NULL, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(
    stamp,
    userId,
    productId,
  );
  audit(db, userId, "product.restore", "product", productId, before, { deleted_at: null });
}

export function decideApproval(db: Sql, approvalId: string, userId: string, accept: boolean): void {
  immediate(db, () => {
    const approval = db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(approvalId) as Approval | undefined;
    if (!approval || approval.status !== "pending") throw new Error("이미 처리된 승인입니다.");
    const stamp = now();
    if (!accept) {
      db.prepare("UPDATE approval_requests SET status = 'rejected', decided_by = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(
        userId,
        stamp,
        approvalId,
      );
      if (approval.kind === "reservation") {
        db.prepare("UPDATE reservations SET status = 'rejected', decided_by = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(
          userId,
          stamp,
          approval.entity_id,
        );
      }
      if (approval.kind === "adjustment") {
        db.prepare("UPDATE inventory_adjustments SET status = 'rejected', approved_by = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(
          userId,
          stamp,
          approval.entity_id,
        );
      }
      if (approval.kind === "shipment") {
        db.prepare("UPDATE shipments SET status = 'rejected', updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(
          stamp,
          userId,
          approval.entity_id,
        );
      }
      if (approval.kind === "import") {
        db.prepare("UPDATE import_jobs SET status = 'rejected', updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND status = 'preview'").run(
          stamp,
          userId,
          approval.entity_id,
        );
      }
      audit(db, userId, "approval.reject", approval.kind, approval.entity_id, { status: "pending" }, { status: "rejected" });
      return;
    }

    if (approval.kind === "reservation") {
      const reservation = db.prepare("SELECT * FROM reservations WHERE id = ?").get(approval.entity_id) as
        | { id: string; product_id: string; qty: number; status: string }
        | undefined;
      if (!reservation || reservation.status !== "requested") throw new Error("예약 요청을 찾지 못했습니다.");
      const stock = inventoryOf(db, reservation.product_id);
      const available = availableQty({
        erpQty: stock.erp_qty,
        reservedQty: stock.reserved_qty,
        outboundQty: stock.outbound_qty,
        defectQty: stock.defect_qty,
        quarantineQty: stock.quarantine_qty,
      });
      if (reservation.qty > available) throw new Error("가용수량을 초과해 승인할 수 없습니다.");
      db.prepare(
        "UPDATE inventory_items SET reserved_qty = reserved_qty + ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE product_id = ?",
      ).run(reservation.qty, stamp, userId, reservation.product_id);
      db.prepare("UPDATE reservations SET status = 'approved', decided_by = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(
        userId,
        stamp,
        reservation.id,
      );
    }

    if (approval.kind === "adjustment") {
      const adjustment = db.prepare("SELECT * FROM inventory_adjustments WHERE id = ?").get(approval.entity_id) as
        | { id: string; product_id: string; field: "erp_qty" | "unit_cost"; after_value: string; status: string }
        | undefined;
      if (!adjustment || adjustment.status !== "pending") throw new Error("재고 조정 요청을 찾지 못했습니다.");
      const value = Number(adjustment.after_value);
      if (!Number.isInteger(value) || value < 0) throw new Error("조정 값이 올바르지 않습니다.");
      const column = adjustment.field === "erp_qty" ? "erp_qty" : "unit_cost";
      db.prepare(
        `UPDATE inventory_items SET ${column} = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE product_id = ?`,
      ).run(value, stamp, userId, adjustment.product_id);
      db.prepare(
        "UPDATE inventory_adjustments SET status = 'approved', approved_by = ?, updated_at = ?, version = version + 1 WHERE id = ?",
      ).run(userId, stamp, adjustment.id);
      db.prepare("UPDATE products SET is_sample = 0, updated_at = ? WHERE id = ?").run(stamp, adjustment.product_id);
    }

    if (approval.kind === "shipment") {
      const shipment = db.prepare("SELECT * FROM shipments WHERE id = ?").get(approval.entity_id) as
        | { id: string; product_id: string; qty: number; status: string }
        | undefined;
      if (!shipment || shipment.status !== "requested") throw new Error("출고 요청을 찾지 못했습니다.");
      const stock = inventoryOf(db, shipment.product_id);
      const available = availableQty({
        erpQty: stock.erp_qty,
        reservedQty: stock.reserved_qty,
        outboundQty: stock.outbound_qty,
        defectQty: stock.defect_qty,
        quarantineQty: stock.quarantine_qty,
      });
      if (shipment.qty > available) throw new Error("가용수량을 초과해 출고 예정으로 잡을 수 없습니다.");
      db.prepare(
        "UPDATE inventory_items SET outbound_qty = outbound_qty + ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE product_id = ?",
      ).run(shipment.qty, stamp, userId, shipment.product_id);
      db.prepare("UPDATE shipments SET status = 'scheduled', updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(
        stamp,
        userId,
        shipment.id,
      );
    }

    if (approval.kind === "import") {
      applyImportTx(db, approval.entity_id, userId);
    }

    db.prepare("UPDATE approval_requests SET status = 'approved', decided_by = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(
      userId,
      stamp,
      approvalId,
    );
    audit(db, userId, "approval.accept", approval.kind, approval.entity_id, { status: "pending" }, { status: "approved" });
  });
}

export function rollbackImport(db: Sql, jobId: string, userId: string): void {
  immediate(db, () => rollbackImportTx(db, jobId, userId));
}
