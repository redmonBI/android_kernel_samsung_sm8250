import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { philosophy, serviceCenters, visionSteps } from "@/content/company";

export default function YoungjinHomePage() {
  const db = getDb();
  const settings = getSettings(db);
  const news = db.prepare("SELECT title, body, created_at FROM posts WHERE board IN ('news', 'notice') AND visible = 1 ORDER BY created_at DESC LIMIT 3").all() as {
    title: string;
    body: string;
    created_at: string;
  }[];
  return (
    <>
      <section className="bg-[#071833] text-white">
        <div className="mx-auto grid w-full max-w-page gap-10 px-5 py-16 md:grid-cols-[1.4fr_0.8fr] md:py-24">
          <div>
            <p className="text-xs tracking-[0.28em] text-white/60">{settings.youngjin_kicker}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-medium leading-tight md:text-5xl">{settings.youngjin_title}</h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-white/75">{settings.youngjin_body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/company" className="bg-white px-5 py-3 text-sm text-[#071833]">회사 소개</Link>
              <Link href="/filament" className="border border-white/70 px-5 py-3 text-sm">필라멘트코리아</Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px self-end bg-white/15">
            {[
              ["2001", "설립"],
              ["3", "공장"],
              ["6", "서비스 센터"],
              ["2", "자체 브랜드"],
            ].map(([value, label]) => (
              <div key={label} className="bg-[#071833] px-4 py-5">
                <dt className="text-2xl font-medium">{value}</dt>
                <dd className="mt-1 text-xs tracking-wide text-white/60">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="mx-auto grid w-full max-w-page gap-6 px-5 py-14 md:grid-cols-2">
        <article className="border border-line p-6">
          <p className="text-xs tracking-[0.16em] text-[#0056B8]">B2B</p>
          <h2 className="mt-2 text-2xl font-medium">필라멘트코리아</h2>
          <p className="mt-3 text-sm leading-7 text-mute">매장 조명 납품, 전국 시공과 사후관리. 제품 사진과 품목코드로 카탈로그를 봅니다.</p>
          <Link href="/filament" className="mt-5 inline-block border border-[#071833] px-4 py-2 text-sm">브랜드 홈</Link>
        </article>
        <article className="border border-line p-6">
          <p className="text-xs tracking-[0.16em] text-[#0056B8]">B2C</p>
          <h2 className="mt-2 text-2xl font-medium">램프옴</h2>
          <p className="mt-3 text-sm leading-7 text-mute">가정용 조명 브랜드입니다. 즐거움, 감동, 케어를 고객 가치로 둡니다.</p>
          <a href="http://lampohm.com/main/index.php" className="mt-5 inline-block border border-[#071833] px-4 py-2 text-sm">램프옴 사이트</a>
        </article>
      </section>
      <section className="border-y border-line bg-soft">
        <div className="mx-auto w-full max-w-page px-5 py-14">
          <h2 className="text-2xl font-medium">경영이념</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {philosophy.map(([title, body]) => (
              <article key={title} className="bg-white px-4 py-5">
                <h3 className="text-lg">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-mute">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto w-full max-w-page px-5 py-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-medium">설계부터 사후관리</h2>
          <Link href="/company/business" className="text-sm text-[#0056B8]">사업 보기</Link>
        </div>
        <ol className="mt-6 grid gap-3 md:grid-cols-5">
          {visionSteps.map((step, index) => (
            <li key={step} className="border border-line px-4 py-4">
              <span className="text-xs tracking-wide text-[#0056B8]">0{index + 1}</span>
              <p className="mt-2 text-sm font-medium">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap gap-2">
          {serviceCenters.map((center) => (
            <span key={center} className="border border-line px-3 py-2 text-sm">{center} 센터</span>
          ))}
        </div>
        <p className="mt-4 text-sm text-mute">{settings.address} · {settings.phone}</p>
      </section>
      {news.length > 0 ? (
        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-page px-5 py-14">
            <h2 className="text-2xl font-medium">소식</h2>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {news.map((item) => (
                <li key={item.created_at + item.title} className="py-4">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-mute">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
