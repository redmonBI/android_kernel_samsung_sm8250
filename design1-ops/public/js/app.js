import { CLOSED, PHASES, present, validateDraft } from "./metrics.js";
import { addDays, downloadText, formatDot, mondayOnOrAfter, roleLabel, todayISO, uid } from "./util.js";
import { applyLive, buildLive, ingestRows } from "./sheet/ledger-sync.js";
import { pullLatestSheet } from "./sheet/pull.js";
import { layoutOf, renderLogin, renderShell } from "./view.js";

const app = document.querySelector("#app");
const VIEWS = ["today", "inbox", "cycle", "projects", "calendar", "load", "report", "review", "org", "plugins", "new", "work", "live", "todos"];

const ui = {
  view: "today",
  weekId: "",
  selectedId: "",
  editWeekId: "",
  draft: null,
  formError: "",
  q: "",
  filters: { status: "", priority: "", assignee: "", dept: "" },
  layout: "list",
  group: "status",
  report: { grain: "month", month: 9, quarter: 3, half: 2 },
  cal: { year: 2026, month: 9 },
  project: "",
  reviewStep: 0,
  carryStart: "",
  carryEnd: "",
  toast: "",
  palette: false,
  paletteQ: "",
  loginError: "",
  loginId: "",
  loginPw: "",
  narrative: "",
  personalLayout: null,
  focus: null,
  panel: "",
  followSheet: true,
};

let state = null;
let user = null;
let token = sessionStorage.getItem("lumen-token") || "";
let health = "checking";
let mode = "server";
let ledger = null;

