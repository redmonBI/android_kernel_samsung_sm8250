"use server";

import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "./auth";
import { createImportJob } from "./apply-import";
import { audit, getDb, immediate, now, uid } from "./db";
import { activeList, createProposal, toggleListItem } from "./lists";
import { assertSafeSpreadsheet, parseWorkbook } from "./importer";
import { verifyPassword } from "./passwords";
import {
  canAdjust,
  canApprove,
  canEditContent,
  canEditSellPrice,
  canImport,
  canManageCatalog,
  canPropose,
  canReserve,
} from "./permissions";
import { safeNextPath, signSession } from "./session";
import { decideApproval, requestAdjustment, requestReservation, requestShipment, restoreProduct, rollbackImport, softDeleteProduct } from "./workflow";

function rethrowRedirect(error: unknown) {
  if (typeof error === "object" && error && "digest" in error && String((error as { digest: unknown }).digest).includes("NEXT_REDIRECT")) {
    throw error;
  }
}

async function actor() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function fail(target: string, error: unknown): never {
  rethrowRedirect(error);
  const message = error instanceof Error ? error.message : "처리하지 못했습니다.";
  const join = target.includes("?") ? "&" : "?";
  redirect(`${target}${join}error=${encodeURIComponent(message)}`);
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const user = getDb().prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as
    | { id: string; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    redirect(`/login?error=${encodeURIComponent("이메일 또는 비밀번호가 올바르지 않습니다.")}&next=${encodeURIComponent(next)}`);
  }
  const jar = await cookies();
  jar.set("fk_session", await signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(next);
}

export async function logout() {
  const jar = await cookies();
  jar.delete("fk_session");
  redirect("/");
}

export async function toggleSelection(formData: FormData) {
  const user = await actor();
  const productId = String(formData.get("productId") ?? "");
  const select = String(formData.get("selected") ?? "1") === "1";
  const back = String(formData.get("back") ?? "/app/catalog");
  try {
    toggleListItem(getDb(), user.id, productId, select);
  } catch (error) {
    fail(back, error);
  }
  redirect(back);
}

export async function updateSelection(formData: FormData) {
  const user = await actor();
  const db = getDb();
  const listId = activeList(db, user.id);
  const stamp = now();
  db.prepare(
    `UPDATE saved_lists SET project_name = ?, customer = ?, purpose = ?, need_by = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`,
  ).run(
    String(formData.get("project") ?? "").slice(0, 120),
    String(formData.get("customer") ?? "").slice(0, 120),
    String(formData.get("purpose") ?? "").slice(0, 300),
    String(formData.get("needBy") ?? "") || null,
    stamp,
    user.id,
    listId,
  );
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty:")) continue;
    const id = key.slice(4);
    const qty = Number(value);
    if (!Number.isInteger(qty) || qty <= 0) continue;
    db.prepare("UPDATE saved_list_items SET qty = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND list_id = ?").run(
      qty,
      stamp,
      user.id,
      id,
      listId,
    );
  }
  redirect("/app/selection?ok=저장했습니다.");
}

export async function removeSelectionItem(formData: FormData) {
  const user = await actor();
  const db = getDb();
  const listId = activeList(db, user.id);
  db.prepare("DELETE FROM saved_list_items WHERE id = ? AND list_id = ?").run(String(formData.get("id") ?? ""), listId);
  redirect("/app/selection");
}

export async function makeProposal() {
  const user = await actor();
  if (!canPropose(user.role)) redirect("/app/selection?error=제안서를 만들 권한이 없습니다.");
  try {
    const id = createProposal(getDb(), user.id);
    redirect(`/app/proposals/${id}`);
  } catch (error) {
    fail("/app/selection", error);
  }
}

