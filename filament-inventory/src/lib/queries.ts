import type { Sql } from "./db";
import { seoulMonthStart } from "./inventory";
import type { CatalogSource } from "./serialize";

export type CatalogFilters = {
  q?: string;
  category?: string;
  grade?: string;
  physical?: string;
  work?: string;
  department?: string;
  priority?: string;
  year?: string;
  promo?: boolean;
  noimage?: boolean;
  noowner?: boolean;
  noplan?: boolean;
  defect?: boolean;
  minQty?: number;
  maxQty?: number;
  minAmount?: number;
  maxAmount?: number;
  sort?: string;
  page?: number;
  pageSize?: number;
  publishedOnly?: boolean;
  includeDeleted?: boolean;
};

const SORTS: Record<string, string> = {
  amount: "stock_amount DESC, p.code ASC",
  available: "available_qty DESC, p.code ASC",
  code: "p.code COLLATE NOCASE ASC",
  grade: "p.grade ASC, p.code ASC",
  newest: "p.created_at DESC",
};

const SELECT = `
  p.id, p.slug, p.code, p.name, p.spec,
  c.name AS category_name, c.slug AS category_slug,
  p.manufacturer, p.watt, p.color_temp, p.beam_angle, p.size_text, p.finish, p.options_text,
  p.grade, p.physical_status, p.work_status, p.sales_priority, p.priority_reason,
  (i.erp_qty - i.reserved_qty - i.outbound_qty - i.defect_qty - i.quarantine_qty) AS available_qty,
  i.erp_qty, i.reserved_qty, i.outbound_qty, i.defect_qty, i.quarantine_qty,
  i.unit_cost, i.sell_price,
  pri.promo_price AS promo_price, pr.name AS promo_name, pr.ends_on AS promo_ends, pri.remaining_qty AS promo_remaining,
  d.name AS department_name, p.owner_name,
  img.path AS image_path,
  (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id AND pi.kind = 'normal') AS image_count,
  (SELECT COUNT(*) FROM defects df WHERE df.product_id = p.id) AS defect_count,
  p.plan_text, p.is_sample, p.year_occurred, p.last_in, p.last_out,
  (i.erp_qty * i.unit_cost) AS stock_amount,
  p.public_url, p.featured
`;

const FROM = `
  FROM products p
  JOIN inventory_items i ON i.product_id = p.id
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN promotion_items pri ON pri.product_id = p.id
    AND pri.promotion_id = (SELECT id FROM promotions WHERE active = 1 ORDER BY ends_on DESC LIMIT 1)
  LEFT JOIN promotions pr ON pr.id = pri.promotion_id
  LEFT JOIN product_images img ON img.id = (
    SELECT id FROM product_images WHERE product_id = p.id AND kind = 'normal' ORDER BY sort_order, id LIMIT 1
  )
`;

function whereOf(filters: CatalogFilters): { sql: string; params: unknown[] } {
  const where = ["1 = 1"];
  const params: unknown[] = [];
  if (!filters.includeDeleted) where.push("p.deleted_at IS NULL");
  if (filters.publishedOnly) where.push("p.published = 1");
  if (filters.q) {
    where.push("(p.code LIKE ? OR p.name LIKE ? OR p.spec LIKE ? OR p.manufacturer LIKE ?)");
    const like = `%${filters.q.trim()}%`;
    params.push(like, like, like, like);
  }
  if (filters.category) {
    where.push("c.slug = ?");
    params.push(filters.category);
  }
  if (filters.grade) {
    where.push("p.grade = ?");
    params.push(filters.grade);
  }
  if (filters.physical) {
    where.push("p.physical_status = ?");
    params.push(filters.physical);
  }
  if (filters.work) {
    where.push("p.work_status = ?");
    params.push(filters.work);
  }
  if (filters.department) {
    where.push("p.department_id = ?");
    params.push(filters.department);
  }
  if (filters.priority) {
    where.push("p.sales_priority = ?");
    params.push(filters.priority);
  }
  if (filters.year) {
    where.push("p.year_occurred = ?");
    params.push(Number(filters.year));
  }
  if (filters.promo) where.push("pri.promo_price IS NOT NULL");
  if (filters.noimage) where.push("img.id IS NULL");
  if (filters.noowner) where.push("(p.department_id IS NULL OR p.owner_name = '')");
  if (filters.noplan) where.push("p.plan_text = ''");
  if (filters.defect) where.push("(p.physical_status = '하자' OR i.defect_qty > 0)");
  if (filters.minQty !== undefined) {
    where.push("(i.erp_qty - i.reserved_qty - i.outbound_qty - i.defect_qty - i.quarantine_qty) >= ?");
    params.push(filters.minQty);
  }
  if (filters.maxQty !== undefined) {
    where.push("(i.erp_qty - i.reserved_qty - i.outbound_qty - i.defect_qty - i.quarantine_qty) <= ?");
    params.push(filters.maxQty);
  }
  if (filters.minAmount !== undefined) {
    where.push("(i.erp_qty * i.unit_cost) >= ?");
    params.push(filters.minAmount);
  }
  if (filters.maxAmount !== undefined) {
    where.push("(i.erp_qty * i.unit_cost) <= ?");
    params.push(filters.maxAmount);
  }
  return { sql: where.join(" AND "), params };
}

