import { CLOSED, present, validateDraft } from "./metrics.js";
import { addDays, downloadText, formatDot, mondayOnOrAfter, roleLabel, todayISO, uid } from "./util.js";
import { renderLogin, renderShell } from "./view.js";

const app = document.querySelector("#app");
const VIEWS = ["today", "inbox", "cycle", "projects", "calendar", "load", "report", "review", "org", "new", "work"];

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
  narrative: "",
};

let state = null;
let user = null;
let token = sessionStorage.getItem("lumen-token") || "";
let health = "checking";

function weekById(id) {
  return state.weeks.find((week) => week.id === id) || state.weeks[state.weeks.length - 1];
}

function ctx() {
  return { state, user, ui };
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") {
    logout(false);
    throw new Error(data.error || "로그인이 필요합니다.");
  }
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function adoptState(data) {
  user = data.sessionUser || user;
  delete data.sessionUser;
  state = data;
  if (!ui.weekId || !state.weeks.some((week) => week.id === ui.weekId)) {
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
  if (doRender) render();
}

async function login(id, password) {
  ui.loginError = "";
  try {
    const result = await api("/api/login", { method: "POST", body: JSON.stringify({ id, password }) });
    token = result.token;
    user = result.user;
    sessionStorage.setItem("lumen-token", token);
    await loadState();
    location.hash = "#/today";
    render();
  } catch (error) {
    ui.loginError = error.message;
    render();
  }
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
  if (act === "reset") {
    if (!confirm("현재 수정이 지워지고 시트에서 가져온 원장으로 돌아갑니다.")) return;
    adoptState(await api("/api/reset", { method: "POST" }));
    showToast("원본 원장으로 되돌렸습니다.");
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

window.addEventListener("hashchange", onHash);

async function boot() {
  try {
    const response = await fetch("/api/health");
    health = response.ok ? "ok" : "down";
  } catch {
    health = "down";
  }
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
  } catch {
    health = "down";
    render();
  }
}

boot();
