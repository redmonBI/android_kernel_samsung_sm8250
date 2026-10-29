import { FilamentHeader } from "@/components/FilamentHeader";
import { SiteFooter } from "@/components/ui";

const ITEMS = [
  { href: "/products", label: "PRODUCTS" },
  { href: "/projects", label: "PROJECTS" },
  { href: "/procurement", label: "PROCUREMENT" },
  { href: "/downloads", label: "DOWNLOAD" },
  { href: "/contact", label: "CONTACT" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FilamentHeader items={ITEMS} />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