function siteUrl(path) {
  return new URL(String(path).replace(/^\//, ""), document.baseURI);
}

function stripUser(account) {
  if (!account) return null;
  const pub = { ...account };
  delete pub.password;
  return pub;
}

function withSession(data, actor) {
  return { ...data, users: (data.users || []).map(stripUser), sessionUser: stripUser(actor) };
}

function publishLedger(actor) {
  const { sheetBaseline, ...rest } = ledger;
  return {
    ...rest,
    users: (ledger.users || []).map(stripUser),
    sessionUser: stripUser(actor),
    live: actor ? buildLive(ledger, actor, new Date()) : null,
  };
}

function weekById(id) {
  return state.weeks.find((week) => week.id === id) || state.weeks[state.weeks.length - 1];
}

function ctx() {
  return { state, user, ui, mode };
}

async function api(path, options = {}) {
  if (mode === "static") return staticApi(path, options);
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(siteUrl(path), { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") {
    logout(false);
    throw new Error(data.error || "로그인이 필요합니다.");
  }
  if (response.status === 409) {
    await loadState();
    render();
    throw new Error(data.error || "시트가 갱신되었습니다.");
  }
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function persistLedger() {
  localStorage.setItem("lumen-ledger", JSON.stringify(ledger));
}

async function loadSeed() {
  const response = await fetch(siteUrl("data/seed.json"), { cache: "no-store" });
  if (!response.ok) throw new Error("장부 원본을 열지 못했습니다.");
  return response.json();
}

async function staticApi(path, options = {}) {
  const body = options.body ? JSON.parse(options.body) : {};
  if (path.endsWith("/login") || path === "/api/login") {
    const found = ledger.users.find((item) => item.id === String(body.id || "").trim() && item.password === String(body.password || ""));
    if (!found) throw new Error("아이디 또는 비밀번호를 확인하세요.");
    return { token: "static", user: stripUser(found) };
  }
  if (!user) throw new Error("로그인이 필요합니다.");
  if (path.endsWith("/password")) {
    const me = ledger.users.find((item) => item.id === user.id);
    if (!me || me.password !== String(body.current || "")) throw new Error("현재 비밀번호가 맞지 않습니다.");
    if (String(body.next || "").length < 6) throw new Error("새 비밀번호는 6자 이상으로 정하세요.");
    me.password = String(body.next);
    persistLedger();
    return { ok: true };
  }
  if (path.endsWith("/reset")) {
    if (user.role !== "lead") throw new Error("팀장만 원장을 되돌릴 수 있습니다.");
    ledger = await loadSeed();
    persistLedger();
    return publishLedger(ledger.users.find((item) => item.id === user.id));
  }
  if (path.endsWith("/live") && options.method === "POST") {
    const outcome = applyLive(ledger, user, body, new Date()) || {};
    persistLedger();
    const payload = publishLedger(ledger.users.find((item) => item.id === user.id) || user);
    payload.deleted = outcome.deleted || null;
    return payload;
  }
  if (path.endsWith("/state") && options.method === "PUT") {
    const incoming = JSON.parse(options.body);
    delete incoming.sessionUser;
    delete incoming.live;
    const users = (incoming.users || []).map((item) => {
      const prev = ledger.users.find((account) => account.id === item.id);
      return { ...(prev || {}), ...item, password: item.password || prev?.password || "" };
    });
    ledger = {
      ...ledger,
      tasks: incoming.tasks || ledger.tasks,
      weeks: incoming.weeks || ledger.weeks,
      rituals: incoming.rituals ?? ledger.rituals,
      settings: incoming.settings || ledger.settings,
      requesters: incoming.requesters || ledger.requesters,
      departments: incoming.departments || ledger.departments,
      workTypes: incoming.workTypes || ledger.workTypes,
      audit: incoming.audit || ledger.audit,
      users,
    };
    persistLedger();
    return publishLedger(ledger.users.find((item) => item.id === user.id) || user);
  }
  return publishLedger(ledger.users.find((item) => item.id === user.id) || user);
}

async function refreshSheet() {
  if (mode !== "static" || !ledger) return;
  try {
    const pulled = await pullLatestSheet();
    ingestRows(ledger, pulled.rows, { gid: pulled.gid, tabName: pulled.tabName, at: new Date().toISOString() });
    if (ledger.sheet) ledger.sheet.error = "";
  } catch {
    ledger.sheet = ledger.sheet || { changes: [] };
    ledger.sheet.error = "시트를 지금 읽지 못했습니다. 이 브라우저의 마지막 장부를 보여 줍니다.";
  }
  persistLedger();
  if (user && !ui.focus && !ui.panel) {
    adoptState(publishLedger(user));
    render();
  }
}

function adoptState(data) {
  user = data.sessionUser || user;
  delete data.sessionUser;
  delete data.deleted;
  state = data;
  if (state.live?.weekId && ui.followSheet !== false && state.weeks.some((week) => week.id === state.live.weekId)) {
    ui.weekId = state.live.weekId;
  } else if (!ui.weekId || !state.weeks.some((week) => week.id === ui.weekId)) {
    ui.weekId = state.weeks[state.weeks.length - 1].id;
  }
  const week = weekById(ui.weekId);
  if (!ui.carryStart) {
    const start = mondayOnOrAfter(addDays(week.end, 1));
    ui.carryStart = start;
    ui.carryEnd = addDays(start, 4);
  }
}

async function loadState() {
  adoptState(await api("/api/state"));
  const week = weekById(ui.weekId);
  ui.cal = { year: Number(week.start.slice(0, 4)), month: Number(week.start.slice(5, 7)) };
}

async function saveState() {
  adoptState(await api("/api/state", { method: "PUT", body: JSON.stringify(state) }));
}

function audit(text) {
  state.audit = state.audit || [];
  state.audit.push({ at: todayISO(), user: user.initials || user.name, text });
  if (state.audit.length > 400) state.audit = state.audit.slice(-400);
}

function showToast(message) {
  ui.toast = message;
  render();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    ui.toast = "";
    render();
  }, 1800);
}

function logout(doRender = true) {
  token = "";
  user = null;
  state = null;
  sessionStorage.removeItem("lumen-token");
  sessionStorage.removeItem("lumen-user");
  if (doRender) render();
}

async function login(id, password) {
  ui.loginError = "";
  try {
    const result = await api("/api/login", { method: "POST", body: JSON.stringify({ id, password }) });
    token = result.token;
    user = result.user;
    sessionStorage.setItem("lumen-token", token);
    sessionStorage.setItem("lumen-user", user.id);
    await loadState();
    location.hash = "#/today";
    render();
  } catch (error) {
    ui.loginError = error.message;
    render();
  }
}

function writePersonal(partial) {
  ui.personalLayout = { ...(ui.personalLayout || {}), ...partial };
  localStorage.setItem("lumen-personal-layout", JSON.stringify(ui.personalLayout));
}

function moveId(list, id, dir) {
  const next = [...list];
  const index = next.indexOf(id);
  const target = index + Number(dir);
  if (index < 0 || target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function placeBefore(list, id, beforeId) {
  if (!id || !beforeId || id === beforeId) return list;
  const next = list.filter((item) => item !== id);
  const index = next.indexOf(beforeId);
  if (index < 0) return list;
  next.splice(index, 0, id);
  return next;
}

async function moveTask(id, patch) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const shown = present(task, ui.weekId);
  const allowed = user.role === "lead" || (user.role === "designer" && shown.assignee === user.initials);
  if (!allowed) {
    showToast("담당 업무만 옮길 수 있습니다.");
    return;
  }
  if (("assignee" in patch || "dept" in patch) && user.role !== "lead") {
    showToast("담당과 요청 부서는 팀장이 바꿉니다.");
    return;
  }
  const status = patch.status;
  if ((status === "완료" || status === "완료(추가)") && !String(task.deliverable || "").trim()) {
    selectTask(id);
    ui.formError = "종료하려면 산출물을 한 줄 남기세요.";
    render();
    return;
  }
  const snap = task.snapshots.find((item) => item.weekId === ui.weekId);
  if (!snap) return;
  const week = weekById(ui.weekId);
  const latest = Math.max(...task.snapshots.map((item) => weekById(item.weekId)?.index || 0));
  if (status) snap.status = status;
  if ("assignee" in patch) snap.assignee = patch.assignee;
  if ("dept" in patch) snap.dept = patch.dept;
  if (week.index >= latest) {
    if (status) task.status = status;
    if ("assignee" in patch) task.assignee = patch.assignee;
    if ("dept" in patch) task.dept = patch.dept;
  }
  task.updatedAt = todayISO();
  audit(`${task.project} 이동`);
  await saveState();
  showToast("이번 주 보드에서 옮겼습니다.");
}

async function dropCard(id, group, value) {
  if (group === "phase") {
    const phase = PHASES.find((item) => item.id === value);
    if (phase) await moveTask(id, { status: phase.statuses[0] });
    return;
  }
  if (group === "status") return moveTask(id, { status: value });
  if (group === "assignee") return moveTask(id, { assignee: value === "미배정" ? "" : value });
  if (group === "dept") return moveTask(id, { dept: value });
}

function render() {
  const active = document.activeElement;
  const activeId = active?.id;
  const start = active && "selectionStart" in active ? active.selectionStart : null;
  const end = active && "selectionEnd" in active ? active.selectionEnd : null;
  app.innerHTML = user && state ? renderShell(ctx()) : renderLogin({ health, loginError: ui.loginError, loginId: ui.loginId, loginPw: ui.loginPw });
  if (activeId) {
    const next = document.getElementById(activeId);
    if (next) {
      next.focus();
      if (start != null && next.setSelectionRange) next.setSelectionRange(start, end);
    }
  }
}

function readDraft(form) {
  const draft = { ...(ui.draft || {}), workTypes: [] };
  form.querySelectorAll("[data-draft]").forEach((field) => {
    const key = field.dataset.draft;
    draft[key] = key === "progress" ? (field.value === "" ? null : Number(field.value)) : field.value;
  });
  form.querySelectorAll("[data-type]").forEach((field) => {
    if (field.checked) draft.workTypes.push(field.dataset.type);
  });
  if (form.querySelector("[data-helper]")) {
    draft.helpers = [...form.querySelectorAll("[data-helper]:checked")].map((field) => field.dataset.helper);
  }
  return draft;
}

function applyDraft(task, draft, creating) {
  const progress = draft.progress == null || draft.progress === "" || Number.isNaN(Number(draft.progress)) ? null : Number(draft.progress);
  const week = weekById(creating ? ui.weekId : (ui.editWeekId || ui.weekId));
  const latestIndex = (task.snapshots || []).reduce((max, snap) => Math.max(max, weekById(snap.weekId)?.index || 0), 0);
  const editingLatest = creating || week.index >= latestIndex;
  const next = {
    project: String(draft.project || "").trim(),
    summary: String(draft.summary || "").trim(),
    dept: draft.dept,
    requester: String(draft.requester || "").trim(),
    assignee: draft.assignee || "",
    workTypes: [...(draft.workTypes || [])],
    priority: draft.priority,
    status: draft.status,
    progress,
    start: draft.start || "",
    due: draft.due || "",
    deliverable: String(draft.deliverable || "").trim(),
    followUp: draft.followUp || "",
    note: draft.note || "",
    progressNote: draft.progressNote || "",
  };
  if (Array.isArray(draft.helpers)) task.helpers = draft.helpers;
  if (editingLatest) Object.assign(task, next);
  task.updatedAt = todayISO();
  if (creating) {
    task.createdAt = todayISO();
    task.firstWeekId = week.id;
    task.createdBy = user.id;
    task.logs = [];
    task.snapshots = [];
    task.closeNote = "";
  }
  const snapBody = {
    weekId: week.id,
    status: next.status,
    priority: next.priority,
    progress: next.progress,
    assignee: next.assignee,
    due: next.due,
    progressNote: next.progressNote,
    dept: next.dept,
    workTypes: next.workTypes,
  };
  const snap = task.snapshots.find((item) => item.weekId === week.id);
  if (!snap) task.snapshots.push(snapBody);
  else Object.assign(snap, snapBody);
  const latest = task.snapshots.reduce((best, item) => ((weekById(item.weekId)?.index || 0) > (weekById(best.weekId)?.index || 0) ? item : best), task.snapshots[0]);
  task.lastWeekId = latest.weekId;
  if (editingLatest) {
    task.status = latest.status;
    task.progress = latest.progress;
    task.assignee = latest.assignee || task.assignee;
    task.priority = latest.priority;
    task.due = latest.due || task.due;
  }
  if (draft.newLog && String(draft.newLog).trim()) {
    task.logs = task.logs || [];
    task.logs.push({ at: todayISO(), user: user.initials || user.id, weekId: week.id, text: String(draft.newLog).trim() });
  }
  if (editingLatest && task.requester && !state.requesters.some((item) => item.name === task.requester)) {
    state.requesters.push({ name: task.requester, dept: task.dept });
  }
}

function selectTask(id, view) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || (user.role === "requester" && task.createdBy !== user.id)) return;
  const weekId = task.snapshots.some((snap) => snap.weekId === ui.weekId) ? ui.weekId : task.lastWeekId;
  const shown = present(task, weekId);
  ui.selectedId = id;
  ui.editWeekId = weekId;
  ui.formError = "";
  ui.draft = {
    taskId: id,
    project: task.project,
    summary: task.summary,
    dept: shown.dept || "",
    requester: task.requester || "",
    assignee: shown.assignee || "",
    workTypes: [...(shown.workTypes || [])],
    priority: shown.priority || "보통",
    status: shown.status || "시작전",
    progress: shown.progress,
    start: task.start || "",
    due: shown.due || "",
    deliverable: task.deliverable || "",
    followUp: task.followUp || "",
    note: task.note || "",
    progressNote: shown.progressNote || "",
    newLog: "",
    helpers: [...(task.helpers || [])],
  };
  if (view) ui.view = view;
  ui.palette = false;
  if (ui.view === "work") {
    if (location.hash !== `#/work/${id}`) location.hash = `#/work/${id}`;
  }
  render();
}

async function submitDraft(creating) {
  const form = document.getElementById(creating ? "intake-form" : "work-form");
  if (!form) return;
  const draft = readDraft(form);
  ui.draft = draft;
  const errors = validateDraft(draft, { creating });
  if (errors.length) {
    ui.formError = errors[0];
    render();
    return;
  }
  ui.formError = "";
  if (creating) {
    const task = { id: uid("n"), snapshots: [], logs: [], closeNote: "" };
    applyDraft(task, draft, true);
    state.tasks.push(task);
    audit(`${task.project} 접수`);
    try {
      await saveState();
    } catch (error) {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      ui.formError = error.message;
      render();
      return;
    }
    ui.view = user.role === "requester" ? "today" : "inbox";
    selectTask(task.id, ui.view);
    showToast("접수했습니다.");
    return;
  }
  const task = state.tasks.find((item) => item.id === ui.selectedId);
  applyDraft(task, draft, false);
  audit(`${task.project} ${task.status}`);
  try {
    await saveState();
  } catch (error) {
    ui.formError = error.message;
    render();
    return;
  }
  selectTask(task.id);
  showToast("이번 주 보드에 반영했습니다.");
}

async function carryForward() {
  const start = document.getElementById("carry-start")?.value;
  const end = document.getElementById("carry-end")?.value;
  if (!start || !end || end < start) {
    showToast("다음 주 기간을 확인하세요.");
    return;
  }
  let target = state.weeks.find((week) => week.start === start);
  if (!target) {
    target = {
      id: start.replace(/-/g, "").slice(0, 8),
      label: `${formatDot(start)}–${formatDot(end)}`,
      start,
      end,
      month: Number(start.slice(5, 7)),
      year: Number(start.slice(0, 4)),
      index: state.weeks.length + 1,
    };
    state.weeks.push(target);
  }
  let moved = 0;
  for (const task of state.tasks) {
    const snap = task.snapshots.find((item) => item.weekId === ui.weekId);
    if (!snap || CLOSED.has(snap.status)) continue;
    if (task.snapshots.some((item) => item.weekId === target.id)) continue;
    task.snapshots.push({ ...snap, weekId: target.id });
    task.lastWeekId = target.id;
    moved += 1;
  }
  audit(`${target.label} 보드를 열고 ${moved}건 이월`);
  ui.weekId = target.id;
  ui.view = "cycle";
  await saveState();
  showToast(`${moved}건을 다음 주로 옮겼습니다.`);
}

function go(view) {
  ui.view = view;
  ui.palette = false;
  ui.formError = "";
  if (view === "new") {
    ui.draft = null;
    ui.selectedId = "";
  }
  if (location.hash !== `#/${view}`) location.hash = `#/${view}`;
  else render();
}

function onHash() {
  const hash = location.hash || "#/today";
  const work = hash.match(/^#\/work\/([A-Za-z0-9]+)/);
  if (work) {
    if (!user || !state) return;
    ui.view = "work";
    if (ui.selectedId !== work[1] || !ui.draft) selectTask(work[1], "work");
    else render();
    return;
  }
  const view = hash.replace("#/", "");
  ui.view = VIEWS.includes(view) ? view : "today";
  if (user?.role === "requester" && !["today", "new", "work"].includes(ui.view)) ui.view = "today";
  render();
}

document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "fill") {
    ui.loginId = el.dataset.id;
    ui.loginPw = el.dataset.pw;
    render();
    return;
  }
  if (!user) return;
  if (act === "nav") return go(el.dataset.view);
  if (act === "logout") return logout();
  if (act === "select") return selectTask(el.dataset.id, el.dataset.view || (ui.view === "work" ? "work" : ui.view));
  if (act === "open-full") return selectTask(el.dataset.id, "work");
  if (act === "palette") {
    ui.palette = !ui.palette;
    ui.paletteQ = "";
    render();
    document.getElementById("palette-q")?.focus();
    return;
  }
  if (act === "palette-close") {
    ui.palette = false;
    render();
    return;
  }
  if (act === "layout") {
    ui.layout = el.dataset.layout;
    render();
    return;
  }
  if (act === "set-phase") {
    const map = { think: "시작전", act: "진행중", link: "재작업", close: "완료" };
    const form = document.getElementById("work-form") || document.getElementById("intake-form");
    if (form) ui.draft = readDraft(form);
    if (!ui.draft) ui.draft = {};
    ui.draft.status = map[el.dataset.phase];
    render();
    return;
  }
  if (act === "project") {
    ui.project = el.dataset.project;
    render();
    return;
  }
  if (act === "clear-project") {
    ui.project = "";
    render();
    return;
  }
  if (act === "month") {
    let month = ui.cal.month + Number(el.dataset.delta);
    let year = ui.cal.year;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    ui.cal = { year, month };
    render();
    return;
  }
  if (act === "grain") {
    ui.report.grain = el.dataset.grain;
    render();
    return;
  }
  if (act === "review-step") {
    ui.reviewStep = Number(el.dataset.step);
    render();
    return;
  }
  if (act === "carry") return carryForward();
  if (act === "copy-report") {
    try {
      await navigator.clipboard.writeText(ui.narrative || "");
      showToast("보고 문장을 복사했습니다.");
    } catch {
      downloadText("lumen-report.txt", ui.narrative || "");
    }
    return;
  }
  if (act === "print") return window.print();
  if (act === "reorder") {
    const layout = layoutOf(ctx());
    const key = el.dataset.list === "nav" ? "nav" : "home";
    writePersonal({ [key]: moveId(layout[key], el.dataset.id, el.dataset.dir) });
    render();
    return;
  }
  if (act === "save-layout" && user.role === "lead") {
    const layout = layoutOf(ctx());
    state.settings.layout = { nav: layout.nav, home: layout.home, plugins: layout.plugins };
    audit("화면 배치를 팀 기본값으로 저장");
    await saveState();
    showToast("팀 기본 배치를 저장했습니다.");
    return;
  }
  if (act === "reset") {
    if (!confirm("현재 수정이 지워지고 시트에서 가져온 원장으로 돌아갑니다.")) return;
    adoptState(await api("/api/reset", { method: "POST" }));
    showToast("원본 원장으로 되돌렸습니다.");
    return;
  }
  if (act === "focus-live") {
    ui.focus = { source: el.dataset.source, ref: el.dataset.ref };
    ui.panel = "";
    render();
    return;
  }
  if (act === "close-focus") {
    ui.focus = null;
    ui.panel = "";
    render();
    return;
  }
  if (act === "live-panel") {
    ui.panel = ui.panel === "reschedule" ? "" : "reschedule";
    if (el.dataset.ref) ui.focus = { source: el.dataset.source || "task", ref: el.dataset.ref };
    render();
    return;
  }
  if (act === "live-defer") {
    ui.focus = null;
    ui.panel = "";
    adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({ type: "defer" }) }));
    showToast("한 시간 뒤에 다시 띄웁니다.");
    return;
  }
  if (act === "live-ack") {
    adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({ type: "ack", id: el.dataset.id, all: el.dataset.all === "1" }) }));
    if (ui.focus?.source === "change") ui.focus = null;
    render();
    return;
  }
  if (act === "live-done" || act === "live-snooze" || act === "live-flag") {
    const source = el.dataset.source || "task";
    const ref = el.dataset.ref || el.dataset.id;
    if (source === "todo" && act === "live-done") {
      adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({ type: "todo", action: "status", id: ref, status: "done" }) }));
    } else if (source === "todo" && act === "live-snooze") {
      adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({ type: "todo", action: "snooze", id: ref, mode: el.dataset.mode }) }));
    } else if (act === "live-flag") {
      adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({ type: "check", action: "flag", id: ref, important: el.dataset.important === "1" }) }));
    } else if (act === "live-snooze") {
      adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({ type: "check", action: "snooze", id: ref, mode: el.dataset.mode }) }));
    } else {
      adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({ type: "check", action: "done", id: ref }) }));
    }
    ui.focus = null;
    ui.panel = "";
    showToast(act === "live-done" ? "완료로 표시했습니다. 시트 상태도 완료로 고쳐 주세요." : "재확인할 시간을 잡아 두었습니다.");
    return;
  }
  if (act === "todo-status" || act === "todo-move" || act === "todo-flag" || act === "todo-delete") {
    const payload = { type: "todo", id: el.dataset.id };
    if (act === "todo-status") Object.assign(payload, { action: "status", status: el.dataset.status });
    if (act === "todo-move") Object.assign(payload, { action: "move", bucket: el.dataset.bucket });
    if (act === "todo-flag") Object.assign(payload, { action: "flag", important: el.dataset.important === "1" });
    if (act === "todo-delete") {
      payload.action = "delete";
      const data = await api("/api/live", { method: "POST", body: JSON.stringify(payload) });
      ui.undo = data.deleted || null;
      adoptState(data);
      showToast("할 일을 삭제했습니다.");
      return;
    }
    adoptState(await api("/api/live", { method: "POST", body: JSON.stringify(payload) }));
    render();
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.dataset?.filter) {
    if (target.dataset.filter === "group") ui.group = target.value || "status";
    else ui.filters[target.dataset.filter] = target.value;
    render();
    return;
  }
  if (target.dataset?.act === "week-select") {
    ui.followSheet = false;
    ui.weekId = target.value;
    const week = weekById(ui.weekId);
    ui.cal = { year: Number(week.start.slice(0, 4)), month: Number(week.start.slice(5, 7)) };
    const start = mondayOnOrAfter(addDays(week.end, 1));
    ui.carryStart = start;
    ui.carryEnd = addDays(start, 4);
    render();
    return;
  }
  if (target.dataset?.report) {
    ui.report[target.dataset.report] = Number(target.value);
    render();
    return;
  }
  if (target.dataset?.type && ui.draft) {
    const chosen = new Set(ui.draft.workTypes || []);
    if (target.checked) chosen.add(target.dataset.type);
    else chosen.delete(target.dataset.type);
    ui.draft.workTypes = [...chosen];
    return;
  }
  if (target.dataset?.draft && ui.draft) {
    ui.draft[target.dataset.draft] = target.value;
    if (target.dataset.draft === "status") render();
    return;
  }
  if (target.dataset?.act === "plugin") {
    const layout = layoutOf(ctx());
    const plugins = { ...layout.plugins, [target.dataset.plugin]: target.checked };
    writePersonal({ plugins });
    if (!target.checked && ui.view === target.dataset.plugin) ui.view = "today";
    render();
    return;
  }
  if (target.dataset?.act === "role" && user.role === "lead") {
    const account = state.users.find((item) => item.id === target.dataset.user);
    if (account && account.id !== user.id) {
      account.role = target.value;
      audit(`${account.name} 권한을 ${roleLabel(target.value)}으로 변경`);
      await saveState();
      showToast("권한을 저장했습니다.");
    }
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "q") {
    ui.q = event.target.value;
    render();
    return;
  }
  if (event.target.id === "palette-q") {
    ui.paletteQ = event.target.value;
    render();
    return;
  }
  if (event.target.dataset?.draft && ui.draft) {
    const key = event.target.dataset.draft;
    ui.draft[key] = key === "progress" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value;
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formKey = event.target.getAttribute?.("id") || "";
  if (formKey === "login-form") {
    const form = new FormData(event.target);
    ui.loginId = String(form.get("loginId") || "").trim();
    await login(ui.loginId, String(form.get("password") || ""));
    return;
  }
  if (formKey === "intake-form") return submitDraft(true);
  if (formKey === "work-form") return submitDraft(false);
  if (formKey === "password") {
    const form = new FormData(event.target);
    try {
      await api("/api/password", { method: "POST", body: JSON.stringify({ current: form.get("current"), next: form.get("next") }) });
      event.target.reset();
      showToast("비밀번호를 바꿨습니다.");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (formKey === "new-user") {
    const form = new FormData(event.target);
    const id = String(form.get("userId") || "").trim();
    if (state.users.some((item) => item.id === id)) return showToast("이미 있는 아이디입니다.");
    state.users.push({
      id,
      name: String(form.get("name") || "").trim(),
      initials: String(form.get("initials") || id).trim().toUpperCase(),
      role: form.get("role"),
      dept: form.get("dept"),
      title: "",
      password: String(form.get("password") || ""),
    });
    audit(`${id} 계정 추가`);
    try {
      await saveState();
      showToast("계정을 만들었습니다.");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (formKey === "capacity") {
    const form = new FormData(event.target);
    for (const id of ["JH", "DE", "GY"]) state.settings.capacity[id] = Number(form.get(id));
    await saveState();
    showToast("수용량을 저장했습니다.");
    return;
  }
  if (formKey === "todo-form") {
    const form = new FormData(event.target);
    adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({
      type: "todo",
      action: "create",
      title: form.get("title"),
      note: form.get("note"),
      dueDate: form.get("dueDate"),
      dueTime: form.get("dueTime"),
      bucket: form.get("bucket"),
      important: form.get("important") === "on",
    }) }));
    showToast("할 일을 등록했습니다.");
    return;
  }
  if (formKey === "reschedule-form") {
    const form = new FormData(event.target);
    const source = event.target.dataset.source;
    const ref = event.target.dataset.ref;
    if (source === "todo") {
      adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({
        type: "todo", action: "reschedule", id: ref, date: form.get("date"), dueTime: form.get("time"), note: form.get("note"),
      }) }));
    } else {
      adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({
        type: "check", action: "reschedule", id: ref, date: form.get("date"), time: form.get("time"), note: form.get("note"),
      }) }));
    }
    ui.focus = null;
    ui.panel = "";
    showToast("일정을 바꿨습니다. 시트에도 같은 날짜를 적어 주세요.");
    return;
  }
  if (formKey === "live-settings") {
    const form = new FormData(event.target);
    adoptState(await api("/api/live", { method: "POST", body: JSON.stringify({
      type: "settings",
      dayLeadHours: Number(form.get("dayLeadHours")),
      hourLeadMinutes: Number(form.get("hourLeadMinutes")),
      dateOnlyTime: form.get("dateOnlyTime"),
      popupUrgent: form.get("popupUrgent") === "on",
    }) }));
    showToast("알림 기준을 저장했습니다.");
  }
});

