import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

const fullRows = [
  {
    NO: 1,
    품목구분: "다운라이트",
    등급: "A",
    재고구분: "장기재고",
    품목코드: "SAMPLE-DL-01",
    품명: "예시 다운라이트",
    규격: "",
    "적용 W": "12W",
    "색온도및 연색성": "3000K",
    각도: "40",
    사이즈: "",
    제조사: "필라멘트코리아",
    재고: 10,
    단가: 15000,
    금액: 150000,
    "24년 입고": "",
    "25년 입고": "",
    "품목 이력": "",
    "소진 방안 및 일정 계획": "",
    "관련 부서": "영업1팀",
  },
];

const deltaRows = fullRows.map((row) => ({ ...row, 처리구분: "UPSERT" }));

function write(name: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "전체 목록");
  const dir = path.join(process.cwd(), "public", "templates");
  fs.mkdirSync(dir, { recursive: true });
  XLSX.writeFile(book, path.join(dir, name));
}

write("full-sync.xlsx", fullRows);
write("delta.xlsx", deltaRows);
console.log("templates written");