export async function saveProposal(formData: FormData) {
  const user = await actor();
  if (!canPropose(user.role) && user.role !== "admin") redirect("/app");
  const id = String(formData.get("id") ?? "");
  const db = getDb();
  const owned = db.prepare("SELECT id FROM proposals WHERE id = ? AND (user_id = ? OR ? = 'admin')").get(id, user.id, user.role);
  if (!owned) redirect("/app/proposals?error=제안서를 수정할 수 없습니다.");
  const stamp = now();
  db.prepare(
    `UPDATE proposals SET title=?, customer=?, project_name=?, intro_text=?, terms_text=?, status=?, updated_at=?, updated_by=?, version=version+1 WHERE id=?`,
  ).run(
    String(formData.get("title") ?? "").slice(0, 160),
    String(formData.get("customer") ?? "").slice(0, 120),
    String(formData.get("project") ?? "").slice(0, 120),
    String(formData.get("intro") ?? "").slice(0, 4000),
    String(formData.get("terms") ?? "").slice(0, 4000),
    String(formData.get("status") ?? "draft") === "sent" ? "sent" : "draft",
    stamp,
    user.id,
    id,
  );
  const items = db.prepare("SELECT id FROM proposal_items WHERE proposal_id = ?").all(id) as { id: string }[];
  for (const item of items) {
    const qty = Number(formData.get(`qty:${item.id}`));
    const price = Number(formData.get(`price:${item.id}`));
    const description = String(formData.get(`desc:${item.id}`) ?? "").slice(0, 1000);
    if (!Number.isInteger(qty) || qty < 0 || !Number.isInteger(price) || price < 0) {
      redirect(`/app/proposals/${id}?error=수량과 단가는 0 이상의 정수로 입력합니다.`);
    }
    db.prepare(
      "UPDATE proposal_items SET qty=?, unit_price=?, description=?, updated_at=?, updated_by=?, version=version+1 WHERE id=? AND proposal_id=?",
    ).run(qty, price, description, stamp, user.id, item.id, id);
  }
  audit(db, user.id, "proposal.update", "proposal", id, null, { title: String(formData.get("title") ?? "") });
  redirect(`/app/proposals/${id}?ok=제안서 문구를 저장했습니다.`);
}

export async function reserveProduct(formData: FormData) {
  const user = await actor();
  const slug = String(formData.get("slug") ?? "");
  if (!canReserve(user.role)) fail(`/app/products/${slug}`, new Error("예약 요청 권한이 없습니다."));
  const parsed = z.object({ qty: z.coerce.number().int().positive(), project: z.string().max(120) }).safeParse({
    qty: formData.get("qty"),
    project: String(formData.get("project") ?? ""),
  });
  if (!parsed.success) fail(`/app/products/${slug}`, new Error("예약 수량을 확인해 주세요."));
  const product = getDb().prepare("SELECT id FROM products WHERE slug = ? AND deleted_at IS NULL").get(slug) as { id: string } | undefined;
  if (!product) fail("/app/catalog", new Error("품목을 찾지 못했습니다."));
  try {
    requestReservation(getDb(), user.id, product.id, parsed.data.qty, parsed.data.project);
  } catch (error) {
    fail(`/app/products/${slug}`, error);
  }
  redirect(`/app/products/${slug}?ok=예약 요청을 올렸습니다. 승인 전입니다.`);
}

export async function shipProduct(formData: FormData) {
  const user = await actor();
  const slug = String(formData.get("slug") ?? "");
  if (!canAdjust(user.role) && user.role !== "warehouse_manager") {
    fail(`/app/products/${slug}`, new Error("출고 요청 권한이 없습니다."));
  }
  const qty = Number(formData.get("qty"));
  const product = getDb().prepare("SELECT id FROM products WHERE slug = ?").get(slug) as { id: string } | undefined;
  if (!product) fail("/app/catalog", new Error("품목을 찾지 못했습니다."));
  try {
    requestShipment(getDb(), user.id, product.id, qty);
  } catch (error) {
    fail(`/app/products/${slug}`, error);
  }
  redirect(`/app/products/${slug}?ok=출고 예정 요청을 올렸습니다.`);
}

export async function adjustProduct(formData: FormData) {
  const user = await actor();
  const slug = String(formData.get("slug") ?? "");
  if (!canAdjust(user.role)) fail(`/app/products/${slug}`, new Error("재고 조정 권한이 없습니다."));
  const field = String(formData.get("field") ?? "");
  if (field !== "erp_qty" && field !== "unit_cost") fail(`/app/products/${slug}`, new Error("조정 항목이 올바르지 않습니다."));
  const product = getDb().prepare("SELECT id FROM products WHERE slug = ?").get(slug) as { id: string } | undefined;
  if (!product) fail("/app/catalog", new Error("품목을 찾지 못했습니다."));
  try {
    requestAdjustment(getDb(), user.id, product.id, field, Number(formData.get("value")), String(formData.get("reason") ?? ""));
  } catch (error) {
    fail(`/app/products/${slug}`, error);
  }
  redirect(`/app/products/${slug}?ok=조정 요청을 올렸습니다. 승인 전입니다.`);
}

export async function decide(formData: FormData) {
  const user = await actor();
  if (!canApprove(user.role)) redirect("/app/work?error=승인 권한이 없습니다.");
  const id = String(formData.get("id") ?? "");
  const accept = String(formData.get("accept") ?? "") === "1";
  try {
    decideApproval(getDb(), id, user.id, accept);
  } catch (error) {
    fail("/app/work", error);
  }
  redirect(`/app/work?ok=${accept ? "승인했습니다." : "반려했습니다."}`);
}

