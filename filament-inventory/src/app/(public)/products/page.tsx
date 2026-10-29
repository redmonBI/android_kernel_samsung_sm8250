import { CatalogScreen } from "@/components/CatalogScreen";
import { readQuery } from "@/lib/search";

export const metadata = { title: "제품" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = readQuery(await searchParams);
  return <CatalogScreen mode="public" raw={raw} selected={new Set()} />;
}
