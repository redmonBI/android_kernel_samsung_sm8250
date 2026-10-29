import Link from "next/link";
import { CompanyNav } from "@/components/CompanyNav";
import { philosophy, visionSteps } from "@/content/company";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "회사개요" };

export default function CompanyPage() {
  const settings = getSettings(getDb());
  const facts = [
    ["대표이사", settings.ceo],
    ["설립", "2001년 7월 6일"],
    ["주업종", "IoT, 조명, LED, 전기부품, 태양에너지, 전기공사"],
    ["본사", settings.address],
    ["기업부설연구소", "경기도 광명시 하안로 60 D동 208호"],
    ["공장", "광명, 안산, 중국"],
    ["전화", settings.phone],
    ["팩스", settings.fax],
    ["메일", settings.email],
  ];
  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <p className="text-xs tracking-[0.18em] text-filament">YOUNGJIN EL</p>
      <h1 className="mt-2 text-4xl font-medium">영진이엘</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-mute">
        조명의 제조, 유통, 현장, 사후관리를 한 시스템으로 잇는 ONE STOP LIGHTING SOLUTION 기업입니다. 필라멘트코리아는 영진이엘의 B2B 상업조명 브랜드입니다.
      </p>
      <div className="mt-6">
        <CompanyNav current="/company" />
      </div>
      <section className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 className="text-2xl font-medium">회사개요</h2>
          <p className="mt-4 text-sm leading-7">
            2001년 설립된 (주)영진이엘은 전기공사업을 바탕으로 조명 토탈 서비스를 제공해 왔습니다. 연구개발로 특허와 원천기술을 확보하고, 선택과 집중으로 글로벌 기준을 지향합니다.
          </p>
          <p className="mt-3 text-sm text-mute">대표이사 권기성</p>
          <dl className="mt-6">
            {facts.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[140px_1fr] gap-3 border-b border-line py-3 text-sm">
                <dt className="text-mute">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <aside className="border border-line bg-soft p-5">
          <h2 className="text-lg">브랜드</h2>
          <div className="mt-4 space-y-4 text-sm leading-6">
            <div>
              <p className="font-medium">필라멘트코리아</p>
              <p className="text-mute">매장 조명 납품, 전국 시공과 서비스를 맡은 B2B 브랜드입니다. 이 사이트의 제품 카탈로그가 그 창구입니다.</p>
              <Link href="/products" className="mt-2 inline-block text-filament">제품 보기</Link>
            </div>
            <div>
              <p className="font-medium">램프옴</p>
              <p className="text-mute">가정용 조명을 위한 B2C 브랜드입니다. 즐거움, 감동, 케어를 핵심 가치로 둡니다.</p>
              <a href="http://lampohm.com/main/index.php" className="mt-2 inline-block text-filament">램프옴 사이트</a>
            </div>
          </div>
        </aside>
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-medium">경영이념</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {philosophy.map(([title, body]) => (
            <article key={title} className="border border-line px-4 py-4">
              <h3 className="text-lg">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-mute">{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-medium">원스톱 흐름</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-5">
          {visionSteps.map((step, index) => (
            <li key={step} className="border border-line px-4 py-4 text-sm">
              <span className="text-xs tracking-wide text-filament">0{index + 1}</span>
              <p className="mt-2 font-medium">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