export async function uploadExcel(formData: FormData) {
  const user = await actor();
  if (!canImport(user.role)) redirect("/app/import?error=엑셀을 올릴 권한이 없습니다.");
  const file = formData.get("file");
  const mode = String(formData.get("mode") ?? "full") === "delta" ? "delta" : "full";
  if (!(file instanceof File) || file.size === 0) redirect("/app/import?error=파일을 선택해 주세요.");
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    assertSafeSpreadsheet(file.name, buffer);
    const parsed = parseWorkbook(buffer);
    const dir = path.join(process.cwd(), "data", "uploads");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}-${file.name.replace(/[^\w.\-가-힣]+/g, "_")}`), buffer);
    const jobId = immediate(getDb(), () => createImportJob(getDb(), user.id, mode, file.name, parsed.rows));
    redirect(`/app/import?job=${jobId}&ok=${parsed.rows.length}행을 비교했습니다. 승인 전에는 재고가 바뀌지 않습니다.`);
  } catch (error) {
    fail("/app/import", error);
  }
}

export async function rollbackJob(formData: FormData) {
  const user = await actor();
  if (!canApprove(user.role)) redirect("/app/import?error=되돌릴 권한이 없습니다.");
  try {
    rollbackImport(getDb(), String(formData.get("jobId") ?? ""), user.id);
  } catch (error) {
    fail("/app/import", error);
  }
  redirect("/app/import?ok=엑셀 반영을 되돌렸습니다. 사진, 하자, 판매가, 예약은 유지됩니다.");
}

export async function deleteOrRestore(formData: FormData) {
  const user = await actor();
  if (!canManageCatalog(user.role) && !canApprove(user.role)) redirect("/app/catalog?error=삭제 권한이 없습니다.");
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "delete");
  const slug = String(formData.get("slug") ?? "");
  try {
    if (mode === "restore") restoreProduct(getDb(), user.id, id);
    else softDeleteProduct(getDb(), user.id, id, String(formData.get("reason") ?? "운영 화면에서 비활성화"));
  } catch (error) {
    fail(slug ? `/app/products/${slug}` : "/app/catalog", error);
  }
  redirect(mode === "restore" ? `/app/products/${slug}?ok=품목을 복구했습니다.` : "/app/catalog?ok=품목을 비활성화했습니다. 복구할 수 있습니다.");
}

export async function saveProfile(formData: FormData) {
  const user = await actor();
  if (!canEditContent(user.role) && !canManageCatalog(user.role)) redirect("/app?error=수정 권한이 없습니다.");
  const slug = String(formData.get("slug") ?? "");
  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug) as { id: string; sell_price?: number } | undefined;
  if (!product) redirect("/app/catalog?error=품목을 찾지 못했습니다.");
  const before = db.prepare("SELECT name, sales_priority, published, featured, plan_text FROM products WHERE id = ?").get(product.id);
  const stamp = now();
  db.prepare(
    `UPDATE products SET
      name=?, spec=?, manufacturer=?, watt=?, color_temp=?, beam_angle=?, size_text=?, finish=?, options_text=?,
      grade=?, physical_status=?, work_status=?, sales_priority=?, priority_reason=?, published=?, featured=?,
      owner_name=?, plan_text=?, department_id=?, updated_at=?, updated_by=?, version=version+1
     WHERE id=?`,
  ).run(
    String(formData.get("name") ?? "").slice(0, 200),
    String(formData.get("spec") ?? "").slice(0, 500),
    String(formData.get("manufacturer") ?? "").slice(0, 120),
    String(formData.get("watt") ?? "").slice(0, 80),
    String(formData.get("colorTemp") ?? "").slice(0, 80),
    String(formData.get("angle") ?? "").slice(0, 80),
    String(formData.get("size") ?? "").slice(0, 80),
    String(formData.get("finish") ?? "").slice(0, 80),
    String(formData.get("options") ?? "").slice(0, 200),
    String(formData.get("grade") ?? "C"),
    String(formData.get("physical") ?? "정상"),
    String(formData.get("work") ?? "판매가능"),
    String(formData.get("priority") ?? "일반"),
    String(formData.get("reason") ?? "").slice(0, 300),
    formData.get("published") === "1" ? 1 : 0,
    formData.get("featured") === "1" ? 1 : 0,
    String(formData.get("owner") ?? "").slice(0, 80),
    String(formData.get("plan") ?? "").slice(0, 1000),
    String(formData.get("department") ?? "") || null,
    stamp,
    user.id,
    product.id,
  );
  if (canEditSellPrice(user.role)) {
    const sell = Number(formData.get("sellPrice"));
    if (Number.isInteger(sell) && sell >= 0) {
      const old = db.prepare("SELECT sell_price FROM inventory_items WHERE product_id = ?").get(product.id) as { sell_price: number };
      db.prepare("UPDATE inventory_items SET sell_price = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE product_id = ?").run(
        sell,
        stamp,
        user.id,
        product.id,
      );
      audit(db, user.id, "price.sell", "product", product.id, { sell: old.sell_price }, { sell });
    }
  }
  if (String(formData.get("plan") ?? "")) {
    db.prepare(
      `INSERT INTO disposition_plans (id, product_id, plan, due_on, status, created_at, updated_at, created_by, updated_by, version)
       VALUES (?, ?, ?, NULL, 'active', ?, ?, ?, ?, 1)`,
    ).run(uid(), product.id, String(formData.get("plan") ?? "").slice(0, 1000), stamp, stamp, user.id, user.id);
  }
  audit(db, user.id, "product.profile", "product", product.id, before, { name: String(formData.get("name") ?? "") });
  redirect(`/app/products/${slug}?ok=제품 정보를 저장했습니다.`);
}

export async function addComment(formData: FormData) {
  const user = await actor();
  const slug = String(formData.get("slug") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 1000);
  if (body.length < 2) redirect(`/app/products/${slug}?error=내용을 입력해 주세요.`);
  const product = getDb().prepare("SELECT id FROM products WHERE slug = ?").get(slug) as { id: string } | undefined;
  if (!product) redirect("/app/catalog");
  const stamp = now();
  getDb()
    .prepare(
      `INSERT INTO activities (id, product_id, user_id, kind, body, created_at, updated_at, created_by, updated_by, version)
       VALUES (?, ?, ?, 'note', ?, ?, ?, ?, ?, 1)`,
    )
    .run(uid(), product.id, user.id, body, stamp, stamp, user.id, user.id);
  redirect(`/app/products/${slug}?ok=기록을 남겼습니다.`);
}

export async function addDefect(formData: FormData) {
  const user = await actor();
  const slug = String(formData.get("slug") ?? "");
  if (!canAdjust(user.role) && user.role !== "warehouse_manager") redirect(`/app/products/${slug}?error=하자 등록 권한이 없습니다.`);
  const product = getDb().prepare("SELECT id FROM products WHERE slug = ?").get(slug) as { id: string } | undefined;
  if (!product) redirect("/app/catalog");
  const affected = Number(formData.get("qty"));
  const type = String(formData.get("type") ?? "기타");
  const description = String(formData.get("description") ?? "").trim();
  if (!Number.isInteger(affected) || affected < 0 || description.length < 2) {
    redirect(`/app/products/${slug}?error=영향 수량과 설명을 입력해 주세요.`);
  }
  const allowed = ["긁힘", "포장 훼손", "부속 누락", "파손", "찌그러짐", "작동 불량", "검수 필요", "기타"];
  const stamp = now();
  getDb()
    .prepare(
      `INSERT INTO defects (
        id, product_id, image_id, defect_type, affected_qty, description, reporter_name,
        created_at, updated_at, created_by, updated_by, version
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(uid(), product.id, allowed.includes(type) ? type : "기타", affected, description, user.name, stamp, stamp, user.id, user.id);
  getDb().prepare("UPDATE inventory_items SET defect_qty = defect_qty + ?, updated_at = ?, version = version + 1 WHERE product_id = ?").run(
    affected,
    stamp,
    product.id,
  );
  getDb().prepare("UPDATE products SET physical_status = '하자', updated_at = ? WHERE id = ?").run(stamp, product.id);
  audit(getDb(), user.id, "defect.add", "product", product.id, null, { type, affected, description });
  redirect(`/app/products/${slug}?ok=하자 기록을 추가했습니다. 정상 사진과 섞지 않습니다.`);
}

