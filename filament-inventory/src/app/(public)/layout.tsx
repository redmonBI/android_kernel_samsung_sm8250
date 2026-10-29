import { PublicFrame } from "@/components/PublicFrame";
import { SiteFooter } from "@/components/ui";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicFrame>{children}</PublicFrame>
      <SiteFooter />
    </>
  );
}
