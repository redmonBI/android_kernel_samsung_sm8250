import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canSeeCost } from "@/lib/permissions";
import { listProducts } from "@/lib/queries";
import { toClientProduct } from "@/lib/serialize";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const url = new URL(request.url);
  const audience = user?.role ?? "public";
  const result = listProducts(getDb(), {
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    page: Number(url.searchParams.get("page") ?? 1) || 1,
    pageSize: 20,
    publishedOnly: !user,
    sort: user ? "amount" : "code",
  });
  return Response.json({
    total: result.total,
    ...(canSeeCost(audience) ? { amount: result.amount } : {}),
    products: result.rows.map((row) => toClientProduct(row, audience)),
  });
}