export async function saveBanner(formData: FormData) {
  const user = await actor();
  if (user.role !== "admin" && !canEditContent(user.role)) redirect("/app/admin?error=배너를 수정할 권한이 없습니다.");
  const id = String(formData.get("id") ?? "");
  const stamp = now();
  if (id) {
    getDb()
      .prepare(
        `UPDATE banners SET title=?, subtitle=?, link_url=?, sort_order=?, visible=?, updated_at=?, updated_by=?, version=version+1 WHERE id=?`,
      )
      .run(
        String(formData.get("title") ?? "").slice(0, 120),
        String(formData.get("subtitle") ?? "").slice(0, 240),
        String(formData.get("link") ?? "").slice(0, 200),
        Number(formData.get("sort") ?? 1) || 1,
        formData.get("visible") === "1" ? 1 : 0,
        stamp,
        user.id,
        id,
      );
  }
  redirect("/app/admin?ok=배너를 저장했습니다.");
}

export async function savePost(formData: FormData) {
  const user = await actor();
  if (user.role !== "admin" && !canEditContent(user.role)) redirect("/app/admin?error=게시 권한이 없습니다.");
  const board = String(formData.get("board") ?? "notice");
  const allowed = ["notice", "project", "download", "procurement"];
  if (!allowed.includes(board)) redirect("/app/admin?error=게시판을 확인해 주세요.");
  const stamp = now();
  getDb()
    .prepare(
      `INSERT INTO posts (id, board, title, body, image_path, visible, created_at, updated_at, created_by, updated_by, version)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, 1)`,
    )
    .run(
      uid(),
      board,
      String(formData.get("title") ?? "").slice(0, 160),
      String(formData.get("body") ?? "").slice(0, 4000),
      formData.get("visible") === "1" ? 1 : 0,
      stamp,
      stamp,
      user.id,
      user.id,
    );
  redirect("/app/admin?ok=게시글을 등록했습니다.");
}

