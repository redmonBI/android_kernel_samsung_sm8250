import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { selectionCsv } from "@/lib/format";
import { activeList, listItems } from "@/lib/lists";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("로그인이 필요합니다.", { status: 401 });
  const items = listItems(getDb(), activeList(getDb(), user.id)).map((item) => ({ code: item.code, qty: item.qty }));
  const format = new URL(request.url).searchParams.get("format");
  if (format === "xlsx") {
    const sheet = XLSX.utils.json_to_sheet(items.map((item) => ({ 품목코드: item.code, 수량: item.qty })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "ERP");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=erp-items.xlsx",
      },
    });
  }
  return new Response(selectionCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=erp-items.csv",
    },
  });
}