export function listProducts(db: Sql, filters: CatalogFilters): { rows: CatalogSource[]; total: number; amount: number } {
  const { sql, params } = whereOf(filters);
  const sort = SORTS[filters.sort ?? "amount"] ?? SORTS.amount;
  const pageSize = filters.pageSize ?? 20;
  const page = Math.max(1, filters.page ?? 1);
  const totalRow = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(i.erp_qty * i.unit_cost), 0) AS amount ${FROM} WHERE ${sql}`).get(...params) as {
    total: number;
    amount: number;
  };
  const rows = db
    .prepare(`SELECT ${SELECT} ${FROM} WHERE ${sql} ORDER BY ${sort} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as CatalogSource[];
  return { rows, total: totalRow.total, amount: totalRow.amount };
}

export function getProduct(db: Sql, slug: string): CatalogSource | undefined {
  return db.prepare(`SELECT ${SELECT} ${FROM} WHERE p.slug = ?`).get(slug) as CatalogSource | undefined;
}

export function dashboardTotals(db: Sql) {
  const totals = db
    .prepare(
      `SELECT
        COALESCE(SUM(i.erp_qty * i.unit_cost), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN p.department_id IS NULL THEN i.erp_qty * i.unit_cost ELSE 0 END), 0) AS unassigned_amount,
        COALESCE(SUM(CASE WHEN p.plan_text = '' THEN i.erp_qty * i.unit_cost ELSE 0 END), 0) AS noplan_amount,
        COALESCE(SUM(i.outbound_qty * i.unit_cost), 0) AS outbound_amount
       FROM products p
       JOIN inventory_items i ON i.product_id = p.id
       WHERE p.deleted_at IS NULL`,
    )
    .get() as {
    total_amount: number;
    unassigned_amount: number;
    noplan_amount: number;
    outbound_amount: number;
  };
  const reduction = db
    .prepare(
      `SELECT COALESCE(SUM(s.qty * i.unit_cost), 0) AS amount
       FROM shipments s
       JOIN inventory_items i ON i.product_id = s.product_id
       WHERE s.status = 'shipped' AND s.shipped_at >= ?`,
    )
    .get(seoulMonthStart().toISOString()) as { amount: number };
  const ages = db
    .prepare(
      `SELECT p.year_occurred AS year, COALESCE(SUM(i.erp_qty * i.unit_cost), 0) AS amount
       FROM products p JOIN inventory_items i ON i.product_id = p.id
       WHERE p.deleted_at IS NULL
       GROUP BY p.year_occurred
       ORDER BY p.year_occurred`,
    )
    .all() as { year: number | null; amount: number }[];
  return { ...totals, reduction_amount: reduction.amount, ages };
}

export function sampleProductCount(db: Sql): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM products WHERE is_sample = 1 AND deleted_at IS NULL").get() as { count: number };
  return row.count;
}
