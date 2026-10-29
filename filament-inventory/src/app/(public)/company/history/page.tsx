import { CompanyNav } from "@/components/CompanyNav";
import { history } from "@/content/company";

export const metadata = { title: "회사연혁" };

export default function HistoryPage() {
  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <p className="text-xs tracking-[0.18em] text-filament">YOUNGJIN EL</p>
      <h1 className="mt-2 text-4xl font-medium">회사연혁</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-mute">영진이엘 공개 회사소개에 적힌 주요 이력을 기간별로 정리했습니다.</p>
      <div className="mt-6">
        <CompanyNav current="/company/history" />
      </div>
      <div className="mt-8 space-y-8">
        {history.map((group) => (
          <section key={group.period} className="grid gap-4 border-t border-line pt-6 md:grid-cols-[180px_1fr]">
            <h2 className="text-xl font-medium text-filament">{group.period}</h2>
            <ul className="space-y-2 text-sm leading-6">
              {group.items.map((item) => (
                <li key={item} className="border-b border-line py-2">{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
