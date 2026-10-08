import crypto from "node:crypto";
import {
  SHEET_ID,
  applyTodo,
  classifyReminder,
  diffRows,
  dueLabel,
  isClosedStatus,
  parseDue,
  snoozeInstant,
} from "./domain.js";

const CLOSED = new Set(["완료", "완료(추가)", "취소"]);

export function liveSettings(state) {
  return {
    dayLeadHours: 24,
    hourLeadMinutes: 60,
    dateOnlyTime: "18:00",
    popupUrgent: true,
    ...(state.liveSettings || {}),
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoDate(parsed) {
  if (!parsed) return "";
  return `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}`;
}

function clock(parsed) {
  if (!parsed?.hasTime) return "";
  return `${pad(parsed.hour)}:${pad(parsed.minute)}`;
}

function percent(value) {
  const match = String(value || "").match(/-?\d+/);
  if (!match || match[0] === "-") return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(100, number);
}

function norm(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function workTypesOf(value) {
  return String(value || "").split(/[,/]/).map((item) => item.trim()).filter(Boolean);
}

export function ensureSheetWeek(state, tabName) {
  const match = String(tabName || "").match(/(\d{1,2})\.(\d{1,2})\s*[-~–]\s*(\d{1,2})\.(\d{1,2})/);
  if (!match) return { week: state.weeks[state.weeks.length - 1], created: false };
  const startMonth = Number(match[1]);
  const startDay = Number(match[2]);
  const endMonth = Number(match[3]);
  const endDay = Number(match[4]);
  let startYear = 2026;
  let endYear = 2026;
  if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) endYear += 1;
  const id = `${startYear}-${pad(startMonth)}${pad(startDay)}`;
  let week = state.weeks.find((item) => item.id === id);
  const created = !week;
  if (!week) {
    const index = Math.max(0, ...state.weeks.map((item) => item.index || 0)) + 1;
    week = {
      id,
      label: `${pad(startMonth)}.${pad(startDay)}–${pad(endMonth)}.${pad(endDay)}`,
      start: `${startYear}-${pad(startMonth)}-${pad(startDay)}`,
      end: `${endYear}-${pad(endMonth)}-${pad(endDay)}`,
      month: startMonth,
      year: startYear,
      index,
    };
    state.weeks.push(week);
  }
  return { week, created };
}

function findTask(state, row, used) {
  const keyed = state.tasks.find((task) => task.sheetKey === row.key && !used.has(task.id));
  if (keyed) return keyed;
  const name = norm(row.project);
  if (!name) return null;
  const candidates = state.tasks.filter((task) => norm(task.project) === name && !used.has(task.id));
  if (candidates.length === 1) return candidates[0];
  const samePerson = candidates.filter((task) => String(task.assignee || "").toUpperCase() === String(row.assignee || "").toUpperCase());
  if (samePerson.length === 1) return samePerson[0];
  const open = samePerson.filter((task) => !CLOSED.has(task.status));
  if (open.length === 1) return open[0];
  return null;
}

function snapshot(task, week, fields) {
  const body = {
    weekId: week.id,
    status: fields.status,
    priority: fields.priority,
    progress: fields.progress,
    assignee: fields.assignee,
    due: fields.due,
    progressNote: fields.progressNote,
    dept: fields.dept,
    workTypes: fields.workTypes,
  };
  const current = (task.snapshots || []).find((item) => item.weekId === week.id);
  if (!current) task.snapshots.push(body);
  else Object.assign(current, body);
  task.lastWeekId = week.id;
  if (!task.firstWeekId) task.firstWeekId = week.id;
}

function fieldsFrom(row, settings) {
  const due = parseDue(row.dueRaw, settings.dateOnlyTime);
  const start = parseDue(row.start, settings.dateOnlyTime);
  return {
    project: row.project || row.detail || "이름 없는 업무",
    summary: row.detail || row.project || "",
    dept: row.dept || "",
    requester: row.requester || "",
    assignee: row.assignee || "",
    workTypes: workTypesOf(row.workType),
    priority: row.priority || "보통",
    status: row.status || "진행중",
    progress: percent(row.progress),
    start: isoDate(start),
    due: isoDate(due),
    dueTime: clock(due),
    progressNote: row.progressNote || "",
    followUp: row.requestNote || "",
    note: row.memo || "",
  };
}

function applyRow(state, row, week, settings) {
  const check = (state.checks || {})[row.key] || null;
  const incoming = fieldsFrom(row, settings);
  const task = row.task;
  const skipStatus = check?.deskStatus === "done" && !isClosedStatus(incoming.status);
  const sheetDue = incoming.due;
  const skipDue = check?.overrideDue && sheetDue !== String(check.overrideDue).slice(0, 10);
  if (!skipStatus) task.status = incoming.status;
  if (!skipDue) {
    task.due = incoming.due;
    task.dueTime = incoming.dueTime;
    if (check?.overrideDue && sheetDue && sheetDue === String(check.overrideDue).slice(0, 10)) check.overrideDue = "";
  }
  if (isClosedStatus(incoming.status) && check) check.deskStatus = "";
  task.sheetKey = row.key;
  task.project = incoming.project;
  task.summary = incoming.summary;
  task.dept = incoming.dept;
  task.requester = incoming.requester;
  task.assignee = skipStatus ? task.assignee : (incoming.assignee || task.assignee);
  task.workTypes = incoming.workTypes.length ? incoming.workTypes : (task.workTypes || []);
  task.priority = incoming.priority || task.priority;
  task.progress = incoming.progress;
  if (incoming.start) task.start = incoming.start;
  task.progressNote = incoming.progressNote;
  task.followUp = incoming.followUp;
  task.note = incoming.note;
  task.updatedAt = isoDate(parseDue(row.updatedAt, "00:00")) || task.updatedAt;
  snapshot(task, week, {
    ...incoming,
    status: task.status,
    assignee: task.assignee,
    due: task.due,
  });
}

export function ingestRows(state, rows, meta) {
  state.checks = state.checks || {};
  state.todos = state.todos || [];
  state.sheet = state.sheet || { changes: [] };
  const settings = liveSettings(state);
  const { week, created: createdWeek } = ensureSheetWeek(state, meta.tabName);
  const diff = diffRows(state.sheetBaseline || null, rows, {
    gid: meta.gid,
    tabName: meta.tabName,
    at: meta.at,
    id: () => crypto.randomUUID(),
  });
  const changes = [];
  if (!state.sheetBaseline) {
    changes.push({
      id: crypto.randomUUID(),
      at: meta.at,
      gid: meta.gid,
      tabName: meta.tabName,
      kind: "connected",
      key: "",
      project: "",
      assignee: "",
      priority: "",
      summary: `${meta.tabName || "주간 시트"}를 장부에 연결했습니다. 이후의 추가와 수정을 알립니다.`,
      diffs: [],
      acked: {},
    });
  } else {
    changes.push(...diff.changes);
  }
  if (createdWeek) {
    changes.unshift({
      id: crypto.randomUUID(),
      at: meta.at,
      gid: meta.gid,
      tabName: meta.tabName,
      kind: "new-tab",
      key: "",
      project: "",
      assignee: "",
      priority: "",
      summary: `이번 주 시트 ${week.label}를 보드에 열었습니다.`,
      diffs: [],
      acked: {},
    });
  }
  const used = new Set();
  for (const row of rows) {
    let task = findTask(state, row, used);
    if (!task) {
      const due = parseDue(row.dueRaw, settings.dateOnlyTime);
      const start = parseDue(row.start, settings.dateOnlyTime);
      task = {
        id: `s${row.key}`,
        sheetKey: row.key,
        project: row.project || "이름 없는 업무",
        summary: row.detail || "",
        dept: row.dept || "",
        requester: row.requester || "",
        assignee: row.assignee || "",
        workTypes: workTypesOf(row.workType),
        priority: row.priority || "보통",
        status: row.status || "시작전",
        progress: percent(row.progress),
        start: isoDate(start),
        due: isoDate(due),
        dueTime: clock(due),
        createdAt: isoDate(parseDue(row.registeredAt, "00:00")),
        updatedAt: meta.at.slice(0, 10),
        progressNote: row.progressNote || "",
        followUp: row.requestNote || "",
        note: row.memo || "",
        deliverable: "",
        closeNote: "",
        firstWeekId: week.id,
        lastWeekId: week.id,
        snapshots: [],
        logs: [],
      };
      state.tasks.push(task);
    }
    used.add(task.id);
    row.task = task;
    applyRow(state, row, week, settings);
  }
  state.sheetBaseline = rows.map(({ task, ...row }) => row);
  state.sheetRevision = (state.sheetRevision || 0) + 1;
  state.sheet = {
    gid: meta.gid,
    tabName: meta.tabName,
    weekId: week.id,
    fetchedAt: meta.at,
    error: "",
    url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${meta.gid}`,
    changes: [...changes, ...(state.sheet.changes || [])].slice(0, 200),
  };
  return { week, changes };
}

function checkOf(state, task) {
  return (state.checks || {})[task.sheetKey || task.id] || {};
}

function effectiveDue(task, check, settings) {
  if (check.overrideDue) return parseDue(check.overrideDue, settings.dateOnlyTime);
  if (task.due && task.dueTime) return parseDue(`${task.due} ${task.dueTime}`, settings.dateOnlyTime);
  if (task.due) return parseDue(task.due, settings.dateOnlyTime);
  return null;
}

function reminderMeta(kind, parsed, now) {
  if (kind === "hour") return { label: "한 시간 전", rank: 0 };
  if (kind === "overdue") return { label: "기한 지남", rank: 1 };
  if (kind === "day") {
    const dueDay = parsed ? isoDate(parsed) : "";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    return { label: dueDay === today ? "오늘 마감" : "하루 전", rank: 2 };
  }
  return { label: "", rank: 9 };
}

function blockReason(task, check, reminder, settings, now) {
  if (check.quietUntil && new Date(check.quietUntil).getTime() > now.getTime()) return null;
  if (reminder?.kind === "hour") return { kind: "hour", label: "한 시간 전" };
  if (check.important && !check.importantAcked) return { kind: "important", label: "중요 확인" };
  if (settings.popupUrgent !== false && task.priority === "긴급" && reminder) return { kind: reminder.kind, label: reminderMeta(reminder.kind, null, now).label };
  if (task.priority === "높음" && reminder?.kind === "overdue" && reminder.lateMs < 36 * 3600000) return { kind: "overdue", label: "기한 지남" };
  return null;
}

export function buildLive(state, user, now = new Date()) {
  const settings = liveSettings(state);
  const weekId = state.sheet?.weekId || state.weeks?.[state.weeks.length - 1]?.id;
  const onWeek = (state.tasks || []).filter((task) => (task.snapshots || []).some((snap) => snap.weekId === weekId));
  const reminders = [];
  const blocking = [];
  for (const task of onWeek) {
    const check = checkOf(state, task);
    const closed = CLOSED.has(task.status) || check.deskStatus === "done";
    const snoozed = check.snoozeUntil && new Date(check.snoozeUntil).getTime() > now.getTime();
    const due = effectiveDue(task, check, settings);
    const reminder = closed || snoozed ? null : classifyReminder(due, now, settings);
    const meta = reminderMeta(reminder?.kind, due, now);
    const view = {
      id: task.id,
      project: task.project,
      summary: task.summary,
      assignee: task.assignee,
      priority: task.priority,
      status: task.status,
      dueLabel: due ? dueLabel(due) : "종료일 없음",
      assumedTime: !!due?.assumedTime,
      reminderKind: reminder?.kind || "",
      reminderLabel: meta.label,
      deskDone: check.deskStatus === "done" && !CLOSED.has(task.status),
      important: !!check.important,
      mine: String(task.assignee || "").toUpperCase() === String(user.initials || "").toUpperCase(),
    };
    if (reminder) reminders.push(view);
    const block = closed ? null : blockReason(task, check, reminder, settings, now);
    if (!block) continue;
    blocking.push({
      id: `task:${task.id}:${block.kind}:${due?.iso || ""}`,
      source: "task",
      ref: task.id,
      kind: block.kind,
      label: block.label,
      title: task.project,
      priority: task.priority,
      lines: [
        [task.assignee || "미배정", task.status, task.summary].filter(Boolean).join(" · "),
        view.dueLabel,
        view.assumedTime ? `시트에는 날짜만 있어 ${settings.dateOnlyTime} 기준으로 봅니다.` : "",
        view.deskDone ? "데스크에서는 완료입니다. 시트 상태도 완료로 고쳐 주세요." : "",
      ].filter(Boolean),
    });
  }
  const myTodos = (state.todos || [])
    .filter((todo) => todo.userId === user.id)
    .map((todo) => presentTodoSafe(todo, settings, now));
  for (const todo of myTodos) {
    if (todo.closed) continue;
    if (todo.quietUntil && new Date(todo.quietUntil).getTime() > now.getTime()) continue;
    const hour = todo.reminderKind === "hour";
    const important = todo.important && !todo.importantAcked;
    if (!hour && !important) continue;
    blocking.push({
      id: `todo:${todo.id}:${hour ? "hour" : "important"}`,
      source: "todo",
      ref: todo.id,
      kind: hour ? "hour" : "important",
      label: hour ? "한 시간 전" : "중요 확인",
      title: todo.title,
      priority: todo.important ? "중요" : "",
      lines: [todo.note, todo.dueLabel].filter(Boolean),
    });
  }
  for (const change of state.sheet?.changes || []) {
    if (change.acked?.[user.id]) continue;
    const hard = change.kind === "new-tab" || (change.priority === "긴급" && ["added", "updated", "removed"].includes(change.kind));
    if (!hard) continue;
    blocking.push({
      id: `change:${change.id}`,
      source: "change",
      ref: change.id,
      kind: change.kind,
      label: change.kind === "new-tab" ? "새 주간 시트" : "시트 변경",
      title: change.summary,
      priority: change.priority || "",
      lines: (change.diffs || []).slice(0, 4).map((diff) => `${diff.field}: ${diff.before || "비어 있음"} → ${diff.after || "비어 있음"}`),
      taskKey: change.key || "",
    });
  }
  blocking.sort((a, b) => (a.kind === "hour" ? -1 : 0) - (b.kind === "hour" ? -1 : 0));
  const changes = (state.sheet?.changes || []).slice(0, 40).map((change) => ({
    ...change,
    seen: !!change.acked?.[user.id],
  }));
  const people = new Map();
  for (const task of onWeek) {
    if (CLOSED.has(task.status)) continue;
    const name = task.assignee || "미배정";
    const bucket = people.get(name) || { name, open: 0, urgent: 0 };
    bucket.open += 1;
    if (task.priority === "긴급") bucket.urgent += 1;
    people.set(name, bucket);
  }
  const ranked = [...people.values()].sort((a, b) => b.urgent - a.urgent || b.open - a.open);
  const insights = [];
  if (ranked[0]?.urgent) insights.push(`${ranked[0].name}에게 이번 주 긴급 업무가 ${ranked[0].urgent}건 있습니다.`);
  const names = ranked.filter((item) => item.name !== "미배정");
  if (names.length >= 2 && names[0].open - names[names.length - 1].open >= 3) {
    insights.push(`${names[0].name}의 열린 업무가 ${names[names.length - 1].name}보다 ${names[0].open - names[names.length - 1].open}건 많습니다.`);
  }
  const groups = new Map();
  for (const task of onWeek) {
    if (CLOSED.has(task.status) || !norm(task.project)) continue;
    const key = norm(task.project);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const duplicates = [...groups.values()].filter((list) => list.length > 1).map((list) => ({
    project: list[0].project,
    rows: list.map((task) => ({ assignee: task.assignee || "미배정", status: task.status, summary: task.summary })),
  }));
  if (duplicates.length) insights.push(`이번 주 보드에서 같은 프로젝트 이름이 ${duplicates.length}묶음 겹칩니다.`);
  return {
    weekId,
    tabName: state.sheet?.tabName || "",
    fetchedAt: state.sheet?.fetchedAt || "",
    error: state.sheet?.error || "",
    url: state.sheet?.url || "",
    settings,
    insights,
    reminders: reminders.sort((a, b) => (a.reminderKind === "overdue" ? -1 : 1) - (b.reminderKind === "overdue" ? -1 : 1)),
    blocking,
    changes,
    duplicates,
    counts: {
      reminders: reminders.length,
      changes: changes.filter((change) => !change.seen && change.kind !== "touched").length,
      blocking: blocking.length,
      todos: myTodos.filter((todo) => !todo.closed).length,
    },
    todos: groupTodos(myTodos, now),
  };
}

function presentTodoSafe(todo, settings, now) {
  const due = todo.dueDate ? parseDue(todo.dueTime ? `${todo.dueDate} ${todo.dueTime}` : todo.dueDate, settings.dateOnlyTime) : null;
  if (due && !todo.dueTime) due.assumedTime = true;
  const closed = todo.status === "done";
  const snoozed = todo.snoozeUntil && new Date(todo.snoozeUntil).getTime() > now.getTime();
  const reminder = closed || snoozed ? null : classifyReminder(due, now, settings);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return {
    ...todo,
    closed,
    dueLabel: due ? dueLabel(due) : (todo.bucket === "today" ? "오늘" : "날짜 없음"),
    reminderKind: reminder?.kind || "",
    reminderLabel: reminderMeta(reminder?.kind, due, now).label,
    pulledToday: !closed && (todo.bucket === "today" || (todo.dueDate && todo.dueDate <= today)),
  };
}

function groupTodos(todos, now) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const monday = shiftDate(today, ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) * -1);
  const sunday = shiftDate(monday, 6);
  const nextMonday = shiftDate(monday, 7);
  const nextSunday = shiftDate(monday, 13);
  const grouped = { today: [], week: [], next: [], later: [], done: [] };
  for (const todo of todos) {
    if (todo.closed) {
      grouped.done.push(todo);
      continue;
    }
    if (todo.pulledToday) grouped.today.push(todo);
    else if (todo.bucket === "week" || (todo.dueDate >= monday && todo.dueDate <= sunday)) grouped.week.push(todo);
    else if (todo.bucket === "next" || (todo.dueDate >= nextMonday && todo.dueDate <= nextSunday)) grouped.next.push(todo);
    else grouped.later.push(todo);
  }
  grouped.done = grouped.done.slice(0, 12);
  return grouped;
}

function shiftDate(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function ensureCheck(state, task) {
  state.checks = state.checks || {};
  const key = task.sheetKey || task.id;
  if (!state.checks[key]) state.checks[key] = { history: [] };
  return state.checks[key];
}

function remember(check, user, action, detail, now) {
  check.history = check.history || [];
  check.history.push({ at: now.toISOString(), user: user.initials || user.id, action, detail: detail || "" });
  if (check.history.length > 30) check.history = check.history.slice(-30);
}

export function applyLive(state, user, body, now = new Date()) {
  state.checks = state.checks || {};
  state.todos = state.todos || [];
  state.sheet = state.sheet || { changes: [] };
  const type = body?.type;
  if (type === "ack") {
    for (const change of state.sheet.changes || []) {
      if (!body.all && change.id !== body.id) continue;
      change.acked = change.acked || {};
      change.acked[user.id] = now.toISOString();
    }
    return;
  }
  if (type === "todo") {
    const outcome = applyTodo(state, user, body, now) || {};
    state.sheetRevision = (state.sheetRevision || 0) + 1;
    return outcome;
  }
  if (type === "settings") {
    if (user.role !== "lead") {
      const error = new Error("팀장만 기준을 바꿉니다.");
      error.status = 403;
      throw error;
    }
    const next = liveSettings(state);
    if (Number.isFinite(Number(body.dayLeadHours))) next.dayLeadHours = Math.min(168, Math.max(1, Number(body.dayLeadHours)));
    if (Number.isFinite(Number(body.hourLeadMinutes))) next.hourLeadMinutes = Math.min(1440, Math.max(5, Number(body.hourLeadMinutes)));
    if (/^\d{2}:\d{2}$/.test(body.dateOnlyTime || "")) next.dateOnlyTime = body.dateOnlyTime;
    if (typeof body.popupUrgent === "boolean") next.popupUrgent = body.popupUrgent;
    state.liveSettings = next;
    return;
  }
  if (type === "defer") {
    const live = buildLive(state, user, now);
    const until = snoozeInstant("1h", now);
    for (const item of live.blocking) {
      if (item.source === "change") {
        const change = state.sheet.changes.find((entry) => entry.id === item.ref);
        if (!change) continue;
        change.acked = change.acked || {};
        change.acked[user.id] = now.toISOString();
      } else if (item.source === "task") {
        const task = state.tasks.find((entry) => entry.id === item.ref);
        if (!task) continue;
        const check = ensureCheck(state, task);
        check.snoozeUntil = until;
        check.quietUntil = until;
        remember(check, user, "재확인", "한 시간 뒤", now);
      } else if (item.source === "todo") {
        const todo = state.todos.find((entry) => entry.id === item.ref && entry.userId === user.id);
        if (!todo) continue;
        todo.snoozeUntil = until;
        todo.quietUntil = until;
      }
    }
    return;
  }
  if (type !== "check") {
    const error = new Error("알 수 없는 요청입니다.");
    error.status = 400;
    throw error;
  }
  const task = state.tasks.find((entry) => entry.id === body.id);
  if (!task) {
    const error = new Error("장부에서 해당 업무를 찾지 못했습니다.");
    error.status = 404;
    throw error;
  }
  const check = ensureCheck(state, task);
  const weekId = state.sheet?.weekId;
  const snap = (task.snapshots || []).find((item) => item.weekId === weekId) || task.snapshots?.[task.snapshots.length - 1];
  if (body.action === "done") {
    if (!String(task.deliverable || "").trim()) task.deliverable = "데스크에서 완료";
    task.status = "완료";
    if (snap) snap.status = "완료";
    check.deskStatus = "done";
    check.snoozeUntil = "";
    check.note = String(body.note || check.note || "").slice(0, 300);
    remember(check, user, "완료", check.note, now);
  } else if (body.action === "reopen") {
    task.status = "진행중";
    if (snap) snap.status = "진행중";
    check.deskStatus = "";
    remember(check, user, "다시 열기", "", now);
  } else if (body.action === "snooze") {
    check.snoozeUntil = snoozeInstant(body.mode || "1h", now, body.until);
    check.quietUntil = check.snoozeUntil;
    if (check.deskStatus === "done") check.deskStatus = "";
    remember(check, user, "재확인", check.snoozeUntil, now);
  } else if (body.action === "reschedule") {
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const error = new Error("바꿀 날짜를 선택하세요.");
      error.status = 400;
      throw error;
    }
    const time = /^\d{2}:\d{2}$/.test(body.time || "") ? body.time : liveSettings(state).dateOnlyTime;
    task.due = date;
    task.dueTime = time;
    if (snap) snap.due = date;
    check.overrideDue = `${date} ${time}`;
    check.overrideNote = String(body.note || "").slice(0, 300);
    check.snoozeUntil = "";
    check.quietUntil = "";
    check.deskStatus = "";
    remember(check, user, "일정 변경", check.overrideDue, now);
  } else if (body.action === "flag") {
    check.important = !!body.important;
    check.importantAcked = false;
    remember(check, user, check.important ? "중요 표시" : "중요 해제", "", now);
  } else if (body.action === "ack-important") {
    check.importantAcked = true;
    remember(check, user, "중요 확인", "", now);
  } else {
    const error = new Error("체크 동작을 다시 선택하세요.");
    error.status = 400;
    throw error;
  }
  state.sheetRevision = (state.sheetRevision || 0) + 1;
}

export function publicLedger(state, actor, now = new Date()) {
  const { sheetBaseline, ...rest } = state;
  const { password, ...sessionUser } = actor || {};
  return {
    ...rest,
    users: (state.users || []).map(({ password: secret, ...user }) => user),
    sessionUser,
    live: actor ? buildLive(state, actor, now) : null,
  };
}