document.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    ui.palette = true;
    ui.paletteQ = "";
    render();
    document.getElementById("palette-q")?.focus();
    return;
  }
  if (event.key === "Escape") {
    if (ui.palette) {
      ui.palette = false;
      render();
    }
  }
  if (!user || typing) return;
  if (event.key === "c" && user.role !== "executive") go("new");
});

let activeDrag = null;

document.addEventListener("dragstart", (event) => {
  const item = event.target.closest("[data-drag]");
  if (!item || item.getAttribute("draggable") === "false") return;
  activeDrag = { kind: item.dataset.drag, id: item.dataset.id };
  event.dataTransfer.setData("text/plain", JSON.stringify(activeDrag));
  event.dataTransfer.effectAllowed = "move";
  item.classList.add("dragging");
});

document.addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-drop]");
  if (!zone) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".drop-on").forEach((el) => el.classList.remove("drop-on"));
  zone.classList.add("drop-on");
});

document.addEventListener("drop", async (event) => {
  const zone = event.target.closest("[data-drop]");
  document.querySelectorAll(".drop-on, .dragging").forEach((el) => el.classList.remove("drop-on", "dragging"));
  if (!zone || !user) return;
  event.preventDefault();
  let payload = activeDrag || {};
  try {
    const parsed = JSON.parse(event.dataTransfer.getData("text/plain") || "");
    if (parsed?.kind) payload = parsed;
  } catch { /* 브라우저가 드롭 데이터 읽기를 막으면 dragstart에 적어 둔 값을 씁니다. */ }
  activeDrag = null;
  if (payload.kind === "card" && zone.dataset.drop === "col") {
    await dropCard(payload.id, zone.dataset.group, zone.dataset.value);
    return;
  }
  if (payload.kind === "nav" && zone.dataset.drop === "nav") {
    const layout = layoutOf(ctx());
    writePersonal({ nav: placeBefore(layout.nav, payload.id, zone.dataset.id) });
    render();
    return;
  }
  if (payload.kind === "block" && zone.dataset.drop === "block") {
    const layout = layoutOf(ctx());
    writePersonal({ home: placeBefore(layout.home, payload.id, zone.dataset.id) });
    render();
  }
});

