import crypto from "node:crypto";

export const SHEET_ID = "1P7_T0UkuCXl9USkvgvLR52Ft7OMgl7OMSZe5e6TRuu0";
export const FALLBACK_GID = "514547906";
const TZ = "Asia/Seoul";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const WD_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const PRI_RANK = { 긴급: 0, 높음: 1, 보통: 2, 일반: 3 };
const PRI_WEIGHT = { 긴급: 4, 높음: 3, 보통: 2, 일반: 1 };
const CONTENT_FIELDS = [
  ["status", "상태"],
  ["priority", "우선순위"],
  ["dept", "요청 부서"],
  ["requester", "요청자"],
  ["assignee", "작업자"],
  ["workType", "작업내역"],
  ["project", "프로젝트명"],
  ["detail", "진행 내용"],
  ["start", "시작일"],
  ["dueRaw", "종료(예정)"],
  ["progress", "진도율"],
  ["progressNote", "진행 사항"],
  ["requestNote", "요청·개선"],
  ["memo", "비고"],
];

export const USERS = [
  { id: "jh", password: "lumen-lead", name: "JH", title: "팀장", initials: "JH", role: "lead" },
  { id: "de", password: "lumen-de", name: "DE", title: "선임", initials: "DE", role: "member" },
  { id: "gy", password: "lumen-gy", name: "GY", title: "사원", initials: "GY", role: "member" },
];

export function defaultSettings() {
  return {
    dayLeadHours: 24,
    hourLeadMinutes: 60,
    dateOnlyTime: "18:00",
    followLatest: true,
    popupUrgent: true,
  };
}

export function freshState() {
  return {
    users: USERS.map((user) => ({ ...user })),
    settings: defaultSettings(),
    sheet: {
      gid: "",
      tabName: "",
      tabs: [],
      fetchedAt: "",
      error: "",
      headers: [],
      rows: [],
    },
    baselines: {},
    changes: [],
    decisions: {},
    todos: [],
  };
}

export function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quote = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      quote = true;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function mapHeader(header) {
  const index = {};
  const used = new Set();
  header.forEach((cell, i) => {
    const text = String(cell || "").trim();
    if (/^\d{4}[-./]\s*\d{1,2}/.test(text) || /^\d{4}-\d{2}-\d{2}/.test(text)) {
      index.updatedAt = i;
      used.add(i);
    }
  });
  const specs = [
    ["status", /^상태$/],
    ["priority", /우선/],
    ["dept", /부서/],
    ["requester", /요청자/],
    ["assignee", /작업자/],
    ["workType", /작업\s*내역|업무\s*유형/],
    ["project", /프로젝트/],
    ["detail", /진행\s*내용/],
    ["start", /^시작/],
    ["dueRaw", /종료|마감|기한/],
    ["progress", /진도/],
    ["registeredAt", /등록/],
    ["progressNote", /진행\s*사항/],
    ["requestNote", /개선|추후|요청\s*&/],
    ["memo", /비고/],
  ];
  for (const [key, re] of specs) {
    const found = header.findIndex((cell, idx) => !used.has(idx) && re.test(String(cell || "").trim()));
    if (found >= 0) {
      index[key] = found;
      used.add(found);
    }
  }
  const fallback = [
    "status", "priority", "dept", "requester", "assignee", "workType", "project", "detail",
    "start", "dueRaw", "progress", "registeredAt", "updatedAt", "progressNote", "requestNote", "memo",
  ];
  fallback.forEach((key, i) => {
    if (index[key] == null && i < header.length) index[key] = i;
  });
  return index;
}

