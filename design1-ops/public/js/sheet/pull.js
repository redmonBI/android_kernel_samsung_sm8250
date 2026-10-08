import { FALLBACK_GID, SHEET_ID, latestChecklist, parseSheet, parseTabList } from "./domain.js";

export async function pullLatestSheet() {
  const page = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
  if (!page.ok) throw new Error("시트 목록을 열지 못했습니다.");
  const tabs = parseTabList(await page.text());
  const latest = latestChecklist(tabs);
  const gid = latest?.gid || FALLBACK_GID;
  const csvResponse = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`);
  const csv = await csvResponse.text();
  if (!csvResponse.ok || /<!DOCTYPE html/i.test(csv.slice(0, 180))) throw new Error("시트를 읽지 못했습니다.");
  const tabName = tabs.find((tab) => tab.gid === gid)?.name || latest?.name || "";
  return { rows: parseSheet(csv).rows, gid, tabName };
}
