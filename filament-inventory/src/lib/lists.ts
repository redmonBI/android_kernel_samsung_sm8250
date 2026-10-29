import type { Sql } from "./db";
import { audit, now, uid } from "./db";

export function offerPrice(db: Sql, productId: string): number {
  const row = db
    .prepare(
      `SELECT i.sell_price AS sell_price, pri.promo_price AS promo_price
       FROM inventory_items i
       LEFT JOIN promotion_items pri ON pri.product_id = i.product_id
         AND pri.promotion_id = (SELECT id FROM promotions WHERE active = 1 ORDER BY ends_on DESC LIMIT 1)
       WHERE i.product_id = ?`,
    )
    .get(productId) as { sell_price: number; promo_price: number | null } | undefined;
  if (!row) throw new Error("품목을 찾지 못했습니다.");
  return row.promo_price ?? row.sell_price;
}

export function activeList(db: Sql, userId: string) {
  const found = db
    .prepare("SELECT * FROM saved_lists WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1")
    .get(userId) as { id: string } | undefined;
  if (found) return found.id;
  const stamp = now();
  const id = uid();
  db.prepare(
    `INSERT INTO saved_lists (
      id, user_id, name, project_name, customer, purpose, need_by, status, share_token,
      created_at, updated_at, created_by, updated_by, version
    ) VALUES (?, ?, '선택 목록', '', '', '', NULL, 'active', ?, ?, ?, ?, ?, 1)`,
  ).run(id, userId, uid(), stamp, stamp, userId, userId);
  return id;
}

export function listItems(db: Sql, listId: string) {
  return db
    .prepare(
      `SELECT sli.id, sli.qty, sli.unit_price, sli.note, p.id AS product_id, p.code, p.name, p.slug, p.is_sample,
              (i.erp_qty - i.reserved_qty - i.outbound_qty - i.defect_qty - i.quarantine_qty) AS available_qty,
              img.path AS image_path
       FROM saved_list_items sli
       JOIN products p ON p.id = sli.product_id
       JOIN inventory_items i ON i.product_id = p.id
       LEFT JOIN product_images img ON img.id = (
         SELECT id FROM product_images WHERE product_id = p.id AND kind = 'normal' ORDER BY sort_order LIMIT 1
       )
       WHERE sli.list_id = ?
       ORDER BY p.code`,
    )
    .all(listId) as {
    id: string;
    qty: number;
    unit_price: number;
    note: string;
    product_id: string;
    code: string;
    name: string;
    slug: string;
    is_sample: number;
    available_qty: number;
    image_path: string | null;
  }[];
}

export function toggleListItem(db: Sql, userId: string, productId: string, select: boolean): void {
  const listId = activeList(db, userId);
  const existing = db.prepare("SELECT id FROM saved_list_items WHERE list_id = ? AND product_id = ?").get(listId, productId) as
    | { id: string }
    | undefined;
  if (!select && existing) {
    db.prepare("DELETE FROM saved_list_items WHERE id = ?").run(existing.id);
    return;
  }
  if (select && !existing) {
    const stamp = now();
    db.prepare(
      `INSERT INTO saved_list_items (
        id, list_id, product_id, qty, unit_price, note, created_at, updated_at, created_by, updated_by, version
      ) VALUES (?, ?, ?, 1, ?, '', ?, ?, ?, ?, 1)`,
    ).run(uid(), listId, productId, offerPrice(db, productId), stamp, stamp, userId, userId);
  }
  db.prepare("UPDATE saved_lists SET updated_at = ?, version = version + 1 WHERE id = ?").run(now(), listId);
}

export function createProposal(db: Sql, userId: string): string {
  const listId = activeList(db, userId);
  const list = db.prepare("SELECT * FROM saved_lists WHERE id = ?").get(listId) as {
    project_name: string;
    customer: string;
    purpose: string;
  };
  const items = listItems(db, listId);
  if (items.length === 0) throw new Error("선택 목록이 비어 있습니다.");
  const stamp = now();
  const id = uid();
  const sample = items.some((item) => item.is_sample === 1);
  db.prepare(
    `INSERT INTO proposals (
      id, user_id, list_id, title, customer, project_name, intro_text, terms_text, status,
      created_at, updated_at, created_by, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, 1)`,
  ).run(
    id,
    userId,
    listId,
    list.project_name || "조명 제안서",
    list.customer,
    list.project_name,
    sample
      ? "아래 품목과 금액은 검토용 예시가 포함될 수 있습니다. 거래처에 보내기 전에 문구와 단가를 확인해 주세요."
      : "요청하신 현장에 맞춰 제품을 추렸습니다. 수량과 납기는 확정 전 재고를 다시 확인합니다.",
    "본 제안의 금액은 판매가이며 구매원가는 포함하지 않습니다. 인쇄 화면에서 PDF로 저장해 전달할 수 있습니다.",
    stamp,
    stamp,
    userId,
    userId,
  );
  items.forEach((item, index) => {
    db.prepare(
      `INSERT INTO proposal_items (
        id, proposal_id, product_id, code, name, qty, unit_price, description, sort_order, is_sample,
        created_at, updated_at, created_by, updated_by, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      uid(),
      id,
      item.product_id,
      item.code,
      item.name,
      item.qty,
      item.unit_price,
      item.note || item.name,
      index,
      item.is_sample,
      stamp,
      stamp,
      userId,
      userId,
    );
  });
  audit(db, userId, "proposal.create", "proposal", id, null, { items: items.length });
  return id;
}