export async function saveMapping(formData: FormData) {
  const user = await actor();
  if (user.role !== "admin") redirect("/app/admin?error=매핑은 관리자만 바꿉니다.");
  const source = String(formData.get("source") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!source) redirect("/app/admin?error=엑셀의 품목구분 값을 입력해 주세요.");
  const stamp = now();
  getDb()
    .prepare(
      `INSERT INTO category_mappings (id, source_value, category_id, created_at, updated_at, created_by, updated_by, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(source_value) DO UPDATE SET category_id = excluded.category_id, updated_at = excluded.updated_at, updated_by = excluded.updated_by, version = category_mappings.version + 1`,
    )
    .run(uid(), source, categoryId, stamp, stamp, user.id, user.id);
  redirect("/app/admin?ok=분류 매핑을 저장했습니다.");
}

export async function sendInquiry(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const contact = String(formData.get("contact") ?? "").trim().slice(0, 120);
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (name.length < 1 || body.length < 2) redirect("/contact?error=이름과 문의 내용을 입력해 주세요.");
  const stamp = now();
  getDb()
    .prepare(
      `INSERT INTO posts (id, board, title, body, image_path, visible, created_at, updated_at, created_by, updated_by, version)
       VALUES (?, 'inquiry', ?, ?, '', 0, ?, ?, NULL, NULL, 1)`,
    )
    .run(uid(), `${name} / ${contact || "연락처 없음"}`, body, stamp, stamp);
  redirect("/contact?ok=문의를 남겼습니다. 담당자가 확인합니다.");
}

export async function duplicateProposal(formData: FormData) {
  const user = await actor();
  const id = String(formData.get("id") ?? "");
  const db = getDb();
  const proposal = db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as {
    title: string;
    customer: string;
    project_name: string;
    intro_text: string;
    terms_text: string;
  } | undefined;
  if (!proposal) redirect("/app/proposals?error=제안서를 찾지 못했습니다.");
  const stamp = now();
  const nextId = uid();
  db.prepare(
    `INSERT INTO proposals (
      id, user_id, list_id, title, customer, project_name, intro_text, terms_text, status,
      created_at, updated_at, created_by, updated_by, version
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, 1)`,
  ).run(nextId, user.id, `${proposal.title} 복사`, proposal.customer, proposal.project_name, proposal.intro_text, proposal.terms_text, stamp, stamp, user.id, user.id);
  const items = db.prepare("SELECT * FROM proposal_items WHERE proposal_id = ? ORDER BY sort_order").all(id) as {
    product_id: string | null;
    code: string;
    name: string;
    qty: number;
    unit_price: number;
    description: string;
    sort_order: number;
    is_sample: number;
  }[];
  for (const item of items) {
    db.prepare(
      `INSERT INTO proposal_items (
        id, proposal_id, product_id, code, name, qty, unit_price, description, sort_order, is_sample,
        created_at, updated_at, created_by, updated_by, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(uid(), nextId, item.product_id, item.code, item.name, item.qty, item.unit_price, item.description, item.sort_order, item.is_sample, stamp, stamp, user.id, user.id);
  }
  redirect(`/app/proposals/${nextId}?ok=제안서를 복제했습니다. 문구를 고쳐 저장하세요.`);
}
