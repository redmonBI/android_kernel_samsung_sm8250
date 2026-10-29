import fs from "fs";
import path from "path";
import type { Sql } from "./db";
import { audit, now, uid } from "./db";
import { codeToSlug } from "./format";
import { hashPassword } from "./passwords";

type Manifest = {
  products: { code: string; file: string; source: string }[];
  projects: { file: string; source: string; title?: string }[];
};

const CATEGORIES: { slug: string; name: string }[] = [
  { slug: "down", name: "Down Light" },
  { slug: "pendant", name: "Pendant Light" },
  { slug: "spot", name: "Spot & Track Light" },
  { slug: "surface", name: "Surface Mounted Ceiling Light" },
  { slug: "magnetic", name: "Magnetic Light" },
  { slug: "linear", name: "Linear Light" },
  { slug: "outdoor", name: "Outdoor" },
  { slug: "hotel", name: "Hotel" },
  { slug: "office", name: "Office" },
  { slug: "procurement", name: "Procurement" },
  { slug: "etc", name: "Etc" },
];

const NAMES: Record<string, string> = {
  down: "다운라이트",
  pendant: "펜던트",
  spot: "스포트·트랙",
  surface: "천장 직부",
  magnetic: "마그네틱",
  linear: "라인 조명",
  outdoor: "실외 조명",
  hotel: "호텔 조명",
  office: "오피스 조명",
  procurement: "조달 조명",
  etc: "기타 조명",
};

function categoryOf(code: string): string {
  if (code.startsWith("ULDL")) return "down";
  if (code.startsWith("ALSL")) return "spot";
  if (code.startsWith("ALML")) return "magnetic";
  if (code.startsWith("KLPD")) return "linear";
  if (code.startsWith("ALE-")) return "etc";
  if (code.startsWith("ALPD-LS") || code.startsWith("ALPD-ASM")) return "surface";
  if (code.startsWith("ALPD")) return "pendant";
  if (code.startsWith("NOIMG-OUT")) return "outdoor";
  if (code.startsWith("NOIMG-HTL")) return "hotel";
  if (code.startsWith("NOIMG-OFF")) return "office";
  if (code.startsWith("NOIMG-PROC")) return "procurement";
  return "etc";
}

function readManifest(): Manifest {
  const file = path.join(process.cwd(), "data", "asset-manifest.json");
  if (!fs.existsSync(file)) return { products: [], projects: [] };
  return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
}

export function seedIfEmpty(db: Sql): void {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'seeded'").get() as { value: string } | undefined;
  if (row?.value === "1") return;
  seedDemo(db);
}

