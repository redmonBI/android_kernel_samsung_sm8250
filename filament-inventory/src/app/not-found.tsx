import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5">
      <p className="text-sm tracking-[0.16em] text-filament">FILAMENT KOREA</p>
      <h1 className="mt-3 text-3xl font-medium">페이지를 찾지 못했습니다</h1>
      <Link href="/" className="mt-6 inline-block border border-filament px-4 py-2 text-sm text-filament">홈으로</Link>
    </main>
  );
}
