import { canSeeCost } from "./permissions";

export type Audience = "public" | string;

export type CatalogSource = {
  id: string;
  slug: string;
  code: string;
  name: string;
  spec: string;
  category_name: string;
  category_slug: string;
  manufacturer: string;
  watt: string;
  color_temp: string;
  beam_angle: string;
  size_text: string;
  finish: string;
  options_text: string;
  grade: string;
  physical_status: string;
  work_status: string;
  sales_priority: string;
  priority_reason: string;
  available_qty: number;
  erp_qty: number;
  reserved_qty: number;
  outbound_qty: number;
  defect_qty: number;
  quarantine_qty: number;
  unit_cost: number;
  sell_price: number;
  promo_price: number | null;
  promo_name: string | null;
  promo_ends: string | null;
  promo_remaining: number | null;
  department_name: string | null;
  owner_name: string;
  image_path: string | null;
  image_count: number;
  defect_count: number;
  plan_text: string;
  is_sample: number;
  year_occurred: number | null;
  last_in: string | null;
  last_out: string | null;
  stock_amount: number;
  public_url: string;
  featured: number;
};

export function toClientProduct(row: CatalogSource, audience: Audience) {
  const publicView = {
    id: row.id,
    slug: row.slug,
    code: row.code,
    name: row.name,
    spec: row.spec,
    category: row.category_name,
    categorySlug: row.category_slug,
    manufacturer: row.manufacturer,
    watt: row.watt,
    colorTemp: row.color_temp,
    beamAngle: row.beam_angle,
    size: row.size_text,
    finish: row.finish,
    options: row.options_text,
    image: row.image_path,
    publicUrl: row.public_url,
    featured: row.featured === 1,
  };
  if (audience === "public") return publicView;
  const internal = {
    ...publicView,
    grade: row.grade,
    physicalStatus: row.physical_status,
    workStatus: row.work_status,
    salesPriority: row.sales_priority,
    priorityReason: row.priority_reason,
    availableQty: row.available_qty,
    erpQty: row.erp_qty,
    reservedQty: row.reserved_qty,
    outboundQty: row.outbound_qty,
    defectQty: row.defect_qty,
    quarantineQty: row.quarantine_qty,
    sellPrice: row.sell_price,
    promoPrice: row.promo_price,
    promoName: row.promo_name,
    promoEnds: row.promo_ends,
    promoRemaining: row.promo_remaining,
    department: row.department_name,
    owner: row.owner_name,
    imageCount: row.image_count,
    defectCount: row.defect_count,
    plan: row.plan_text,
    sample: row.is_sample === 1,
    year: row.year_occurred,
    lastIn: row.last_in,
    lastOut: row.last_out,
    stockAmount: canSeeCost(audience) ? row.stock_amount : undefined,
  };
  if (canSeeCost(audience)) {
    return { ...internal, unitCost: row.unit_cost };
  }
  return internal;
}
