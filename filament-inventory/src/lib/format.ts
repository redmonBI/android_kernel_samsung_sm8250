export function won(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function qty(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function codeToSlug(code: string): string {
  return code
    .replace(/\+/g, "-plus")
    .replace(/\[/g, "-")
    .replace(/\]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function publicSrc(filePath: string): string {
  if (!filePath) return "";
  return filePath
    .split("/")
    .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
    .join("/");
}

export function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function selectionCsv(items: { code: string; qty: number }[]): string {
  const lines = ["품목코드,수량", ...items.map((item) => `${csvEscape(item.code)},${item.qty}`)];
  return `\uFEFF${lines.join("\n")}\n`;
}

export function blank(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text || "미등록";
}
