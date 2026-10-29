import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash, Breadcrumb, GradeBadge, StatusBadge } from "@/components/ui";
import { addComment, addDefect, adjustProduct, deleteOrRestore, reserveProduct, saveProfile, shipProduct, toggleSelection } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { blank, publicSrc, won } from "@/lib/format";
import { daysSince } from "@/lib/inventory";
import { canAdjust, canEditContent, canEditSellPrice, canManageCatalog, canReserve, canSeeCost } from "@/lib/permissions";
import { getProduct } from "@/lib/queries";
import { readQuery } from "@/lib/search";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const product = getProduct(getDb(), (await params).slug);
  return { title: product?.code ?? "제품" };
}

export default async function StaffProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const raw = readQuery(await searchParams);
  const db = getDb();
  const product = getProduct(db, slug);
  if (!product) notFound();
  const images = db.prepare("SELECT path, alt, kind FROM product_images WHERE product_id = ? ORDER BY kind, sort_order").all(product.id) as {
    path: string;
    alt: string;
    kind: string;
  }[];
  const normals = images.filter((image) => image.kind === "normal");
  const defects = db.prepare("SELECT defect_type, affected_qty, description, reporter_name, created_at FROM defects WHERE product_id = ? ORDER BY created_at DESC").all(product.id) as {
    defect_type: string;
    affected_qty: number;
    description: string;
    reporter_name: string;
    created_at: string;
  }[];
  const notes = db.prepare("SELECT kind, body, created_at FROM activities WHERE product_id = ? ORDER BY created_at DESC LIMIT 12").all(product.id) as {
    kind: string;
    body: string;
    created_at: string;
  }[];
  const history = db.prepare("SELECT action, before_json, after_json, created_at FROM audit_logs WHERE entity = 'product' AND entity_id = ? ORDER BY created_at DESC LIMIT 8").all(product.id) as {
    action: string;
    before_json: string | null;
    after_json: string | null;
    created_at: string;
  }[];
  const departments = db.prepare("SELECT id, name FROM departments ORDER BY name").all() as { id: string; name: string }[];
  const dept = db.prepare("SELECT department_id, published FROM products WHERE id = ?").get(product.id) as { department_id: string | null; published: number };
  const idle = daysSince(product.last_out);
  const specs = [
    ["W", blank(product.watt)],
    ["색온도·연색성", blank(product.color_temp)],
    ["각도", blank(product.beam_angle)],
    ["사이즈", blank(product.size_text)],
    ["제조사", blank(product.manufacturer)],
    ["마감", blank(product.finish)],
    ["옵션", blank(product.options_text)],
    ["규격", blank(product.spec)],
  ];
  const stockRows = [
    ["ERP 현재수량", product.erp_qty.toLocaleString("ko-KR")],
    ["예약수량", product.reserved_qty.toLocaleString("ko-KR")],
    ["출고예정수량", product.outbound_qty.toLocaleString("ko-KR")],
    ["하자·격리수량", `${product.defect_qty.toLocaleString("ko-KR")} / ${product.quarantine_qty.toLocaleString("ko-KR")}`],
    ["판매 가능수량", product.available_qty.toLocaleString("ko-KR")],
    ["판매 가능가", won(product.promo_price ?? product.sell_price)],
    ...(canSeeCost(user.role) ? [["구매원가", won(product.unit_cost)]] : []),
    ["프로모션", product.promo_name ? `${product.promo_name} · ${product.promo_ends}` : "없음"],
    ["발생연도", product.year_occurred ? String(product.year_occurred) : "미등록"],
    ["마지막 입고", product.last_in ? product.last_in.slice(0, 10) : "미등록"],
    ["마지막 출고", product.last_out ? product.last_out.slice(0, 10) : "미등록"],
    ["무출고 일수", idle === null ? "출고 이력 없음" : `${idle}일`],
    ["담당", `${product.department_name || "부서 없음"} ${product.owner_name || ""}`.trim()],
  ];

  return (
    <article>
      <div className="bg-filament text-white">
        <div className="mx-auto flex w-full max-w-page flex-wrap items-end justify-between gap-3 px-5 py-8">
          <div>
            <p className="text-sm text-white/80">[{product.category_name}]</p>
            <h1 className="mt-2 text-4xl font-medium tracking-wide">{product.code}</h1>
            <p className="mt-2">{product.name}</p>
          </div>
          <div className="flex gap-2">
            <GradeBadge grade={product.grade} />
            <StatusBadge value={product.work_status} />
            <StatusBadge value={product.sales_priority} />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-page space-y-8 px-5 py-8">
        <Breadcrumb items={[{ href: "/app", label: "재고 홈" }, { href: "/app/catalog", label: "제품·재고" }, { label: product.code }]} />
        <Flash error={raw.error} ok={raw.ok} />
        <div className="grid gap-8 lg:grid-cols-[55%_45%]">
          <div>
            <div className="flex aspect-[4/5] items-center justify-center bg-soft p-6">
              {normals[0] ? <img src={publicSrc(normals[0].path)} alt={normals[0].alt} className="h-full w-full object-contain" /> : <span className="text-mute">이미지 없음</span>}
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {normals.map((image) => (
                <img key={image.path} src={publicSrc(image.path)} alt={image.alt} className="h-20 w-20 shrink-0 border border-line object-contain" />
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-medium">{product.name}</h2>
            <dl className="mt-4">
              {specs.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[140px_1fr] gap-3 border-b border-line py-3 text-sm">
                  <dt className="text-mute">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={toggleSelection}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="selected" value="1" />
                <input type="hidden" name="back" value={`/app/products/${slug}`} />
                <button className="border border-filament px-3 py-2 text-sm text-filament" type="submit">선택 목록에 담기</button>
              </form>
              <a className="border border-ink px-3 py-2 text-sm" href={`/products/${product.slug}`}>공개 페이지</a>
              <button className="border border-ink px-3 py-2 text-sm" type="button" id="copy-code">코드 복사</button>
            </div>
            <script
              dangerouslySetInnerHTML={{
                __html: `document.getElementById('copy-code')?.addEventListener('click',()=>navigator.clipboard.writeText(${JSON.stringify(product.code)}))`,
              }}
            />
          </div>
        </div>

        <section id="stock">
          <h2 className="text-xl">재고</h2>
          <dl className="mt-3">
            {stockRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[160px_1fr] gap-3 border-b border-line py-3 text-sm">
                <dt className="text-mute">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {canReserve(user.role) ? (
          <form action={reserveProduct} className="grid gap-2 border border-line p-4 md:grid-cols-4">
            <input type="hidden" name="slug" value={slug} />
            <label className="text-sm">예약 수량<input name="qty" type="number" min={1} defaultValue={1} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm md:col-span-2">프로젝트<input name="project" className="mt-1 w-full border border-line px-2 py-2" /></label>
            <button className="self-end border border-filament px-3 py-2 text-sm text-filament" type="submit">예약 요청</button>
          </form>
        ) : null}

        <section id="defects">
          <h2 className="text-xl">하자·누락</h2>
          <p className="mt-1 text-sm text-mute">정상 사진과 따로 보여 줍니다.</p>
          {defects.length === 0 ? <p className="mt-3 text-sm">등록된 하자가 없습니다.</p> : null}
          <ul className="mt-3 space-y-3">
            {defects.map((defect) => (
              <li key={`${defect.created_at}-${defect.defect_type}`} className="border border-red-700 px-3 py-3 text-sm">
                <StatusBadge value={defect.defect_type} />
                <p className="mt-2">영향 수량 {defect.affected_qty} · {defect.reporter_name} · {defect.created_at.slice(0, 10)}</p>
                <p>{defect.description}</p>
              </li>
            ))}
          </ul>
          {canAdjust(user.role) ? (
            <form action={addDefect} className="mt-4 grid gap-2 md:grid-cols-4">
              <input type="hidden" name="slug" value={slug} />
              <select name="type" className="border border-line px-2 py-2 text-sm">
                {["긁힘", "포장 훼손", "부속 누락", "파손", "찌그러짐", "작동 불량", "검수 필요", "기타"].map((type) => <option key={type}>{type}</option>)}
              </select>
              <input name="qty" type="number" min={0} defaultValue={1} className="border border-line px-2 py-2 text-sm" aria-label="영향 수량" />
              <input name="description" placeholder="상세 설명" className="border border-line px-2 py-2 text-sm" />
              <button className="border border-ink px-3 py-2 text-sm" type="submit">하자 등록</button>
            </form>
          ) : null}
        </section>

        <section id="notes">
          <h2 className="text-xl">제안·설계 기록</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {notes.map((note) => (
              <li key={note.created_at + note.body} className="border-b border-line py-2">
                <span className="text-mute">{note.created_at.slice(0, 16).replace("T", " ")} · {note.kind}</span>
                <p>{note.body}</p>
              </li>
            ))}
          </ul>
          <form action={addComment} className="mt-3 flex gap-2">
            <input type="hidden" name="slug" value={slug} />
            <input name="body" className="flex-1 border border-line px-2 py-2 text-sm" placeholder="현장 메모" />
            <button className="border border-ink px-3 py-2 text-sm" type="submit">기록</button>
          </form>
        </section>

        <section>
          <h2 className="text-xl">소진 계획 · {product.plan_text || "미등록"}</h2>
          <p className="text-sm text-mute">우선순위 {product.sales_priority}. {product.priority_reason}</p>
        </section>

        {canAdjust(user.role) ? (
          <section className="grid gap-4 md:grid-cols-2">
            <form action={adjustProduct} className="space-y-2 border border-line p-4">
              <h2 className="text-lg">재고 조정 요청</h2>
              <input type="hidden" name="slug" value={slug} />
              <select name="field" className="w-full border border-line px-2 py-2 text-sm">
                <option value="erp_qty">ERP 현재수량</option>
                {canSeeCost(user.role) ? <option value="unit_cost">구매원가</option> : null}
              </select>
              <input name="value" type="number" min={0} className="w-full border border-line px-2 py-2 text-sm" required />
              <input name="reason" placeholder="사유" className="w-full border border-line px-2 py-2 text-sm" required />
              <button className="border border-ink px-3 py-2 text-sm" type="submit">승인 요청</button>
            </form>
            <form action={shipProduct} className="space-y-2 border border-line p-4">
              <h2 className="text-lg">출고 예정</h2>
              <input type="hidden" name="slug" value={slug} />
              <input name="qty" type="number" min={1} defaultValue={1} className="w-full border border-line px-2 py-2 text-sm" />
              <button className="border border-ink px-3 py-2 text-sm" type="submit">출고 예정 요청</button>
            </form>
          </section>
        ) : null}

        {(canEditContent(user.role) || canManageCatalog(user.role)) ? (
          <form action={saveProfile} className="grid gap-3 border border-line p-4 md:grid-cols-2">
            <h2 className="md:col-span-2 text-lg">운영 정보</h2>
            <input type="hidden" name="slug" value={slug} />
            <label className="text-sm">품명<input name="name" defaultValue={product.name} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm">제조사<input name="manufacturer" defaultValue={product.manufacturer} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm">W<input name="watt" defaultValue={product.watt} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm">색온도<input name="colorTemp" defaultValue={product.color_temp} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm">각도<input name="angle" defaultValue={product.beam_angle} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm">사이즈<input name="size" defaultValue={product.size_text} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm">마감<input name="finish" defaultValue={product.finish} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm">옵션<input name="options" defaultValue={product.options_text} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm md:col-span-2">규격<input name="spec" defaultValue={product.spec} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm">등급
              <select name="grade" defaultValue={product.grade} className="mt-1 w-full border border-line px-2 py-2">
                {["A", "B", "C", "D"].map((grade) => <option key={grade}>{grade}</option>)}
              </select>
            </label>
            <label className="text-sm">우선순위
              <select name="priority" defaultValue={product.sales_priority} className="mt-1 w-full border border-line px-2 py-2">
                {["추천", "우선소진", "일반", "보류"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm">물리 상태
              <select name="physical" defaultValue={product.physical_status} className="mt-1 w-full border border-line px-2 py-2">
                {["정상", "하자", "격리", "검수필요"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm">업무 상태
              <select name="work" defaultValue={product.work_status} className="mt-1 w-full border border-line px-2 py-2">
                {["판매가능", "검토", "예약중", "출고예정", "사용불가", "종료"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm">부서
              <select name="department" defaultValue={dept.department_id ?? ""} className="mt-1 w-full border border-line px-2 py-2">
                <option value="">없음</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <label className="text-sm">담당자<input name="owner" defaultValue={product.owner_name} className="mt-1 w-full border border-line px-2 py-2" /></label>
            {canEditSellPrice(user.role) ? (
              <label className="text-sm">판매가<input name="sellPrice" type="number" min={0} defaultValue={product.sell_price} className="mt-1 w-full border border-line px-2 py-2" /></label>
            ) : null}
            <label className="text-sm md:col-span-2">우선 이유<input name="reason" defaultValue={product.priority_reason} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="text-sm md:col-span-2">소진 계획<textarea name="plan" defaultValue={product.plan_text} rows={3} className="mt-1 w-full border border-line px-2 py-2" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" value="1" defaultChecked={dept.published === 1} /> 공개 페이지 노출</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" value="1" defaultChecked={product.featured === 1} /> 메인 추천</label>
            <button className="bg-filament px-4 py-2 text-sm text-white md:col-span-2" type="submit">저장</button>
          </form>
        ) : <p className="text-sm text-mute">이 역할은 운영 정보를 볼 수 있고, 수정은 영업·부서·관리자 화면에서 합니다.</p>}

        <section>
          <h2 className="text-xl">변경 이력</h2>
          <ul className="mt-2 text-sm">
            {history.length === 0 ? <li className="text-mute">아직 없습니다.</li> : null}
            {history.map((row) => (
              <li key={row.created_at + row.action} className="border-b border-line py-2">
                {row.created_at.slice(0, 16).replace("T", " ")} · {row.action}
              </li>
            ))}
          </ul>
          <Link className="mt-2 inline-block text-sm text-filament" href="/app/audit">전체 이력</Link>
        </section>

        {(canManageCatalog(user.role)) ? (
          <form action={deleteOrRestore}>
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="mode" value="delete" />
            <button className="text-sm text-red-800" type="submit">소프트 삭제</button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