function hashKey(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function parseSheet(csvText) {
  const table = parseCsv(csvText);
  if (!table.length) return { headers: [], rows: [] };
  const headers = table[0].map((cell) => String(cell || "").trim());
  const map = mapHeader(headers);
  const raws = [];
  for (let r = 1; r < table.length; r += 1) {
    const line = table[r];
    const get = (key) => String(line[map[key]] ?? "").replace(/\r/g, "").trim();
    const row = {
      status: get("status"),
      priority: get("priority"),
      dept: get("dept"),
      requester: get("requester"),
      assignee: get("assignee"),
      workType: get("workType"),
      project: get("project"),
      detail: get("detail"),
      start: get("start"),
      dueRaw: get("dueRaw"),
      progress: get("progress"),
      registeredAt: get("registeredAt"),
      updatedAt: get("updatedAt"),
      progressNote: get("progressNote"),
      requestNote: get("requestNote"),
      memo: get("memo"),
    };
    if (!row.project && !row.detail && !row.assignee && !row.status) continue;
    raws.push(row);
  }
  const counts = new Map();
  const rows = raws.map((row) => {
    const basis = [row.registeredAt, row.project, row.assignee, row.detail, row.start].map(clean).join("|");
    const base = hashKey(basis || JSON.stringify(row));
    const seen = (counts.get(base) || 0) + 1;
    counts.set(base, seen);
    return { ...row, key: seen === 1 ? base : `${base}-${seen}` };
  });
  return { headers, rows };
}

function contentDiff(before, after) {
  const diffs = [];
  for (const [key, label] of CONTENT_FIELDS) {
    const left = String(before[key] || "").trim();
    const right = String(after[key] || "").trim();
    if (left !== right) diffs.push({ field: label, before: left, after: right });
  }
  return diffs;
}

function makeChange(kind, row, meta, summary, diffs) {
  return {
    id: meta.id(),
    at: meta.at,
    gid: meta.gid,
    tabName: meta.tabName || "",
    kind,
    key: row?.key || "",
    project: row?.project || "",
    assignee: row?.assignee || "",
    priority: row?.priority || "",
    summary,
    diffs,
    acked: {},
  };
}

export function diffRows(prev, next, meta) {
  if (!prev) return { changes: [], initial: true };
  const prevMap = new Map(prev.map((row) => [row.key, row]));
  const nextMap = new Map(next.map((row) => [row.key, row]));
  const changes = [];
  let touches = 0;
  for (const row of next) {
    const old = prevMap.get(row.key);
    if (!old) {
      const name = row.project || row.detail || "이름 없는 업무";
      changes.push(makeChange("added", row, meta, `${name} 업무가 시트에 추가되었습니다.`, []));
      continue;
    }
    const diffs = contentDiff(old, row);
    if (diffs.length) {
      const name = row.project || row.detail || "업무";
      changes.push(makeChange("updated", row, meta, `${name} 내용이 바뀌었습니다.`, diffs));
    } else if ((old.updatedAt || "") !== (row.updatedAt || "")) {
      touches += 1;
    }
  }
  for (const row of prev) {
    if (!nextMap.has(row.key)) {
      const name = row.project || row.detail || "업무";
      changes.push(makeChange("removed", row, meta, `${name} 줄이 시트에서 빠졌습니다.`, []));
    }
  }
  if (touches) {
    changes.push(makeChange("touched", null, meta, `수정 시각만 바뀐 줄이 ${touches}건 있습니다.`, []));
  }
  return { changes, initial: false };
}

export function weekScore(name, year = 2026) {
  const match = String(name || "").match(/(\d{1,2})\.(\d{1,2})\s*[-~]\s*(\d{1,2})\.(\d{1,2})/);
  if (!match) return null;
  const startMonth = Number(match[1]);
  const startDay = Number(match[2]);
  const endMonth = Number(match[3]);
  const endDay = Number(match[4]);
  let endYear = year;
  if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) endYear += 1;
  return endYear * 10000 + endMonth * 100 + endDay;
}

export function latestChecklist(tabs, year = 2026) {
  let best = null;
  let bestScore = -1;
  for (const tab of tabs || []) {
    if (!/업무 체크 리스트/.test(tab.name || "")) continue;
    const score = weekScore(tab.name, year);
    if (score == null || score <= bestScore) continue;
    bestScore = score;
    best = tab;
  }
  return best;
}

