import { CatalogScreen } from "@/components/CatalogScreen";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activeList, listItems } from "@/lib/lists";
import { readQuery } from "@/lib/search";

export const metadata = { title: "제품·재고" };

export default async function StaffCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = readQuery(await searchParams);
  const selected = new Set(listItems(getDb(), activeList(getDb(), user.id)).map((item) => item.product_id));
  return <CatalogScreen mode="staff" raw={raw} selected={selected} />;
}
