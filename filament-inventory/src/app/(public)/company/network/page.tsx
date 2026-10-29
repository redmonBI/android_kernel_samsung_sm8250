import { CompanyNav } from "@/components/CompanyNav";
import { serviceCenters } from "@/content/company";

export const metadata = { title: "시설과 조직" };

export default function NetworkPage() {
  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <p className="text-xs tracking-[0.18em] text-filament">YOUNGJIN EL</p>
      <h1 className="mt-2 text-4xl font-medium">시설과 조직</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-mute">국내 법인 2곳, 중국 외자법인 1곳, 5본부 2실 1연구소 17팀으로 소개되어 있습니다.</p>
      <div className="mt-6">
        <CompanyNav current="/company/network" />
      </div>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <article className="border border-line px-4 py-4 text-sm leading-6">
          <h2 className="text-lg font-medium">사무실</h2>
          <p className="mt-2 text-mute">영업과 지원이 인접해 있어 상황 판단과 대응을 같이 합니다. 본사 사무실, 영업부, R&D 센터가 있습니다.</p>
        </article>
        <article className="border border-line px-4 py-4 text-sm leading-6">
          <h2 className="text-lg font-medium">쇼룸</h2>
          <p className="mt-2 text-mute">필라멘트코리아와 램프옴 제품을 전시하고 체험하는 스튜디오와 갤러리가 있습니다.</p>
        </article>
        <article className="border border-line px-4 py-4 text-sm leading-6">
          <h2 className="text-lg font-medium">설계</h2>
          <p className="mt-2 text-mute">공간 역할에 맞는 조명을 제안하고 시뮬레이션으로 확인합니다. 디자인팀과 R&D팀이 담당합니다.</p>
        </article>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-medium">생산과 물류</h2>
        <p className="mt-2 text-sm leading-7 text-mute">생산과 물류를 직영으로 운영합니다. 제1공장 광명, 제2공장 안산, 중국 생산 공장, 광명·안산·대전 물류 센터가 있습니다.</p>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-medium">직영 서비스 센터</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {serviceCenters.map((center) => (
            <li key={center} className="border border-line px-4 py-2 text-sm">{center}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
