import { login } from "@/lib/actions";
import { readQuery } from "@/lib/search";
import { ROLE_LABEL, type Role } from "@/lib/permissions";

export const metadata = { title: "사내 로그인" };

const ACCOUNTS: { email: string; role: Role }[] = [
  { email: "sales@filament.demo", role: "sales" },
  { email: "admin@filament.demo", role: "admin" },
  { email: "approver@filament.demo", role: "approver" },
  { email: "purchase@filament.demo", role: "purchasing_support" },
  { email: "finance@filament.demo", role: "finance_viewer" },
  { email: "viewer@filament.demo", role: "viewer" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = readQuery(await searchParams);
  return (
    <main className="relative min-h-screen bg-hero text-white">
      <img src="/products/ALSL-OPT07.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      <div className="absolute inset-0 bg-hero/75" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-16">
        <img src="/brand/logo-dark.png" alt="필라멘트코리아" className="h-10 w-auto self-start" />
        <p className="mt-10 text-xs tracking-[0.22em] text-white/70">FILAMENT KOREA</p>
        <h1 className="mt-3 text-4xl font-medium">LONG-TERM INVENTORY</h1>
        <p className="mt-3 text-sm leading-6 text-white/80">장기재고를 제품 사진으로 고르고, 예약과 제안서로 넘기는 사내 화면입니다.</p>
        {raw.error ? <p className="mt-4 border border-red-300 px-3 py-2 text-sm">{raw.error}</p> : null}
        <form action={login} className="mt-8 space-y-3">
          <input type="hidden" name="next" value={raw.next || "/app"} />
          <label className="block text-sm">회사 이메일
            <input name="email" type="email" autoComplete="username" required className="mt-1 w-full border border-white/30 bg-transparent px-3 py-2 text-white" />
          </label>
          <label className="block text-sm">비밀번호
            <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full border border-white/30 bg-transparent px-3 py-2 text-white" />
          </label>
          <button className="border border-white px-4 py-2 text-sm tracking-[0.14em]" type="submit">로그인</button>
        </form>
        <div className="mt-8 text-xs leading-6 text-white/70">
          <p>검토용 비밀번호는 demo1234 입니다. 실제 배포 전에 바꿉니다.</p>
          <ul className="mt-2">
            {ACCOUNTS.map((account) => (
              <li key={account.email}>{ROLE_LABEL[account.role]} · {account.email}</li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
