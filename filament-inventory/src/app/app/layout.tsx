import { FilamentHeader, type NavItem } from "@/components/FilamentHeader";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { SelectionDrawer } from "@/components/SelectionDrawer";
import { SampleBanner } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activeList, listItems } from "@/lib/lists";
import { canApprove, canEditContent, canImport } from "@/lib/permissions";
import { sampleProductCount } from "@/lib/queries";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items: NavItem[] = [
    { href: "/app", label: "재고 홈" },
    { href: "/app/catalog", label: "제품·재고" },
    { href: "/app/promotions", label: "프로모션" },
    { href: "/app/selection", label: "선택 목록" },
    { href: "/app/proposals", label: "제안서" },
    { href: "/app/work", label: "업무함" },
  ];
  if (canImport(user.role) || canApprove(user.role)) items.push({ href: "/app/import", label: "업데이트 센터" });
  if (user.role === "admin" || canEditContent(user.role)) items.push({ href: "/app/admin", label: "관리자" });
  if (user.role === "admin" || user.role === "approver" || user.role === "finance_viewer") items.push({ href: "/app/audit", label: "이력" });
  const db = getDb();
  const selected = listItems(db, activeList(db, user.id));
  return (
    <>
      <SiteSwitcher />
      <FilamentHeader items={items} userName={user.name} withSwitcher />
      <SampleBanner count={sampleProductCount(db)} />
      <main>{children}</main>
      <SelectionDrawer
        items={selected.map((item) => ({
          code: item.code,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unit_price,
          available: item.available_qty,
        }))}
      />
    </>
  );
}
