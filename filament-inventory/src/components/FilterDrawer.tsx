"use client";

import { useEffect, useState } from "react";

type Option = { id: string; name: string; slug?: string };

export function FilterDrawer({
  action,
  staff,
  categories,
  departments,
  values,
}: {
  action: string;
  staff: boolean;
  categories: Option[];
  departments: Option[];
  values: Record<string, string>;
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

  return (
    <>
      <button type="button" className="border border-ink px-3 py-2 text-sm" onClick={() => setOpen(true)}>
        필터
      </button>
      {open ? (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="필터 닫기" onClick={() => setOpen(false)} />
          <form method="get" action={action} className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col gap-3 overflow-auto bg-white p-5" role="dialog" aria-label="필터">
            <div className="flex items-center justify-between">
              <h2 className="text-lg">필터</h2>
              <button type="button" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <label className="text-sm">검색
              <input name="q" defaultValue={values.q ?? ""} className="mt-1 w-full border border-line px-2 py-2" placeholder="품목코드, 품명, 규격, 제조사" />
            </label>
            <label className="text-sm">카테고리
              <select name="category" defaultValue={values.category ?? ""} className="mt-1 w-full border border-line px-2 py-2">
                <option value="">전체</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>{category.name}</option>
                ))}
              </select>
            </label>
            {staff ? (
              <>
                <label className="text-sm">등급
                  <select name="grade" defaultValue={values.grade ?? ""} className="mt-1 w-full border border-line px-2 py-2">
                    <option value="">전체</option>
                    {["A", "B", "C", "D"].map((grade) => <option key={grade}>{grade}</option>)}
                  </select>
                </label>
                <label className="text-sm">물리 상태
                  <select name="physical" defaultValue={values.physical ?? ""} className="mt-1 w-full border border-line px-2 py-2">
                    <option value="">전체</option>
                    {["정상", "하자", "격리", "검수필요"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-sm">업무 상태
                  <select name="work" defaultValue={values.work ?? ""} className="mt-1 w-full border border-line px-2 py-2">
                    <option value="">전체</option>
                    {["판매가능", "검토", "예약중", "출고예정", "사용불가", "종료"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-sm">담당 부서
                  <select name="department" defaultValue={values.department ?? ""} className="mt-1 w-full border border-line px-2 py-2">
                    <option value="">전체</option>
                    {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                </label>
                <label className="text-sm">영업 우선순위
                  <select name="priority" defaultValue={values.priority ?? ""} className="mt-1 w-full border border-line px-2 py-2">
                    <option value="">전체</option>
                    {["추천", "우선소진", "일반", "보류"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-sm">발생연도
                  <input name="year" defaultValue={values.year ?? ""} className="mt-1 w-full border border-line px-2 py-2" inputMode="numeric" />
                </label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="promo" value="1" defaultChecked={values.promo === "1"} /> 프로모션</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noimage" value="1" defaultChecked={values.noimage === "1"} /> 이미지 없음</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noowner" value="1" defaultChecked={values.noowner === "1"} /> 담당 없음</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noplan" value="1" defaultChecked={values.noplan === "1"} /> 계획 없음</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="defect" value="1" defaultChecked={values.defect === "1"} /> 하자 있음</label>
              </>
            ) : null}
            <input type="hidden" name="sort" value={values.sort ?? (staff ? "amount" : "code")} />
            <input type="hidden" name="view" value={values.view ?? "card"} />
            <button type="submit" className="bg-filament px-4 py-2 text-sm text-white">적용</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