window.addEventListener("hashchange", onHash);

async function boot() {
  try { ui.personalLayout = JSON.parse(localStorage.getItem("lumen-personal-layout") || "null"); } catch { ui.personalLayout = null; }
  let serverUp = false;
  try {
    const response = await fetch(siteUrl("api/health"), { cache: "no-store" });
    serverUp = response.ok && (await response.json()).ok === true;
  } catch {
    serverUp = false;
  }
  if (!serverUp) {
    mode = "static";
    health = "static";
    try {
      ledger = JSON.parse(localStorage.getItem("lumen-ledger") || "null") || await loadSeed();
      refreshSheet();
      setInterval(() => {
        if (ui.focus || ui.panel) return;
        refreshSheet();
      }, 45000);
    } catch {
      health = "down";
      render();
      return;
    }
    const savedId = sessionStorage.getItem("lumen-user");
    if (token === "static" && savedId) {
      const found = ledger.users.find((item) => item.id === savedId);
      if (found) {
        user = stripUser(found);
        adoptState(publishLedger(found));
        onHash();
        return;
      }
    }
    token = "";
    render();
    return;
  }
  mode = "server";
  health = "ok";
  if (token === "static") token = "";
  if (!token) {
    render();
    return;
  }
  try {
    await loadState();
    if (!user?.id) {
      logout(false);
      render();
      return;
    }
    onHash();
    setInterval(() => {
      if (!token || !state || mode !== "server") return;
      if (state.live?.blocking?.length || ui.focus || ui.panel) return;
      const active = document.activeElement;
      if (active && ["INPUT", "TEXTAREA"].includes(active.tagName)) return;
      loadState().then(() => render()).catch(() => {});
    }, 15000);
  } catch {
    health = "down";
    token = "";
    render();
  }
}

boot();