export function seedDemo(db: Sql): void {
  const stamp = now();
  const password = hashPassword("demo1234");
  const manifest = readManifest();
  const departments = ["영업1팀", "설계팀", "구매지원", "물류", "사업지원"].map((name) => ({ id: uid(), name }));
  const categories = CATEGORIES.map((category, index) => ({ ...category, id: uid(), sort: index + 1 }));
  const categoryId = new Map(categories.map((category) => [category.slug, category.id]));
  const adminId = uid();

  const users: { id: string; email: string; name: string; role: string; department: string | null }[] = [
    { id: adminId, email: "admin@filament.demo", name: "관리자", role: "admin", department: "구매지원" },
    { id: uid(), email: "sales@filament.demo", name: "김영업", role: "sales", department: "영업1팀" },
    { id: uid(), email: "manager@filament.demo", name: "이설계", role: "department_manager", department: "설계팀" },
    { id: uid(), email: "purchase@filament.demo", name: "박구매", role: "purchasing_support", department: "구매지원" },
    { id: uid(), email: "warehouse@filament.demo", name: "최물류", role: "warehouse_manager", department: "물류" },
    { id: uid(), email: "finance@filament.demo", name: "정재무", role: "finance_viewer", department: "사업지원" },
    { id: uid(), email: "approver@filament.demo", name: "한승인", role: "approver", department: "사업지원" },
    { id: uid(), email: "viewer@filament.demo", name: "조회자", role: "viewer", department: "영업1팀" },
  ];

  const pictures = manifest.products.map((item) => ({
    code: item.code,
    file: item.file,
    source: item.source,
  }));
  const extras = [
    { code: "NOIMG-OUT-01", file: "", source: "" },
    { code: "NOIMG-HTL-01", file: "", source: "" },
    { code: "NOIMG-OFF-01", file: "", source: "" },
    { code: "NOIMG-PROC-01", file: "", source: "" },
  ];
  const items = [...pictures, ...extras];
  const qtySet = [12, 40, 8, 120, 6, 55, 18, 90];
  const costSet = [15000, 42000, 8800, 126000, 23000, 67000, 31000, 54000];
  const grades = ["A", "B", "C", "D"];
  const priorities = ["추천", "우선소진", "보류", "일반", "일반", "일반", "추천", "우선소진", "일반"];

  const insert = db.transaction(() => {
    for (const department of departments) {
      db.prepare(
        `INSERT INTO departments (id, name, created_at, updated_at, created_by, updated_by, version)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      ).run(department.id, department.name, stamp, stamp, adminId, adminId);
    }
    const deptId = (name: string | null) => departments.find((department) => department.name === name)?.id ?? null;
    for (const user of users) {
      db.prepare(
        `INSERT INTO users (id, email, name, password_hash, role, department_id, created_at, updated_at, created_by, updated_by, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).run(user.id, user.email, user.name, password, user.role, deptId(user.department), stamp, stamp, adminId, adminId);
    }
    for (const category of categories) {
      db.prepare(
        `INSERT INTO categories (id, slug, name, sort_order, created_at, updated_at, created_by, updated_by, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).run(category.id, category.slug, category.name, category.sort, stamp, stamp, adminId, adminId);
    }
    const mappings = [
      ["다운라이트", "down"],
      ["다운", "down"],
      ["펜던트", "pendant"],
      ["스포트", "spot"],
      ["트랙", "spot"],
      ["직부", "surface"],
      ["마그네틱", "magnetic"],
      ["라인", "linear"],
      ["실외", "outdoor"],
      ["경관", "outdoor"],
      ["호텔", "hotel"],
      ["오피스", "office"],
      ["조달", "procurement"],
      ["기타", "etc"],
    ] as const;
    for (const [source, slug] of mappings) {
      db.prepare(
        `INSERT INTO category_mappings (id, source_value, category_id, created_at, updated_at, created_by, updated_by, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      ).run(uid(), source, categoryId.get(slug), stamp, stamp, adminId, adminId);
    }

    items.forEach((item, index) => {
      const slug = categoryOf(item.code);
      const productId = uid();
      const inventoryId = uid();
      const route = codeToSlug(item.code);
      const qty = qtySet[index % qtySet.length] ?? 10;
      const cost = costSet[index % costSet.length] ?? 10000;
      const sell = Math.round((cost * 1.7) / 100) * 100;
      const grade = grades[index % grades.length] ?? "C";
      const priority = priorities[index % priorities.length] ?? "일반";
      const department = index % 5 === 0 ? null : departments[index % departments.length]!;
      const year = 2021 + (index % 5);
      const hasDefect = index % 11 === 0;
      const review = index % 7 === 0;
      const plan = index % 4 === 0 ? "" : `${year + 1}년까지 프로젝트 전환 또는 프로모션으로 소진`;
      const lastOut = index % 3 === 0 ? null : new Date(Date.UTC(year, 5, 10)).toISOString();
      const name = `${NAMES[slug] ?? "조명"} ${item.code}`;
      db.prepare(
        `INSERT INTO products (
          id, slug, code, name, spec, category_id, manufacturer, watt, color_temp, beam_angle, size_text, finish, options_text,
          grade, stock_class, item_class, physical_status, work_status, sales_priority, priority_reason, published, featured,
          public_url, year_occurred, last_in, last_out, department_id, owner_name, plan_text, is_sample, deleted_at,
          created_at, updated_at, created_by, updated_by, version
        ) VALUES (?, ?, ?, ?, '', ?, '필라멘트코리아', '', '', '', '', '', '', ?, '장기재고', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?, 1)`,
      ).run(
        productId,
        route,
        item.code,
        name,
        categoryId.get(slug),
        grade,
        NAMES[slug] ?? "기타",
        hasDefect ? "하자" : "정상",
        review ? "검토" : "판매가능",
        priority,
        priority === "일반" ? "" : "장기재고 전환을 위해 영업 우선순위를 예시로 표시했습니다.",
        index < 8 ? 1 : 0,
        `/products/${route}`,
        year,
        new Date(Date.UTC(year, 2, 1)).toISOString(),
        lastOut,
        department?.id ?? null,
        "",
        plan,
        stamp,
        stamp,
        adminId,
        adminId,
      );
      db.prepare(
        `INSERT INTO inventory_items (
          id, product_id, erp_qty, reserved_qty, outbound_qty, defect_qty, quarantine_qty, unit_cost, sell_price,
          created_at, updated_at, created_by, updated_by, version
        ) VALUES (?, ?, ?, 0, 0, ?, 0, ?, ?, ?, ?, ?, ?, 1)`,
      ).run(inventoryId, productId, qty, hasDefect ? 2 : 0, cost, sell, stamp, stamp, adminId, adminId);
      if (item.file) {
        db.prepare(
          `INSERT INTO product_images (
            id, product_id, kind, path, alt, source_url, sort_order, created_at, updated_at, created_by, updated_by, version
          ) VALUES (?, ?, 'normal', ?, ?, ?, 0, ?, ?, ?, ?, 1)`,
        ).run(uid(), productId, item.file, `${name} 제품 사진`, item.source, stamp, stamp, adminId, adminId);
      }
      if (hasDefect) {
        db.prepare(
          `INSERT INTO defects (
            id, product_id, image_id, defect_type, affected_qty, description, reporter_name,
            created_at, updated_at, created_by, updated_by, version
          ) VALUES (?, ?, NULL, '긁힘', 2, '예시 하자 기록입니다. 정상 사진과 따로 보관합니다.', '물류', ?, ?, ?, ?, 1)`,
        ).run(uid(), productId, stamp, stamp, adminId, adminId);
      }
      if (plan) {
        db.prepare(
          `INSERT INTO disposition_plans (
            id, product_id, plan, due_on, status, created_at, updated_at, created_by, updated_by, version
          ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 1)`,
        ).run(uid(), productId, plan, `${year + 1}-12-31`, stamp, stamp, adminId, adminId);
      }
    });

    const promoId = uid();
    db.prepare(
      `INSERT INTO promotions (
        id, name, promo_type, description, starts_on, ends_on, active, created_at, updated_at, created_by, updated_by, version
      ) VALUES (?, '장기재고 전환 프로모션', '할인율', '예시 프로모션입니다. 판매가의 20%를 낮춰 보여 줍니다.', '2026-01-01', '2026-12-31', 1, ?, ?, ?, ?, 1)`,
    ).run(promoId, stamp, stamp, adminId, adminId);

    const promoProducts = db
      .prepare(
        `SELECT p.id, i.sell_price, i.erp_qty FROM products p
         JOIN inventory_items i ON i.product_id = p.id
         WHERE p.sales_priority IN ('추천', '우선소진') AND p.deleted_at IS NULL
         LIMIT 6`,
      )
      .all() as { id: string; sell_price: number; erp_qty: number }[];
    for (const product of promoProducts) {
      db.prepare(
        `INSERT INTO promotion_items (
          id, promotion_id, product_id, promo_price, remaining_qty, note, created_at, updated_at, created_by, updated_by, version
        ) VALUES (?, ?, ?, ?, ?, '예시 할인', ?, ?, ?, ?, 1)`,
      ).run(uid(), promoId, product.id, Math.round((product.sell_price * 0.8) / 100) * 100, Math.max(1, Math.floor(product.erp_qty / 2)), stamp, stamp, adminId, adminId);
    }

    const first = db.prepare("SELECT id, code FROM products WHERE deleted_at IS NULL ORDER BY code LIMIT 1").get() as { id: string; code: string };
    const sales = users.find((user) => user.role === "sales")!;
    const reservationId = uid();
    db.prepare(
      `INSERT INTO reservations (
        id, product_id, user_id, qty, status, project_name, created_at, updated_at, created_by, updated_by, version
      ) VALUES (?, ?, ?, 2, 'requested', '예시 프로젝트', ?, ?, ?, ?, 1)`,
    ).run(reservationId, first.id, sales.id, stamp, stamp, sales.id, sales.id);
    db.prepare(
      `INSERT INTO approval_requests (
        id, kind, entity_id, status, payload_json, requested_by, created_at, updated_at, version
      ) VALUES (?, 'reservation', ?, 'pending', ?, ?, ?, ?, 1)`,
    ).run(uid(), reservationId, JSON.stringify({ qty: 2, code: first.code }), sales.id, stamp, stamp);

    const shipped = db.prepare("SELECT id FROM products WHERE deleted_at IS NULL ORDER BY code LIMIT 1 OFFSET 1").get() as { id: string };
    const inv = db.prepare("SELECT unit_cost FROM inventory_items WHERE product_id = ?").get(shipped.id) as { unit_cost: number };
    db.prepare(
      `INSERT INTO shipments (
        id, product_id, user_id, qty, status, shipped_at, created_at, updated_at, created_by, updated_by, version
      ) VALUES (?, ?, ?, 1, 'shipped', ?, ?, ?, ?, ?, 1)`,
    ).run(uid(), shipped.id, adminId, stamp, stamp, stamp, adminId, adminId);
    db.prepare("UPDATE inventory_items SET outbound_qty = 0 WHERE product_id = ?").run(shipped.id);
    void inv;

    db.prepare(
      `INSERT INTO banners (
        id, slot, title, subtitle, image_path, link_url, sort_order, visible, created_at, updated_at, created_by, updated_by, version
      ) VALUES (?, 'home', '상업 조명의 기준을 카탈로그로', '제품 사진으로 고르고, 사내에서는 재고와 제안서까지 이어집니다.', ?, '/products', 1, 1, ?, ?, ?, ?, 1)`,
    ).run(uid(), pictures[8]?.file || pictures[0]?.file || "", stamp, stamp, adminId, adminId);

    manifest.projects.slice(0, 4).forEach((project, index) => {
      db.prepare(
        `INSERT INTO posts (
          id, board, title, body, image_path, visible, created_at, updated_at, created_by, updated_by, version
        ) VALUES (?, 'project', ?, '필라멘트코리아 공개 갤러리에서 가져온 시공 사진입니다.', ?, 1, ?, ?, ?, ?, 1)`,
      ).run(uid(), project.title || `시공 갤러리 ${index + 1}`, project.file, stamp, stamp, adminId, adminId);
    });
    db.prepare(
      `INSERT INTO posts (id, board, title, body, image_path, visible, created_at, updated_at, created_by, updated_by, version)
       VALUES (?, 'notice', '예시 데이터로 운영 화면을 열었습니다', '수량과 단가는 예시입니다. 실제 재고는 업데이트 센터의 엑셀 승인 뒤에 반영하세요.', '', 1, ?, ?, ?, ?, 1)`,
    ).run(uid(), stamp, stamp, adminId, adminId);
    db.prepare(
      `INSERT INTO posts (id, board, title, body, image_path, visible, created_at, updated_at, created_by, updated_by, version)
       VALUES (?, 'procurement', '조달 제품', '조달 항목은 제품 카테고리 Procurement에서 관리합니다. 공개 화면에는 원가를 올리지 않습니다.', '', 1, ?, ?, ?, ?, 1)`,
    ).run(uid(), stamp, stamp, adminId, adminId);
    db.prepare(
      `INSERT INTO posts (id, board, title, body, image_path, visible, created_at, updated_at, created_by, updated_by, version)
       VALUES (?, 'download', '카탈로그 자료', '자료실에 파일을 올리려면 관리자 화면에서 게시글을 추가하세요. 제품별 제안서는 사내 선택 목록에서 PDF로 만듭니다.', '', 1, ?, ?, ?, ?, 1)`,
    ).run(uid(), stamp, stamp, adminId, adminId);

    db.prepare("INSERT INTO app_settings (key, value) VALUES ('seeded', '1')").run();
    audit(db, adminId, "seed", "app", "seed", null, { products: items.length, sample: true });
  });
  insert();
}
