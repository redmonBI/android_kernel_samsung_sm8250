import { CompanyNav } from "@/components/CompanyNav";

export const metadata = { title: "사업" };

const businesses = [
  {
    title: "스마트 솔루션",
    body: "IoT를 결합한 통합 관리입니다. 스마트 터치 패널로 상품, 공간, 시간별 조명을 연출하고, 센서로 매장 환경과 에너지를 다룹니다. 그룹 제어, 타이머, 기존 매장에 짧은 설치를 지향합니다.",
  },
  {
    title: "필립스 전략 파트너",
    body: "필립스 SVAP로 선정된 협력입니다. 필립스는 LED 시스템을 공급하고, 영진이엘은 국내 조명기구 유통과 서비스를 맡습니다.",
  },
  {
    title: "융코리아 전략 파트너",
    body: "JUNG SVAP 협력입니다. 디지털 제품군을 조명에 접목해 스마트 조명 품질을 높입니다.",
  },
  {
    title: "직영 서비스",
    body: "지역 협력 업체에만 맡기지 않고, 시공부터 사후관리까지 전국 직영 서비스 센터가 직접 처리합니다.",
  },
  {
    title: "빛 렌탈 서비스",
    body: "조명 렌탈 서비스 항목이 회사 사업에 포함되어 있습니다. 조건은 담당자 확인 후 안내합니다.",
  },
];

export default function BusinessPage() {
  return (
    <div className="mx-auto w-full max-w-page px-5 py-8">
      <p className="text-xs tracking-[0.18em] text-filament">YOUNGJIN EL</p>
      <h1 className="mt-2 text-4xl font-medium">사업</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-mute">설계부터 제조, 납품, 사후관리까지 조명 일을 한 회사에서 잇습니다.</p>
      <div className="mt-6">
        <CompanyNav current="/company/business" />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {businesses.map((item) => (
          <article key={item.title} className="border border-line px-5 py-5">
            <h2 className="text-xl font-medium">{item.title}</h2>
            <p className="mt-3 text-sm leading-7 text-mute">{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
