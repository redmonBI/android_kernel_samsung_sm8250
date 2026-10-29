"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { won } from "@/lib/format";

export function SelectionDrawer({
  items,
}: {
  items: { code: string; name: string; qty: number; unitPrice: number; available: number }[];
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const amount = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  return (
    <>
      <button type="button" className="fixed bottom-4 right-4 z-30 bg-filament px-4 py-3 text-sm text-white" onClick={() => setOpen(true)}>
        선택 목록 {items.length}
      </button>
      {open ? (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="선택 목록 닫기" onClick={() => setOpen(false)} />
          <aside className="absolute bottom-0 right-0 max-h-[78vh] w-full overflow-auto bg-white p-5 md:top-0 md:max-h-none md:h-full md:max-w-md md:border-l md:border-line" role="dialog" aria-label="선택 목록">
            <div className="flex items-center justify-between">
              <h2 className="text-lg">선택 목록</h2>
              <button type="button" onClick={() => setOpen(false)}>닫기</button>
            </div>
            {items.length === 0 ? <p className="mt-6 text-sm text-mute">담긴 제품이 없습니다.</p> : null}
            <ul className="mt-4 divide-y divide-line">
              {items.map((item) => (
                <li key={item.code} className="py-3 text-sm">
                  <p className="font-medium tracking-wide">{item.code}</p>
                  <p className="text-mute">{item.name}</p>
                  <p>수량 {item.qty} · 가용 {item.available} · {won(item.unitPrice)}</p>
                  {item.qty > item.available ? <p className="text-red-800">가용수량보다 많습니다.</p> : null}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">예상 금액 {won(amount)}</p>
            <Link href="/app/selection" className="mt-4 inline-block border border-filament px-4 py-2 text-sm text-filament">
              목록 편집과 제안서
            </Link>
          </aside>
        </div>
      ) : null}
    </>
  );
}