export function parseTabList(html) {
  const tabs = [];
  const re = /\[(\d+),0,\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\"]+)\\"/g;
  for (const match of String(html || "").matchAll(re)) {
    tabs.push({ index: Number(match[1]), gid: match[2], name: match[3] });
  }
  return tabs;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function zoned(year, month, day, hour, minute) {
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+09:00`);
}

export function seoulParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

export function isoFromParts(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function addDaysIso(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function weekRange(now = new Date()) {
  const parts = seoulParts(now);
  const today = isoFromParts(parts);
  const weekday = WD_EN[parts.weekday] ?? 0;
  const monday = addDaysIso(today, weekday === 0 ? -6 : 1 - weekday);
  return {
    today,
    monday,
    sunday: addDaysIso(monday, 6),
    nextMonday: addDaysIso(monday, 7),
    nextSunday: addDaysIso(monday, 13),
  };
}

export function formatWhen(date) {
  const parts = seoulParts(date);
  const index = WD_EN[parts.weekday] ?? 0;
  return `${parts.month}월 ${parts.day}일 (${WD[index]}) ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatDay(iso) {
  if (!iso) return "";
  const instant = zoned(...iso.split("-").map(Number), 12, 0);
  const parts = seoulParts(instant);
  const index = WD_EN[parts.weekday] ?? 0;
  return `${parts.month}월 ${parts.day}일 (${WD[index]})`;
}

export function parseDue(raw, dateOnlyTime = "18:00") {
  const text = String(raw ?? "").trim();
  if (!text || /^[-—~.]+$/.test(text) || text === "미정" || text === "없음") return null;
  const timeMatch = text.match(/(\d{1,2})\s*:\s*(\d{2})/);
  let hour;
  let minute;
  let hasTime = false;
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    hasTime = true;
  } else {
    const [fallbackHour, fallbackMinute] = String(dateOnlyTime || "18:00").split(":").map(Number);
    hour = fallbackHour;
    minute = fallbackMinute;
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  const datePart = text.replace(/(\d{1,2})\s*:\s*(\d{2})/, " ");
  const nums = datePart.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  let year;
  let month;
  let day;
  if (nums[0].length === 4 || Number(nums[0]) > 31) {
    year = Number(nums[0]);
    month = Number(nums[1]);
    day = Number(nums[2] || 1);
  } else {
    year = seoulParts(new Date()).year;
    month = Number(nums[0]);
    day = Number(nums[1]);
  }
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const instant = zoned(year, month, day, hour, minute);
  if (Number.isNaN(instant.getTime())) return null;
  return {
    year, month, day, hour, minute, hasTime,
    assumedTime: !hasTime,
    instant,
    iso: instant.toISOString(),
    text: `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`,
  };
}

export function dueLabel(parsed) {
  if (!parsed) return "종료일 없음";
  const instant = parsed.instant || zoned(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute);
  const parts = seoulParts(instant);
  const index = WD_EN[parts.weekday] ?? 0;
  return `${parsed.month}월 ${parsed.day}일 (${WD[index]}) ${pad(parsed.hour)}:${pad(parsed.minute)}`;
}

export function classifyReminder(parsed, now, settings) {
  if (!parsed?.instant) return null;
  const delta = parsed.instant.getTime() - now.getTime();
  const dayMs = Number(settings.dayLeadHours) * 3600000;
  const hourMs = Number(settings.hourLeadMinutes) * 60000;
  if (delta < 0) return { kind: "overdue", lateMs: -delta };
  if (delta <= hourMs) return { kind: "hour", leftMs: delta };
  if (delta <= dayMs) return { kind: "day", leftMs: delta };
  return null;
}

export function isClosedStatus(status) {
  return /^(완료|종료|닫힘)/.test(String(status || "").trim());
}

export function peopleOf(assignee) {
  return String(assignee || "")
    .split(/[,/&+]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function blankDecision() {
  return {
    important: false,
    importantAcked: false,
    deskStatus: "",
    snoozeUntil: "",
    overrideDue: "",
    overrideNote: "",
    note: "",
    quietUntil: "",
    history: [],
  };
}

function decisionFor(state, key) {
  return state.decisions[key] || blankDecision();
}

function reminderMeta(kind, parsed, now) {
  if (kind === "hour") return { label: "한 시간 전", rank: 0 };
  if (kind === "overdue") return { label: "기한 지남", rank: 1 };
  if (kind === "day") {
    const today = isoFromParts(seoulParts(now || new Date()));
    const dueDay = parsed ? `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}` : "";
    return { label: dueDay === today ? "오늘 마감" : "하루 전", rank: 2 };
  }
  return { label: "", rank: 9 };
}

function pushHistory(entry, user, action, detail, now) {
  entry.history = entry.history || [];
  entry.history.push({
    at: now.toISOString(),
    user: user.initials || user.name,
    action,
    detail: detail || "",
  });
  if (entry.history.length > 30) entry.history = entry.history.slice(-30);
}

export function taskViews(state, user, now) {
  const settings = state.settings || defaultSettings();
  return (state.sheet.rows || []).map((row) => {
    const decision = decisionFor(state, row.key);
    const sheetDue = parseDue(row.dueRaw, settings.dateOnlyTime);
    const effective = decision.overrideDue ? parseDue(decision.overrideDue, settings.dateOnlyTime) : sheetDue;
    const closed = isClosedStatus(row.status) || decision.deskStatus === "done";
    const snoozed = decision.snoozeUntil && new Date(decision.snoozeUntil).getTime() > now.getTime();
    const reminder = closed || snoozed ? null : classifyReminder(effective, now, settings);
    const meta = reminderMeta(reminder?.kind, effective, now);
    const mine = peopleOf(row.assignee).some((name) => name.toUpperCase() === String(user.initials || "").toUpperCase());
    return {
      ...row,
      mine,
      closed,
      sheetClosed: isClosedStatus(row.status),
      deskDone: decision.deskStatus === "done",
      important: !!decision.important,
      importantAcked: !!decision.importantAcked,
      snoozeUntil: decision.snoozeUntil || "",
      quietUntil: decision.quietUntil || "",
      snoozeLabel: decision.snoozeUntil ? formatWhen(new Date(decision.snoozeUntil)) : "",
      overrideDue: decision.overrideDue || "",
      overrideNote: decision.overrideNote || "",
      note: decision.note || "",
      history: decision.history || [],
      sheetDueLabel: dueLabel(sheetDue),
      dueLabel: dueLabel(effective),
      assumedTime: !!effective?.assumedTime,
      dueIso: effective?.iso || "",
      reminderKind: reminder?.kind || "",
      reminderLabel: meta.label,
      reminderRank: meta.rank,
      priorityRank: PRI_RANK[row.priority] ?? 4,
    };
  }).sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    if (a.reminderRank !== b.reminderRank) return a.reminderRank - b.reminderRank;
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    if (a.dueIso !== b.dueIso) return (a.dueIso || "9999").localeCompare(b.dueIso || "9999");
    return String(a.project).localeCompare(String(b.project), "ko");
  });
}

function blockReason(task, settings, now) {
  if (task.closed) return null;
  if (task.quietUntil && new Date(task.quietUntil).getTime() > now.getTime()) return null;
  if (task.reminderKind === "hour") return { kind: "hour", label: "한 시간 전" };
  if (task.important && !task.importantAcked) return { kind: "important", label: "중요 확인" };
  if (settings.popupUrgent !== false && task.priority === "긴급" && task.reminderKind) {
    return { kind: task.reminderKind, label: task.reminderLabel || "체크" };
  }
  if (task.priority === "높음" && task.reminderKind === "overdue" && task.dueIso) {
    const late = now.getTime() - new Date(task.dueIso).getTime();
    if (late >= 0 && late < 36 * 3600000) return { kind: "overdue", label: "기한 지남" };
  }
  return null;
}

export function workloadOf(tasks) {
  const buckets = new Map();
  const ensure = (name) => {
    if (!buckets.has(name)) {
      buckets.set(name, { name, open: 0, urgent: 0, high: 0, weight: 0, dueSoon: 0, titles: [] });
    }
    return buckets.get(name);
  };
  for (const task of tasks) {
    if (task.closed) continue;
    const people = peopleOf(task.assignee);
    const names = people.length ? people : ["미배정"];
    for (const name of names) {
      const bucket = ensure(name);
      bucket.open += 1;
      if (task.priority === "긴급") bucket.urgent += 1;
      if (task.priority === "높음") bucket.high += 1;
      bucket.weight += PRI_WEIGHT[task.priority] ?? 1;
      if (task.reminderKind) bucket.dueSoon += 1;
      if (bucket.titles.length < 4 && task.project) bucket.titles.push(task.project);
    }
  }
  return [...buckets.values()].sort((a, b) => b.weight - a.weight || b.open - a.open || a.name.localeCompare(b.name, "ko"));
}

function norm(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

export function duplicatesOf(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    if (task.closed || !norm(task.project)) continue;
    const key = norm(task.project);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const found = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const details = new Set(list.map((task) => norm(task.detail)));
    found.push({
      project: list[0].project,
      sameDetail: details.size === 1,
      rows: list.map((task) => ({
        key: task.key,
        assignee: task.assignee || "미배정",
        detail: task.detail,
        status: task.status,
        workType: task.workType,
      })),
    });
  }
  return found.sort((a, b) => b.rows.length - a.rows.length);
}

export function insightsOf(workload, duplicates, tasks) {
  const lines = [];
  const people = workload.filter((item) => item.name !== "미배정");
  const urgent = [...people].sort((a, b) => b.urgent - a.urgent)[0];
  if (urgent?.urgent) lines.push(`${urgent.name}에게 긴급 업무가 ${urgent.urgent}건 있습니다.`);
  if (people.length >= 2) {
    const ranked = [...people].sort((a, b) => b.open - a.open);
    const gap = ranked[0].open - ranked[ranked.length - 1].open;
    if (gap >= 3) {
      lines.push(`${ranked[0].name}의 열린 업무가 ${ranked[ranked.length - 1].name}보다 ${gap}건 많습니다. 분장을 다시 보면 좋습니다.`);
    }
  }
  const unassigned = tasks.filter((task) => !task.closed && !peopleOf(task.assignee).length);
  if (unassigned.length) lines.push(`담당이 비어 있는 업무가 ${unassigned.length}건 있습니다.`);
  if (duplicates.length) {
    lines.push(`같은 프로젝트 이름이 겹친 묶음이 ${duplicates.length}개 있습니다.`);
  }
  const stalled = tasks.filter((task) => !task.closed && task.status === "수시체크");
  if (stalled.length) lines.push(`수시체크로 남아 있는 업무가 ${stalled.length}건 있습니다.`);
  return lines;
}

function todoDue(todo, settings) {
  if (!todo.dueDate) return null;
  const time = todo.dueTime || "";
  const raw = time ? `${todo.dueDate} ${time}` : todo.dueDate;
  const parsed = parseDue(raw, settings.dateOnlyTime);
  if (parsed && !time) parsed.assumedTime = true;
  if (parsed && time) parsed.assumedTime = false;
  return parsed;
}

export function presentTodo(todo, settings, now) {
  const range = weekRange(now);
  const due = todoDue(todo, settings);
  const closed = todo.status === "done";
  const snoozed = todo.snoozeUntil && new Date(todo.snoozeUntil).getTime() > now.getTime();
  const reminder = closed || snoozed ? null : classifyReminder(due, now, settings);
  const meta = reminderMeta(reminder?.kind, due, now);
  const pulledToday = !closed && (todo.bucket === "today" || (todo.dueDate && todo.dueDate <= range.today));
  return {
    ...todo,
    closed,
    dueLabel: due ? dueLabel(due) : (todo.bucket === "today" ? "오늘" : "날짜 없음"),
    assumedTime: !!due?.assumedTime && !todo.dueTime,
    dueIso: due?.iso || "",
    reminderKind: reminder?.kind || "",
    reminderLabel: meta.label,
    pulledToday,
    quietUntil: todo.quietUntil || "",
    snoozeLabel: todo.snoozeUntil ? formatWhen(new Date(todo.snoozeUntil)) : "",
  };
}

function blockRank(item) {
  if (item.kind === "hour") return 0;
  if (item.source === "change" && item.changeKind === "new-tab") return 1;
  if (item.priority === "긴급" && item.kind === "overdue") return 2;
  if (item.priority === "긴급") return 3;
  if (item.kind === "important") return 4;
  if (item.kind === "overdue") return 5;
  return 6;
}

export function buildDesk(state, user, now = new Date()) {
  const settings = { ...defaultSettings(), ...(state.settings || {}) };
  const tasks = taskViews(state, user, now);
  const reminders = tasks.filter((task) => task.reminderKind);
  const workload = workloadOf(tasks);
  const duplicates = duplicatesOf(tasks);
  const insights = insightsOf(workload, duplicates, tasks);
  const mineSheet = tasks.filter((task) => task.mine && !task.closed);
  const myTodos = (state.todos || [])
    .filter((todo) => todo.userId === user.id)
    .map((todo) => presentTodo(todo, settings, now))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || (a.dueIso || "9999").localeCompare(b.dueIso || "9999"));

  const blocking = [];
  for (const task of tasks) {
    const block = blockReason(task, settings, now);
    if (!block) continue;
    blocking.push({
      id: `sheet:${task.key}:${block.kind}:${task.dueIso || "none"}:${task.important ? "i" : ""}`,
      source: "sheet",
      ref: task.key,
      kind: block.kind,
      changeKind: "",
      title: task.project || task.detail || "업무",
      priority: task.priority,
      lines: [
        [task.assignee || "미배정", task.workType, task.status].filter(Boolean).join(" · "),
        task.detail,
        task.overrideDue ? `데스크에서 바꾼 일정 · ${task.dueLabel}` : task.dueLabel,
        task.assumedTime ? `시트에는 날짜만 있어 ${settings.dateOnlyTime} 기준으로 봅니다.` : "",
      ].filter(Boolean),
      dueLabel: task.dueLabel,
      assumedTime: task.assumedTime,
      label: block.label,
    });
  }
  for (const todo of myTodos) {
    if (todo.closed) continue;
    if (todo.quietUntil && new Date(todo.quietUntil).getTime() > now.getTime()) continue;
    const important = todo.important && !todo.importantAcked;
    const hour = todo.reminderKind === "hour";
    const urgentDay = false;
    if (!important && !hour && !urgentDay) continue;
    const kind = hour ? "hour" : "important";
    blocking.push({
      id: `todo:${todo.id}:${kind}:${todo.dueIso || "none"}`,
      source: "todo",
      ref: todo.id,
      kind,
      changeKind: "",
      title: todo.title,
      priority: todo.important ? "중요" : "",
      lines: [todo.note, todo.dueLabel, todo.assumedTime ? `시간은 ${settings.dateOnlyTime} 기준입니다.` : ""].filter(Boolean),
      dueLabel: todo.dueLabel,
      assumedTime: todo.assumedTime,
      label: hour ? "한 시간 전" : "중요 확인",
    });
  }
  for (const change of state.changes || []) {
    if (change.acked?.[user.id]) continue;
    const hard = change.kind === "new-tab" || (change.priority === "긴급" && ["added", "updated", "removed"].includes(change.kind));
    if (!hard) continue;
    blocking.push({
      id: `change:${change.id}`,
      source: "change",
      ref: change.id,
      kind: change.kind,
      changeKind: change.kind,
      title: change.summary,
      priority: change.priority,
      lines: [
        change.tabName,
        ...(change.diffs || []).slice(0, 4).map((diff) => `${diff.field}: ${diff.before || "비어 있음"} → ${diff.after || "비어 있음"}`),
      ].filter(Boolean),
      dueLabel: "",
      assumedTime: false,
      label: change.kind === "new-tab" ? "새 주간 시트" : "시트 변경",
      taskKey: change.key || "",
    });
  }
  blocking.sort((a, b) => blockRank(a) - blockRank(b));

  const range = weekRange(now);
  const todos = { today: [], week: [], next: [], later: [], done: [] };
  for (const todo of myTodos) {
    if (todo.closed) {
      todos.done.push(todo);
      continue;
    }
    if (todo.pulledToday) {
      todos.today.push(todo);
      continue;
    }
    const inWeek = todo.dueDate && todo.dueDate >= range.monday && todo.dueDate <= range.sunday;
    const inNext = todo.dueDate && todo.dueDate >= range.nextMonday && todo.dueDate <= range.nextSunday;
    if (todo.bucket === "week" || inWeek) todos.week.push(todo);
    else if (todo.bucket === "next" || inNext) todos.next.push(todo);
    else todos.later.push(todo);
  }
  todos.done = todos.done.slice(0, 12);

  const changes = (state.changes || []).slice(0, 80).map((change) => ({
    ...change,
    atLabel: formatWhen(new Date(change.at)),
    seen: !!change.acked?.[user.id],
  }));

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${state.sheet.gid || FALLBACK_GID}`;
  return {
    nowLabel: formatWhen(now),
    todayLabel: formatDay(range.today),
    weekLabel: `${formatDay(range.monday)} – ${formatDay(range.sunday)}`,
    nextWeekLabel: `${formatDay(range.nextMonday)} – ${formatDay(range.nextSunday)}`,
    me: {
      id: user.id,
      name: user.name,
      title: user.title,
      initials: user.initials,
      role: user.role,
    },
    sheet: {
      id: SHEET_ID,
      gid: state.sheet.gid || "",
      tabName: state.sheet.tabName || "",
      url: sheetUrl,
      fetchedAt: state.sheet.fetchedAt || "",
      fetchedAtLabel: state.sheet.fetchedAt ? formatWhen(new Date(state.sheet.fetchedAt)) : "",
      error: state.sheet.error || "",
      followLatest: settings.followLatest !== false,
      tabs: (state.sheet.tabs || []).filter((tab) => /업무 체크 리스트/.test(tab.name || "")).map((tab) => ({
        gid: tab.gid,
        name: tab.name,
        current: tab.gid === state.sheet.gid,
      })),
    },
    settings: {
      dayLeadHours: settings.dayLeadHours,
      hourLeadMinutes: settings.hourLeadMinutes,
      dateOnlyTime: settings.dateOnlyTime,
      followLatest: settings.followLatest !== false,
      popupUrgent: settings.popupUrgent !== false,
    },
    insights,
    counts: {
      blocking: blocking.length,
      reminders: reminders.length,
      changes: changes.filter((change) => !change.seen && change.kind !== "touched").length,
      open: tasks.filter((task) => !task.closed).length,
      mineOpen: mineSheet.length,
      todosOpen: myTodos.filter((todo) => !todo.closed).length,
    },
    reminders,
    mineSheet,
    tasks,
    workload,
    duplicates,
    changes,
    todos,
    blocking,
  };
}

function ensureDecision(state, key) {
  if (!state.decisions[key]) state.decisions[key] = blankDecision();
  return state.decisions[key];
}

export function snoozeInstant(mode, now, until) {
  if (mode === "tomorrow") {
    const today = isoFromParts(seoulParts(now));
    return zoned(...addDaysIso(today, 1).split("-").map(Number), 9, 0).toISOString();
  }
  if (mode === "until" && until) {
    const parsed = parseDue(String(until).replace("T", " "), "09:00");
    if (parsed) return parsed.instant.toISOString();
  }
  return new Date(now.getTime() + 3600000).toISOString();
}

function assertLead(user) {
  if (user.role !== "lead") {
    const error = new Error("팀장만 바꿀 수 있습니다.");
    error.status = 403;
    throw error;
  }
}

export function applyAction(state, user, body, now = new Date()) {
  const type = body?.type;
  if (type === "ack") {
    const ids = body.all
      ? state.changes.map((change) => change.id)
      : [body.id];
    for (const change of state.changes) {
      if (!ids.includes(change.id)) continue;
      change.acked = change.acked || {};
      change.acked[user.id] = now.toISOString();
    }
    return;
  }
  if (type === "check") {
    const row = (state.sheet.rows || []).find((item) => item.key === body.key);
    if (!row) {
      const error = new Error("시트에서 해당 업무를 찾지 못했습니다.");
      error.status = 404;
      throw error;
    }
    const decision = ensureDecision(state, row.key);
    if (body.action === "done") {
      decision.deskStatus = "done";
      decision.snoozeUntil = "";
      decision.note = String(body.note || decision.note || "").slice(0, 500);
      pushHistory(decision, user, "완료", decision.note, now);
      return;
    }
    if (body.action === "reopen") {
      decision.deskStatus = "";
      pushHistory(decision, user, "다시 열기", "", now);
      return;
    }
    if (body.action === "snooze") {
      decision.snoozeUntil = snoozeInstant(body.mode || "1h", now, body.until);
      decision.quietUntil = decision.snoozeUntil;
      decision.deskStatus = decision.deskStatus === "done" ? "" : decision.deskStatus;
      pushHistory(decision, user, "재확인", formatWhen(new Date(decision.snoozeUntil)), now);
      return;
    }
    if (body.action === "reschedule") {
      const date = String(body.date || "").trim();
      const time = String(body.time || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const error = new Error("바꿀 날짜를 선택하세요.");
        error.status = 400;
        throw error;
      }
      const clock = /^\d{2}:\d{2}$/.test(time) ? time : (state.settings.dateOnlyTime || "18:00");
      decision.overrideDue = `${date} ${clock}`;
      decision.overrideNote = String(body.note || "").slice(0, 300);
      decision.snoozeUntil = "";
      decision.quietUntil = "";
      decision.deskStatus = "";
      pushHistory(decision, user, "일정 변경", `${decision.overrideDue} ${decision.overrideNote}`.trim(), now);
      return;
    }
    if (body.action === "ack-important") {
      decision.importantAcked = true;
      pushHistory(decision, user, "중요 확인", "", now);
      return;
    }
    if (body.action === "flag") {
      decision.important = !!body.important;
      decision.importantAcked = false;
      pushHistory(decision, user, decision.important ? "중요 표시" : "중요 해제", "", now);
      return;
    }
  }
  if (type === "todo") {
    return applyTodo(state, user, body, now);
  }
  if (type === "settings") {
    assertLead(user);
    const next = { ...state.settings };
    const day = Number(body.dayLeadHours);
    const hour = Number(body.hourLeadMinutes);
    if (Number.isFinite(day)) next.dayLeadHours = Math.min(168, Math.max(1, day));
    if (Number.isFinite(hour)) next.hourLeadMinutes = Math.min(24 * 60, Math.max(5, hour));
    if (/^\d{2}:\d{2}$/.test(body.dateOnlyTime || "")) next.dateOnlyTime = body.dateOnlyTime;
    if (typeof body.followLatest === "boolean") next.followLatest = body.followLatest;
    if (typeof body.popupUrgent === "boolean") next.popupUrgent = body.popupUrgent;
    state.settings = next;
    return;
  }
  if (type === "watch") {
    assertLead(user);
    const gid = String(body.gid || "");
    if (body.followLatest === true) {
      state.settings.followLatest = true;
      return { sync: true };
    }
    if (!/^\d{6,}$/.test(gid)) {
      const error = new Error("시트 탭을 다시 선택하세요.");
      error.status = 400;
      throw error;
    }
    state.settings.followLatest = false;
    state.sheet.gid = gid;
    const tab = (state.sheet.tabs || []).find((item) => item.gid === gid);
    if (tab) state.sheet.tabName = tab.name;
    return { sync: true };
  }
  if (type === "defer") {
    const desk = buildDesk(state, user, now);
    const until = snoozeInstant("1h", now);
    for (const item of desk.blocking) {
      if (item.source === "change") {
        const change = state.changes.find((entry) => entry.id === item.ref);
        if (!change) continue;
        change.acked = change.acked || {};
        change.acked[user.id] = now.toISOString();
      } else if (item.source === "sheet") {
        const decision = ensureDecision(state, item.ref);
        decision.snoozeUntil = until;
        decision.quietUntil = until;
        pushHistory(decision, user, "재확인", "한 시간 뒤", now);
      } else if (item.source === "todo") {
        const todo = state.todos.find((entry) => entry.id === item.ref && entry.userId === user.id);
        if (!todo) continue;
        todo.snoozeUntil = until;
        todo.quietUntil = until;
        pushHistory(todo, user, "재확인", "한 시간 뒤", now);
      }
    }
    return;
  }
  if (type === "sync") return { sync: true };
  const error = new Error("알 수 없는 요청입니다.");
  error.status = 400;
  throw error;
}

function applyTodo(state, user, body, now) {
  const mine = () => state.todos.find((todo) => todo.id === body.id && todo.userId === user.id);
  if (body.action === "create") {
    const title = String(body.title || "").trim();
    if (!title) {
      const error = new Error("할 일 내용을 적으세요.");
      error.status = 400;
      throw error;
    }
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || "") ? body.dueDate : "";
    const dueTime = /^\d{2}:\d{2}$/.test(body.dueTime || "") ? body.dueTime : "";
    const bucket = ["today", "week", "next", "later"].includes(body.bucket) ? body.bucket : "today";
    const todo = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: title.slice(0, 200),
      note: String(body.note || "").slice(0, 2000),
      dueDate,
      dueTime,
      bucket,
      status: "open",
      important: !!body.important,
      importantAcked: false,
      snoozeUntil: "",
      quietUntil: "",
      createdAt: now.toISOString(),
      history: [],
    };
    if (bucket === "today" && !todo.dueDate) todo.dueDate = isoFromParts(seoulParts(now));
    if (bucket === "next" && !todo.dueDate) todo.dueDate = weekRange(now).nextMonday;
    if (bucket === "week" && !todo.dueDate) todo.dueDate = weekRange(now).sunday;
    pushHistory(todo, user, "등록", todo.title, now);
    state.todos.push(todo);
    return;
  }
  if (body.action === "restore") {
    const todo = body.todo;
    if (!todo || todo.userId !== user.id || !todo.id) return;
    if (!state.todos.some((item) => item.id === todo.id)) state.todos.push(todo);
    return;
  }
  const todo = mine();
  if (!todo) {
    const error = new Error("할 일을 찾지 못했습니다.");
    error.status = 404;
    throw error;
  }
  if (body.action === "delete") {
    state.todos = state.todos.filter((item) => item.id !== todo.id);
    return { deleted: todo };
  }
  if (body.action === "status") {
    const status = ["open", "doing", "done"].includes(body.status) ? body.status : "open";
    todo.status = status;
    if (status === "done") todo.snoozeUntil = "";
    pushHistory(todo, user, status === "done" ? "완료" : status === "doing" ? "진행중" : "다시 열기", "", now);
    return;
  }
  if (body.action === "move") {
    moveTodo(todo, body.bucket, now);
    pushHistory(todo, user, "이동", bucketLabel(todo.bucket), now);
    return;
  }
  if (body.action === "snooze") {
    todo.snoozeUntil = snoozeInstant(body.mode || "1h", now, body.until);
    todo.quietUntil = todo.snoozeUntil;
    if (todo.status === "done") todo.status = "open";
    pushHistory(todo, user, "재확인", formatWhen(new Date(todo.snoozeUntil)), now);
    return;
  }
  if (body.action === "reschedule") {
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const error = new Error("바꿀 날짜를 선택하세요.");
      error.status = 400;
      throw error;
    }
    todo.dueDate = date;
    todo.dueTime = /^\d{2}:\d{2}$/.test(body.dueTime || body.time || "") ? (body.dueTime || body.time) : "";
    todo.snoozeUntil = "";
    todo.quietUntil = "";
    todo.status = todo.status === "done" ? "open" : todo.status;
    const range = weekRange(now);
    if (todo.dueDate < range.today) todo.bucket = "today";
    else if (todo.dueDate === range.today) todo.bucket = "today";
    else if (todo.dueDate <= range.sunday) todo.bucket = "week";
    else if (todo.dueDate <= range.nextSunday) todo.bucket = "next";
    else todo.bucket = "later";
    pushHistory(todo, user, "일정 변경", `${todo.dueDate} ${todo.dueTime}`.trim(), now);
    return;
  }
  if (body.action === "ack-important") {
    todo.importantAcked = true;
    pushHistory(todo, user, "중요 확인", "", now);
    return;
  }
  if (body.action === "flag") {
    todo.important = !!body.important;
    todo.importantAcked = false;
    pushHistory(todo, user, todo.important ? "중요 표시" : "중요 해제", "", now);
    return;
  }
  if (body.action === "update") {
    if (body.title != null) todo.title = String(body.title || "").trim().slice(0, 200) || todo.title;
    if (body.note != null) todo.note = String(body.note || "").slice(0, 2000);
    pushHistory(todo, user, "수정", todo.title, now);
  }
}

function bucketLabel(bucket) {
  if (bucket === "today") return "오늘";
  if (bucket === "week") return "이번 주";
  if (bucket === "next") return "다음 주";
  return "나중";
}

function moveTodo(todo, bucket, now) {
  const range = weekRange(now);
  if (bucket === "today") {
    todo.bucket = "today";
    todo.dueDate = range.today;
    return;
  }
  if (bucket === "week") {
    todo.bucket = "week";
    if (!todo.dueDate || todo.dueDate < range.monday || todo.dueDate > range.sunday) todo.dueDate = range.sunday;
    return;
  }
  if (bucket === "next") {
    todo.bucket = "next";
    const shifted = todo.dueDate ? addDaysIso(todo.dueDate, 7) : range.nextMonday;
    todo.dueDate = shifted > range.sunday ? shifted : range.nextMonday;
    return;
  }
  todo.bucket = "later";
  if (todo.dueDate && todo.dueDate <= range.nextSunday) todo.dueDate = addDaysIso(range.nextSunday, 7);
}

export function sheetSentence(row, decision) {
  const status = decision?.deskStatus === "done" ? "완료" : (row?.status || "");
  const due = decision?.overrideDue || row?.dueRaw || "";
  return [`상태 ${status}`, row?.project, row?.assignee, due && `종료 ${due}`, decision?.note].filter(Boolean).join(" · ");
}
