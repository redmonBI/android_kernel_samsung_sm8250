import type { Sql } from "./db";

export const SETTING_DEFAULTS: Record<string, string> = {
  company_name: "(주)영진이엘",
  ceo: "권기성",
  address: "경기도 광명시 하안로 60, 광명SK테크노파크 D동 1308호",
  phone: "02-6278-4227",
  fax: "02-2689-4228",
  email: "youngjinel@youngjinel.com",
  filament_email: "yjel1040@naver.com",
  youngjin_kicker: "ONE STOP LIGHTING SOLUTION",
  youngjin_title: "조명의 제조, 유통, 현장, 사후관리를 한 회사에서",
  youngjin_body: "2001년에 설립된 영진이엘은 전기공사를 바탕으로 조명 일을 설계부터 납품, 전국 직영 관리까지 잇습니다. 필라멘트코리아와 램프옴을 운영합니다.",
  filament_kicker: "FILAMENT KOREA",
  filament_title: "상업 조명의 기준을 카탈로그로",
  filament_body: "매장 조명 납품과 전국 시공, 서비스를 맡은 영진이엘의 B2B 브랜드입니다. 사진과 품목코드로 제품을 고릅니다.",
};

export function ensureSettings(db: Sql): void {
  const insert = db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) insert.run(key, value);
}

export function getSettings(db: Sql): Record<string, string> {
  ensureSettings(db);
  const rows = db.prepare("SELECT key, value FROM app_settings").all() as { key: string; value: string }[];
  const settings = { ...SETTING_DEFAULTS };
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}
