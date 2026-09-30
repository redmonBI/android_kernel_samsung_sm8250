import {
  CLOSED,
  PHASES,
  PRIORITIES,
  STATUSES,
  buildNarrative,
  collapseSnapshots,
  isOpenStatus,
  isStalled,
  periodStats,
  phaseMeta,
  loadWeight,
  phaseOf,
  present,
  tasksOnWeek,
  validateDraft,
} from "./metrics.js";
import { addDays, downloadText, esc, formatDot, formatLong, mondayOnOrAfter, roleLabel, todayISO, uid } from "./util.js";

const app = document.querySelector("#app");
const VIEWS = ["ops", "week", "projects", "calendar", "load", "report", "close", "org", "intake"];

const ui = {
  view: "ops",
  weekId: "",
  taskId: "",
  draft: null,
  formError: "",
  q: "",
  filters: { status: "", priority: "", assignee: "", dept: "", type: "", phase: "" },
  board: "list",
  report: { grain: "month", month: 9, quarter: 3, half: 2 },
  cal: { year: 2026, month: 9 },
  focusProject: "",
  toast: "",
  loginError: "",
  loginId: "",
  loginPw: "",
  saving: false,
  narrative: "",
};

let state = null;
let user = null;
let token = sessionStorage.getItem("lumen-token") || "";

function weekById(id) {
  return state.weeks.find((week) => week.id === id) || state.weeks[state.weeks.length - 1];
}

function currentWeek() {
  return weekById(ui.weekId);
}

function visibleTasks() {
  if (user?.role === "requester") return state.tasks.filter((task) => task.createdBy === user.id);
  return state.tasks;
}

function asOf(week) {
  const today = todayISO();
  if (today >= week.start && today <= week.end) return today;
  if (today < week.start) return week.start;
  return week.end;
}

function canEdit(task) {
  if (!user || !task) return false;
  const view = task.onBoard ? task : present(task, ui.weekId);
  if (user.role === "lead") return true;
  if (user.role === "designer") return view.assignee === user.initials;
  if (user.role === "requester") return task.createdBy === user.id && (view.status === "시작전" || task.status === "시작전");
  return false;
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
}

async function loadState() {
  adoptState(await api("/api/state"));
  const week = currentWeek();
  ui.cal = { year: Number(week.start.slice(0, 4)), month: Number(week.start.slice(5, 7)) };
}

async function saveState() {
  ui.saving = true;
  try {
    adoptState(await api("/api/state", { method: "PUT", body: JSON.stringify(state) }));
  } finally {
    ui.saving = false;
  }
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
  }, 2200);
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
    location.hash = "#/ops";
    render();
  } catch (error) {
    ui.loginError = error.message;
    render();
  }
}

function boardTasks() {
  const week = currentWeek();
  return tasksOnWeek(visibleTasks(), week.id)
    .map((task) => present(task, week.id))
    .filter(matchesFilter);
}

function matchesFilter(task) {
  const q = ui.q.trim().toLowerCase();
  if (q) {
    const hay = [task.project, task.summary, task.requester, task.dept, task.assignee, task.progressNote, task.note].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (ui.filters.status && task.status !== ui.filters.status) return false;
  if (ui.filters.priority && task.priority !== ui.filters.priority) return false;
  if (ui.filters.assignee && task.assignee !== ui.filters.assignee) return false;
  if (ui.filters.dept && task.dept !== ui.filters.dept) return false;
  if (ui.filters.type && !(task.workTypes || []).includes(ui.filters.type)) return false;
  if (ui.filters.phase && phaseOf(task.status) !== ui.filters.phase) return false;
  return true;
}

function attentionItems() {
  const week = currentWeek();
  const today = asOf(week);
  const items = [];
  for (const task of tasksOnWeek(visibleTasks(), week.id).map((item) => present(item, week.id))) {
    if (!isOpenStatus(task.status) && task.status !== "재작업") continue;
    const stalled = isStalled(task, week.id, state.weeks);
    if (task.due && task.due < today && isOpenStatus(task.status)) items.push({ task, tag: "기한 지남", tone: "hot", rank: 1 });
    else if (task.status === "재작업" || task.status === "보류(지연)") items.push({ task, tag: task.status, tone: "hot", rank: 2 });
    else if (task.priority === "긴급" && isOpenStatus(task.status)) items.push({ task, tag: "긴급", tone: "hot", rank: 3 });
    else if (stalled) items.push({ task, tag: "정체", tone: "warn", rank: 4 });
    else if (task.due && task.due === today && isOpenStatus(task.status)) items.push({ task, tag: "오늘 마감", tone: "warn", rank: 5 });
    else if (task.due && task.due <= week.end && task.due >= week.start && isOpenStatus(task.status)) items.push({ task, tag: "이번 주 마감", tone: "", rank: 6 });
  }
  const seen = new Set();
  return items
    .sort((a, b) => a.rank - b.rank || String(a.task.due).localeCompare(String(b.task.due)))
    .filter((item) => (seen.has(item.task.id) ? false : seen.add(item.task.id)))
    .slice(0, 8);
}

function navItems() {
  const all = [
    ["ops", "운영"],
    ["week", "주간"],
    ["projects", "프로젝트"],
    ["calendar", "일정"],
    ["load", "부하"],
    ["report", "보고"],
    ["close", "마감"],
    ["org", "조직"],
  ];
  if (user.role === "requester") return [["ops", "내 요청"], ["intake", "접수"]];
  return all;
}

function options(list, current, blank) {
  const html = [];
  if (blank != null) html.push(`<option value="">${esc(blank)}</option>`);
  for (const item of list) {
    const value = typeof item === "string" ? item : item.value;
    const label = typeof item === "string" ? item : item.label;
    html.push(`<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`);
  }
  return html.join("");
}

function pill(status) {
  const key = String(status || "").replace(/[()]/g, "");
  return `<span class="pill s-${esc(key)}">${esc(status || "—")}</span>`;
}

function progressCell(progress) {
  if (progress == null || progress === "") return `<span class="faint">—</span>`;
  const width = Math.max(0, Math.min(100, Number(progress)));
  return `<div class="bar-row" style="grid-template-columns:1fr 36px;margin:0"><div class="track prog"><i style="width:${width}%"></i></div><span class="nums">${width}</span></div>`;
}

function titleOf(task) {
  if (!task.summary || task.summary === task.project) return `<b>${esc(task.project)}</b>`;
  return `<b>${esc(task.project)}</b><div class="clamp">${esc(task.summary)}</div>`;
}

function pageHead(eyebrow, title, lede, extra = "") {
  return `<header class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>${extra}</header>`;
}

function filterBar() {
  const depts = state.departments;
  const people = ["JH", "DE", "GY"];
  return `<div class="filters noprint">
    <select data-filter="status">${options(STATUSES, ui.filters.status, "상태 전체")}</select>
    <select data-filter="priority">${options(PRIORITIES, ui.filters.priority, "우선순위 전체")}</select>
    <select data-filter="assignee">${options(people, ui.filters.assignee, "담당 전체")}</select>
    <select data-filter="dept">${options(depts, ui.filters.dept, "부서 전체")}</select>
    <select data-filter="type">${options(state.workTypes, ui.filters.type, "유형 전체")}</select>
    <select data-filter="phase">${options(PHASES.map((phase) => ({ value: phase.id, label: phase.label })), ui.filters.phase, "흐름 전체")}</select>
    <div class="seg">
      <button class="btn ${ui.board === "list" ? "primary" : ""}" data-act="board" data-board="list" type="button">목록</button>
      <button class="btn ${ui.board === "flow" ? "primary" : ""}" data-act="board" data-board="flow" type="button">흐름</button>
    </div>
  </div>`;
}

function taskTable(tasks) {
  if (!tasks.length) return `<div class="empty">이 조건에 해당하는 업무가 없습니다.</div>`;
  const rows = tasks.map((task) => `<tr class="row" data-act="open" data-id="${esc(task.id)}">
    <td>${pill(task.status)}</td>
    <td class="prio-${esc(task.priority)}">${esc(task.priority || "—")}</td>
    <td>${titleOf(task)}</td>
    <td>${esc(task.dept || "—")}<div class="muted">${esc(task.requester || "요청자 없음")}</div></td>
    <td>${esc(task.assignee || "미배정")}</td>
    <td class="muted">${esc((task.workTypes || []).join(", ") || "—")}</td>
    <td class="nums">${esc(formatDot(task.due))}</td>
    <td style="min-width:120px">${progressCell(task.progress)}</td>
  </tr>`).join("");
  return `<div class="table-wrap"><table>
    <thead><tr><th>상태</th><th>우선</th><th>업무</th><th>요청</th><th>담당</th><th>유형</th><th>종료예정</th><th>진도</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function flowBoard(tasks) {
  return `<div class="kanban">${PHASES.map((phase) => {
    const cards = tasks.filter((task) => phaseOf(task.status) === phase.id).map((task) => `<button class="card" data-act="open" data-id="${esc(task.id)}" type="button">
      <b>${esc(task.project)}</b>
      <div class="clamp">${esc(task.summary)}</div>
      <div class="muted" style="margin-top:6px">${esc(task.assignee || "미배정")} · ${esc(task.priority)} · ${task.progress == null ? "진도 미입력" : `${task.progress}%`}</div>
    </button>`).join("");
    return `<section class="col"><h3>${esc(phase.label)} <span class="faint">${tasks.filter((task) => phaseOf(task.status) === phase.id).length}</span></h3>${cards || `<div class="muted">없음</div>`}</section>`;
  }).join("")}</div>`;
}

function renderOps() {
  if (user.role === "requester") return renderRequesterHome();
  const week = currentWeek();
  const tasks = tasksOnWeek(visibleTasks(), week.id).map((task) => present(task, week.id));
  const open = tasks.filter((task) => isOpenStatus(task.status));
  const done = tasks.filter((task) => task.status === "완료" || task.status === "완료(추가)");
  const stalled = tasks.filter((task) => isStalled(task, week.id, state.weeks));
  const today = asOf(week);
  const late = open.filter((task) => task.due && task.due < today);
  const ritual = state.rituals?.[week.id] || {};
  const phases = PHASES.map((phase) => ({ ...phase, count: tasks.filter((task) => phaseOf(task.status) === phase.id).length }));
  const loads = loadRows(tasks);
  const depts = {};
  for (const task of tasks) depts[task.dept || "미지정"] = (depts[task.dept || "미지정"] || 0) + 1;
  const deptSorted = Object.entries(depts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const deptMax = Math.max(...deptSorted.map((item) => item[1]), 1);
  const attention = attentionItems();
  const sparkMax = Math.max(...state.weeks.map((item) => tasksOnWeek(state.tasks, item.id).length), 1);
  const midweek = todayISO() >= week.start && todayISO() <= week.end && [2, 3].includes(new Date().getDay());

  return `${pageHead("이번 주 운영", week.label, `${week.index}주차 · 기준일 ${formatLong(today)}${midweek ? " · 중간 점검이 필요한 요일입니다." : ""}`)}
    <div class="ritual">
      ${ritualBox("plan", "주간 계획", "이월과 신규 접수를 담당에게 배정했다", ritual.plan)}
      ${ritualBox("mid", "중간 점검", "막힌 일과 몰린 담당을 조정했다", ritual.mid)}
      ${ritualBox("close", "주간 마감", "산출물을 확인하고 차주로 넘길 일을 정했다", ritual.close)}
    </div>
    <section class="kpis">
      ${kpi(tasks.length, "이번 주 보드")}
      ${kpi(done.length, "종료")}
      ${kpi(open.length, "아직 열린 일")}
      ${kpi(late.length + stalled.length, late.length ? "기한·정체" : "정체")}
    </section>
    <section class="phases">${phases.map((phase) => `<button class="phase ${ui.filters.phase === phase.id ? "on" : ""}" data-act="phase-filter" data-phase="${phase.id}" type="button"><small>${esc(phase.hint)}</small><b>${esc(phase.label)} ${phase.count}</b></button>`).join("")}</section>
    <div class="split">
      <section class="panel">
        <h2>지금 볼 업무</h2>
        ${attention.length ? attention.map((item) => `<button class="att" data-act="open" data-id="${esc(item.task.id)}" type="button"><span class="tag ${item.tone}">${esc(item.tag)}</span><span><b>${esc(item.task.project)}</b><div class="muted">${esc(item.task.assignee || "미배정")} · ${esc(item.task.requester || item.task.dept)} · ${esc(formatDot(item.task.due))}</div></span></button>`).join("") : `<div class="empty">이번 주 보드에서 바로 손을 댈 위험이 없습니다.</div>`}
      </section>
      <div>
        <section class="panel">
          <h2>담당 부하</h2>
          ${loads.map((row) => barRow(row.name, row.weight, row.capacity, `${row.open}건 진행`)).join("")}
        </section>
        <section class="panel">
          <h2>요청이 들어온 곳</h2>
          ${deptSorted.map(([name, count]) => barRow(name, count, deptMax, `${count}줄`, false)).join("")}
        </section>
      </div>
    </div>
    <section class="panel">
      <h2>주차별 보드 물량</h2>
      <div class="spark">${state.weeks.map((item) => {
        const count = tasksOnWeek(state.tasks, item.id).length;
        return `<button type="button" class="${item.id === week.id ? "on" : ""}" data-act="week" data-week="${esc(item.id)}" title="${esc(item.label)} ${count}줄"><i style="height:${Math.round((count / sparkMax) * 100)}%"></i></button>`;
      }).join("")}</div>
      <div class="muted">각 막대는 그 주 시트에 올라 있던 줄 수입니다. 이어지는 프로젝트는 여러 주에 반복됩니다.</div>
    </section>`;
}

function renderRequesterHome() {
  const tasks = visibleTasks().slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return `${pageHead("내 요청", "올린 업무", "접수는 생각 단계에서 팀장이 담당과 기한을 확정합니다.")}
    ${tasks.length ? taskTable(tasks.map((task) => present(task, task.lastWeekId))) : `<div class="panel empty">아직 접수한 업무가 없습니다. 접수에서 부서, 요청자, 기한, 작업 유형을 적어 주세요.</div>`}`;
}

function ritualBox(key, title, text, checked) {
  const disabled = user.role === "lead" ? "" : "disabled";
  return `<label><input type="checkbox" data-act="ritual" data-key="${key}" ${checked ? "checked" : ""} ${disabled}><span><b>${esc(title)}</b><span>${esc(text)}</span></span></label>`;
}

function kpi(value, label) {
  return `<article class="kpi"><em class="nums">${esc(value)}</em><span>${esc(label)}</span></article>`;
}

function barRow(label, value, capacity, note, weighted = true) {
  const ratio = capacity ? Math.min(100, Math.round((value / capacity) * 100)) : 0;
  const over = weighted && value > capacity;
  return `<div class="bar-row"><span>${esc(label)}</span><div class="track ${over ? "over" : ""}"><i style="width:${ratio}%"></i></div><span class="nums">${weighted ? `${trimNum(value)}/${capacity}` : esc(note)}</span></div>`;
}

function trimNum(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function loadRows(tasks) {
  const people = [
    { id: "JH", name: "JH 팀장" },
    { id: "DE", name: "DE 선임" },
    { id: "GY", name: "GY 사원" },
  ];
  return people.map((person) => {
    const mine = tasks.filter((task) => task.assignee === person.id && isOpenStatus(task.status));
    const weight = mine.reduce((sum, task) => sum + loadWeight(task), 0);
    return {
      ...person,
      open: mine.length,
      weight,
      capacity: state.settings?.capacity?.[person.id] ?? 6,
      done: tasks.filter((task) => task.assignee === person.id && (task.status === "완료" || task.status === "완료(추가)")).length,
      stalled: tasks.filter((task) => task.assignee === person.id && isStalled(task, ui.weekId, state.weeks)).length,
      items: mine,
    };
  });
}

function renderWeek() {
  const week = currentWeek();
  const tasks = boardTasks().sort(sortTasks);
  const next = nextWeekDraft();
  return `${pageHead("주간 보드", week.label, `${formatLong(week.start)} – ${formatLong(week.end)} · ${tasks.length}줄`, user.role === "lead" ? `<button class="btn noprint" data-act="carry-open" type="button">다음 주 열기</button>` : "")}
    ${ui.carryOpen ? `<section class="panel noprint"><h2>다음 주 보드</h2><p class="lede">끝나지 않은 업무만 다음 주로 옮깁니다. 완료와 취소는 이번 주에 남습니다.</p>
      <div class="grid-2" style="margin-top:10px">
        <label class="field"><span>시작</span><input id="carry-start" type="date" value="${esc(next.start)}"></label>
        <label class="field"><span>종료</span><input id="carry-end" type="date" value="${esc(next.end)}"></label>
      </div>
      <button class="btn primary" data-act="carry" type="button">이월하고 주간 보드 만들기</button>
    </section>` : ""}
    ${filterBar()}
    ${ui.board === "flow" ? flowBoard(tasks) : taskTable(tasks)}`;
}

function nextWeekDraft() {
  const week = currentWeek();
  const start = mondayOnOrAfter(addDays(week.end, 1));
  return { start, end: addDays(start, 4) };
}

function sortTasks(a, b) {
  const rank = { 긴급: 0, 높음: 1, 보통: 2, 일반: 3 };
  const phase = phaseOf(a.status).localeCompare(phaseOf(b.status));
  if (phase) return PHASES.findIndex((item) => item.id === phaseOf(a.status)) - PHASES.findIndex((item) => item.id === phaseOf(b.status));
  return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
}

function renderProjects() {
  const q = ui.q.trim().toLowerCase();
  const map = new Map();
  for (const task of visibleTasks()) {
    const key = task.project || "(프로젝트명 없음)";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  let groups = [...map.entries()].map(([name, tasks]) => {
    const last = Math.max(...tasks.map((task) => weekById(task.lastWeekId).index));
    const first = Math.min(...tasks.map((task) => weekById(task.firstWeekId).index));
    const open = tasks.filter((task) => isOpenStatus(task.status)).length;
    const people = [...new Set(tasks.map((task) => task.assignee).filter(Boolean))];
    return { name, tasks, last, first, open, people };
  }).sort((a, b) => b.last - a.last || b.open - a.open);
  if (q) groups = groups.filter((group) => group.name.toLowerCase().includes(q) || group.tasks.some((task) => task.summary.toLowerCase().includes(q)));
  if (ui.focusProject) {
    const group = groups.find((item) => item.name === ui.focusProject) || [...map.entries()].map(([name, tasks]) => ({ name, tasks })).find((item) => item.name === ui.focusProject);
    if (!group) ui.focusProject = "";
    else {
      return `${pageHead("프로젝트", group.name, `${group.tasks.length}개 업무`)}
        <button class="btn noprint" data-act="clear-project" type="button">전체 프로젝트</button>
        <div style="height:12px"></div>
        ${taskTable(group.tasks.map((task) => present(task, task.lastWeekId)))}`;
    }
  }
  const rows = groups.map((group) => `<tr class="row" data-act="project" data-project="${esc(group.name)}">
    <td><b>${esc(group.name)}</b></td>
    <td class="nums">${group.tasks.length}</td>
    <td class="nums">${group.open}</td>
    <td>${esc(group.people.join(", ") || "—")}</td>
    <td class="muted">${esc(weekById(group.tasks.find((task) => weekById(task.firstWeekId).index === group.first)?.firstWeekId || group.tasks[0].firstWeekId).label)} – ${esc(weekById(group.tasks.find((task) => weekById(task.lastWeekId).index === group.last)?.lastWeekId || group.tasks[0].lastWeekId).label)}</td>
  </tr>`).join("");
  return `${pageHead("프로젝트", "이름별로 모은 업무", "같은 현장과 문서 작업이 주에 걸쳐 어떻게 이어졌는지 봅니다.")}
    <div class="table-wrap"><table>
      <thead><tr><th>프로젝트</th><th>업무</th><th>열림</th><th>담당</th><th>기간</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">해당하는 프로젝트가 없습니다.</td></tr>`}</tbody>
    </table></div>`;
}

function renderCalendar() {
  const { year, month } = ui.cal;
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  const pad = (first.getDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const week = currentWeek();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const dated = visibleTasks().filter((task) => task.due && task.due.startsWith(prefix));
  const undated = tasksOnWeek(visibleTasks(), week.id).map((task) => present(task, week.id)).filter((task) => isOpenStatus(task.status) && !task.due);
  const today = todayISO();
  return `${pageHead("일정", `${year}년 ${month}월`, "종료 예정일이 있는 업무를 달력에 놓습니다. 선택된 주는 테두리로 표시됩니다.", `<div class="inline noprint"><button class="btn" data-act="month" data-delta="-1" type="button">이전달</button><button class="btn" data-act="month" data-delta="1" type="button">다음달</button></div>`)}
    <div class="cal-grid" style="margin-bottom:6px">${["월", "화", "수", "목", "금", "토", "일"].map((day) => `<div class="dow">${day}</div>`).join("")}</div>
    <div class="cal-grid">${cells.map((day) => {
      if (!day) return `<div class="day"></div>`;
      const iso = `${prefix}-${String(day).padStart(2, "0")}`;
      const inweek = iso >= week.start && iso <= week.end;
      const chips = dated.filter((task) => task.due === iso).slice(0, 3).map((task) => `<button class="chip" data-act="open" data-id="${esc(task.id)}" type="button">${esc(task.assignee || "·")} ${esc(task.project)}</button>`).join("");
      const more = dated.filter((task) => task.due === iso).length - 3;
      return `<div class="day ${inweek ? "inweek" : ""} ${iso === today ? "today" : ""}"><div class="n">${day}</div>${chips}${more > 0 ? `<div class="muted">+${more}</div>` : ""}</div>`;
    }).join("")}</div>
    <section class="panel" style="margin-top:12px"><h2>이번 주 보드 중 기한이 없는 일</h2>
      ${undated.length ? undated.map((task) => `<button class="mini" data-act="open" data-id="${esc(task.id)}" type="button">${esc(task.project)} · ${esc(task.assignee || "미배정")}</button>`).join("") : `<div class="muted">기한 없는 진행 업무가 없습니다.</div>`}
    </section>`;
}

function renderLoad() {
  const tasks = tasksOnWeek(visibleTasks(), ui.weekId).map((task) => present(task, ui.weekId));
  const rows = loadRows(tasks);
  return `${pageHead("부하", `${currentWeek().label} 담당`, "가중치는 긴급 3, 높음 2, 보통 1, 일반 0.5입니다. 수시 점검은 0.4배, 시작 전과 대기는 0.5배입니다. 막대가 기준을 넘으면 그 주 배정을 나눕니다.")}
    <div class="people">${rows.map((row) => `<article class="person">
      <h3>${esc(row.name)}</h3>
      <p class="muted">진행 ${row.open} · 이번 주 종료 ${row.done} · 정체 ${row.stalled}</p>
      ${barRow("부하", row.weight, row.capacity, "")}
      ${row.items.length ? row.items.map((task) => `<button class="mini" data-act="open" data-id="${esc(task.id)}" type="button"><b>${esc(task.project)}</b><div class="muted">${esc(task.priority)} · ${esc(task.status)}</div></button>`).join("") : `<div class="empty">열린 업무가 없습니다.</div>`}
    </article>`).join("")}</div>`;
}

function selectedPeriod() {
  const year = 2026;
  if (ui.report.grain === "week") {
    const week = currentWeek();
    return { label: `${week.label} 주간`, weeks: [week] };
  }
  if (ui.report.grain === "month") {
    const month = ui.report.month;
    const weeks = state.weeks.filter((week) => week.year === year && week.month === month);
    return { label: `${year}년 ${month}월`, weeks };
  }
  if (ui.report.grain === "quarter") {
    const start = (ui.report.quarter - 1) * 3 + 1;
    const months = [start, start + 1, start + 2];
    const weeks = state.weeks.filter((week) => week.year === year && months.includes(week.month));
    return { label: `${year}년 ${ui.report.quarter}분기`, weeks, buckets: months.map((month) => ({ label: `${month}월`, weeks: weeks.filter((week) => week.month === month) })) };
  }
  if (ui.report.grain === "half") {
    const months = ui.report.half === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
    const weeks = state.weeks.filter((week) => week.year === year && months.includes(week.month));
    return { label: `${year}년 ${ui.report.half === 1 ? "상반기" : "하반기"}`, weeks };
  }
  const weeks = state.weeks.filter((week) => week.year === year);
  return { label: `${year}년`, weeks };
}

function renderReport() {
  const period = selectedPeriod();
  const stats = periodStats(visibleTasks(), period.weeks);
  const stalled = period.weeks.length
    ? visibleTasks().filter((task) => task.snapshots.some((snap) => period.weeks.some((week) => week.id === snap.weekId)) && isStalled(task, period.weeks[period.weeks.length - 1].id, state.weeks))
    : [];
  ui.narrative = buildNarrative(period.label, stats, stalled.length);
  const people = Object.entries(stats.byPerson).sort((a, b) => b[1].slots - a[1].slots);
  const depts = Object.entries(stats.byDept).sort((a, b) => b[1].slots - a[1].slots);
  const types = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const typeMax = Math.max(...types.map((item) => item[1]), 1);
  const controls = `<div class="filters noprint">
    <div class="seg">
      ${[["week", "주간"], ["month", "월간"], ["quarter", "분기"], ["half", "반기"], ["year", "연간"]].map(([id, label]) => `<button class="btn ${ui.report.grain === id ? "primary" : ""}" data-act="grain" data-grain="${id}" type="button">${label}</button>`).join("")}
    </div>
    ${ui.report.grain === "month" ? `<select data-report="month">${options([4, 5, 6, 7, 8, 9, 10].map((month) => ({ value: String(month), label: `${month}월` })), String(ui.report.month))}</select>` : ""}
    ${ui.report.grain === "quarter" ? `<select data-report="quarter">${options([1, 2, 3, 4].map((quarter) => ({ value: String(quarter), label: `${quarter}분기` })), String(ui.report.quarter))}</select>` : ""}
    ${ui.report.grain === "half" ? `<select data-report="half">${options([{ value: "1", label: "상반기" }, { value: "2", label: "하반기" }], String(ui.report.half))}</select>` : ""}
    <button class="btn" data-act="copy-report" type="button">문장 복사</button>
    <button class="btn" data-act="print" type="button">인쇄</button>
  </div>`;
  const weekRows = ui.report.grain === "month" ? period.weeks.map((week) => {
    const weekStats = periodStats(visibleTasks(), [week]);
    return `<tr><td>${esc(week.label)}</td><td class="nums">${weekStats.slots}</td><td class="nums">${weekStats.done}</td><td class="nums">${Math.round(weekStats.rate * 1000) / 10}%</td><td class="nums">${weekStats.unique}</td></tr>`;
  }).join("") : "";
  return `${pageHead("보고", period.label, "슬롯 완료율은 기존 시트와 같이 그 기간 보드에 올라온 줄을 기준으로 합니다. 고유 업무 수는 여러 주에 반복된 일을 한 건으로 모읍니다.")}
    ${controls}
    <div class="report-text">${esc(ui.narrative)}</div>
    <section class="kpis">
      ${kpi(stats.slots, "주간 슬롯")}
      ${kpi(stats.done, "완료 슬롯")}
      ${kpi(`${Math.round(stats.rate * 1000) / 10}%`, "슬롯 완료율")}
      ${kpi(stats.unique, "고유 업무")}
    </section>
    <div class="split">
      <section class="panel"><h2>담당별 기여</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>담당</th><th>슬롯</th><th>완료</th><th>완료율</th><th>긴급</th><th>높음</th><th>보통</th><th>일반</th><th>재작업</th></tr></thead>
          <tbody>${people.map(([name, row]) => `<tr><td>${esc(name)}</td><td class="nums">${row.slots}</td><td class="nums">${row.done}</td><td class="nums">${row.slots ? Math.round((row.done / row.slots) * 1000) / 10 : 0}%</td><td class="nums">${row.긴급}</td><td class="nums">${row.높음}</td><td class="nums">${row.보통}</td><td class="nums">${row.일반}</td><td class="nums">${row.rework}</td></tr>`).join("") || `<tr><td colspan="9">데이터 없음</td></tr>`}</tbody>
        </table></div>
      </section>
      <section class="panel"><h2>요청 부서</h2>
        ${depts.map(([name, row]) => barRow(name, row.slots, Math.max(...depts.map((item) => item[1].slots), 1), `${row.slots}줄`, false)).join("") || `<div class="muted">없음</div>`}
        <h2 style="margin-top:16px">작업 유형</h2>
        ${types.map(([name, count]) => barRow(name, count, typeMax, `${count}`, false)).join("")}
      </section>
    </div>
    ${weekRows ? `<section class="panel"><h2>주차별</h2><div class="table-wrap"><table><thead><tr><th>주</th><th>슬롯</th><th>완료</th><th>완료율</th><th>고유</th></tr></thead><tbody>${weekRows}</tbody></table></div></section>` : ""}
    <section class="panel"><h2>정체 ${stalled.length}건</h2>
      ${stalled.slice(0, 12).map((task) => `<button class="mini" data-act="open" data-id="${esc(task.id)}" type="button">${esc(task.project)} · ${esc(task.assignee || "미배정")} · 진도 ${task.progress == null ? "미입력" : `${task.progress}%`}</button>`).join("") || `<div class="muted">이 기간에 4주 이상 같은 진도로 남은 업무가 없습니다.</div>`}
    </section>`;
}

function renderClose() {
  const week = currentWeek();
  const today = asOf(week);
  const tasks = tasksOnWeek(visibleTasks(), week.id).map((task) => present(task, week.id));
  const sections = [
    ["기한을 넘긴 일", tasks.filter((task) => isOpenStatus(task.status) && task.due && task.due < today)],
    ["진도가 4주 이상 같은 일", tasks.filter((task) => isStalled(task, week.id, state.weeks))],
    ["재작업과 보류", tasks.filter((task) => task.status === "재작업" || task.status === "보류(지연)")],
    ["이번 주 안에 닫을 일", tasks.filter((task) => isOpenStatus(task.status) && task.due && task.due >= week.start && task.due <= week.end)],
    ["산출물 없이 완료로 남은 일", tasks.filter((task) => (task.status === "완료" || task.status === "완료(추가)") && !String(task.deliverable || task.progressNote || "").trim())],
  ];
  return `${pageHead("마감", `${week.label}에 닫을 것`, "종료는 산출물 한 줄이 있을 때 확정됩니다. 정체 업무는 계속, 보류, 종료 중 하나로 정리합니다.")}
    ${sections.map(([title, list]) => `<section class="panel"><h2>${esc(title)} <span class="faint">${list.length}</span></h2>
      ${list.length ? list.map((task) => `<button class="mini" data-act="open" data-id="${esc(task.id)}" type="button"><b>${esc(task.project)}</b><div class="muted">${esc(task.status)} · ${esc(task.assignee || "미배정")} · ${esc(task.dept)} · ${esc(formatDot(task.due))}</div></button>`).join("") : `<div class="muted">해당 없음</div>`}
    </section>`).join("")}`;
}

function renderOrg() {
  const editable = user.role === "lead";
  const directory = {};
  for (const person of state.requesters) {
    directory[person.dept] = directory[person.dept] || [];
    directory[person.dept].push(person.name);
  }
  return `${pageHead("조직", "계정과 권한", "팀장은 배정과 종료를 확정하고, 디자이너는 자기 업무의 진도와 산출물을 남깁니다. 요청 부서는 접수와 자기 요청만 봅니다.")}
    <section class="panel"><h2>운영 기준</h2>
      <p>접수에는 부서, 요청자, 종료 예정, 작업 유형이 있습니다.</p>
      <p>진행으로 넘길 때는 수행 담당이 있습니다.</p>
      <p>완료에는 산출물 한 줄이 남습니다. 같은 진도가 4주간 이어지면 정체로 올라옵니다.</p>
    </section>
    <section class="panel"><h2>권한</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>할 수 있는 일</th><th>팀장</th><th>디자이너</th><th>요청 부서</th><th>임원</th></tr></thead>
        <tbody>
          ${perm("전체 보드", "○", "○", "본인 요청", "○")}
          ${perm("접수", "○", "○", "○", "—")}
          ${perm("담당 배정", "○", "본인", "—", "—")}
          ${perm("진도·기록", "○", "본인 업무", "접수 단계", "—")}
          ${perm("종료 확정", "○", "본인 산출물", "—", "—")}
          ${perm("주간 의식·이월", "○", "—", "—", "—")}
          ${perm("보고", "○", "○", "—", "○")}
          ${perm("계정", "○", "본인 비밀번호", "본인 비밀번호", "본인 비밀번호")}
        </tbody>
      </table></div>
    </section>
    <div class="split">
      <section class="panel"><h2>접속 계정</h2>
        ${state.users.map((item) => `<div class="grid-2" style="align-items:end">
          <div><b>${esc(item.name)}</b><div class="muted">${esc(item.dept)} · ${esc(item.initials)} · ${esc(item.id)}</div></div>
          ${editable ? `<select data-act="role" data-user="${esc(item.id)}" ${item.id === user.id ? "disabled" : ""}>${options([["lead", "팀장"], ["designer", "디자이너"], ["requester", "요청 부서"], ["executive", "임원"]].map(([value, label]) => ({ value, label })), item.role)}</select>` : `<div>${esc(roleLabel(item.role))}</div>`}
        </div>`).join("")}
        ${editable ? `<form id="new-user" class="stack" style="margin-top:14px">
          <b>계정 추가</b>
          <input name="id" placeholder="아이디 (영문 소문자)" required pattern="[a-z0-9]{2,16}">
          <input name="name" placeholder="이름" required>
          <input name="initials" placeholder="이니셜" maxlength="4">
          <select name="role">${options([{ value: "designer", label: "디자이너" }, { value: "requester", label: "요청 부서" }, { value: "executive", label: "임원" }, { value: "lead", label: "팀장" }], "designer")}</select>
          <select name="dept">${options(state.departments, "디자인1팀")}</select>
          <input name="password" placeholder="임시 비밀번호 6자 이상" required minlength="6">
          <button class="btn primary" type="submit">계정 만들기</button>
        </form>` : ""}
      </section>
      <div>
        <section class="panel"><h2>내 비밀번호</h2>
          <form id="password" class="stack">
            <input name="current" type="password" placeholder="현재 비밀번호" required>
            <input name="next" type="password" placeholder="새 비밀번호" required minlength="6">
            <button class="btn" type="submit">변경</button>
          </form>
        </section>
        ${editable ? `<section class="panel"><h2>주간 수용량</h2>
          <form id="capacity" class="stack">
            ${["JH", "DE", "GY"].map((id) => `<label class="field"><span>${id}</span><input name="${id}" type="number" min="1" max="20" value="${esc(state.settings.capacity[id])}"></label>`).join("")}
            <button class="btn" type="submit">기준 저장</button>
          </form>
          <button class="btn danger" data-act="reset" type="button" style="margin-top:12px">시트 원본으로 되돌리기</button>
        </section>` : ""}
      </div>
    </div>
    <section class="panel"><h2>요청 창구</h2>
      ${Object.entries(directory).map(([dept, names]) => `<p><b>${esc(dept)}</b> · ${esc(names.join(", "))}</p>`).join("")}
    </section>
    <section class="panel"><h2>최근 기록</h2>
      ${(state.audit || []).slice().reverse().slice(0, 12).map((item) => `<p class="muted">${esc(item.at)} · ${esc(item.user)} · ${esc(item.text)}</p>`).join("") || `<div class="muted">아직 기록이 없습니다.</div>`}
    </section>`;
}

function perm(label, ...cells) {
  return `<tr><td>${esc(label)}</td>${cells.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`;
}

function renderIntake() {
  const draft = ui.draft || defaultDraft();
  return `${pageHead("접수", "새 업무", "누가, 어느 부서에서, 무엇을, 언제까지, 어떤 유형으로 요청하는지 남깁니다.")}
    <section class="panel">${draftForm(draft, true)}</section>`;
}

function defaultDraft() {
  return {
    project: "",
    summary: "",
    dept: user.role === "requester" ? user.dept : "",
    requester: user.role === "requester" ? "" : "",
    assignee: user.role === "designer" ? user.initials : "",
    workTypes: [],
    priority: "보통",
    status: "시작전",
    progress: null,
    start: todayISO(),
    due: "",
    deliverable: "",
    followUp: "",
    note: "",
    progressNote: "",
    newLog: "",
  };
}

function renderDrawer() {
  if (!ui.taskId || !ui.draft) return "";
  const task = state.tasks.find((item) => item.id === ui.taskId);
  if (!task) return "";
  const shown = present(task, ui.weekId);
  const editable = canEdit(shown);
  const groups = collapseSnapshots(task, state.weeks);
  return `<div class="drawer-back" data-act="close-drawer"></div>
    <aside class="drawer" role="dialog" aria-label="업무 상세">
      <div class="inline"><div class="eyebrow">${esc(phaseMeta(ui.draft.status).label)} · ${esc(weekById(ui.editWeekId || ui.weekId).label)}</div><button class="btn" data-act="close-drawer" type="button">닫기</button></div>
      <h2 style="margin:8px 0">${esc(task.project)}</h2>
      <dl class="wh">
        <dt>누가 요청</dt><dd>${esc(shown.dept)} · ${esc(task.requester || "—")}</dd>
        <dt>누가 수행</dt><dd>${esc(shown.assignee || "미배정")}</dd>
        <dt>언제</dt><dd>${esc(formatLong(task.start))} – ${esc(formatLong(shown.due || task.due))}</dd>
        <dt>무엇을</dt><dd>${esc(task.summary)}</dd>
        <dt>어떻게</dt><dd>${esc((shown.workTypes || []).join(", ") || "—")}</dd>
        <dt>결과</dt><dd>${esc(task.deliverable || task.progressNote || "아직 산출물이 없습니다.")}</dd>
      </dl>
      ${editable ? draftForm(ui.draft, false) : `<p class="muted">이 계정은 이 업무를 열람합니다.</p>`}
      <h3>주간 흐름</h3>
      <ul class="timeline">${groups.map((group) => {
        const start = weekById(group.weekId);
        const end = weekById(group.endWeekId);
        const span = group.count > 1 ? `${start.label} – ${end.label} · ${group.count}주 동일` : start.label;
        return `<li><b>${esc(span)}</b><div class="muted">${esc(group.status)} · ${esc(group.priority)} · 진도 ${group.progress == null ? "미입력" : `${group.progress}%`}${group.progressNote ? ` · ${esc(group.progressNote)}` : ""}</div></li>`;
      }).join("")}</ul>
      <h3 style="margin-top:16px">기록</h3>
      <ul class="timeline">${(task.logs || []).slice().reverse().map((log) => `<li><div class="muted">${esc(log.at)} · ${esc(log.user)}</div><div>${esc(log.text)}</div></li>`).join("") || `<li class="muted">기록이 없습니다.</li>`}</ul>
    </aside>`;
}

function draftForm(draft, creating) {
  const types = [...state.workTypes];
  for (const type of draft.workTypes || []) if (!types.includes(type)) types.push(type);
  const people = ["", "JH", "DE", "GY"];
  if (draft.assignee && !people.includes(draft.assignee)) people.push(draft.assignee);
  const depts = state.departments.includes(draft.dept) || !draft.dept ? state.departments : [draft.dept, ...state.departments];
  return `<form id="${creating ? "intake-form" : "task-form"}">
    ${ui.formError ? `<p class="error">${esc(ui.formError)}</p>` : ""}
    <div class="phases" style="margin-top:8px">${PHASES.map((phase) => `<button class="phase ${phaseOf(draft.status) === phase.id ? "on" : ""}" data-act="set-phase" data-phase="${phase.id}" type="button"><small>${esc(phase.hint)}</small><b>${esc(phase.label)}</b></button>`).join("")}</div>
    <div class="grid-2">
      <label class="field"><span>프로젝트명</span><input data-draft="project" value="${esc(draft.project)}"></label>
      <label class="field"><span>요청 부서</span><select data-draft="dept">${options(depts, draft.dept, "선택")}</select></label>
      <label class="field"><span>요청자</span><input data-draft="requester" value="${esc(draft.requester)}" placeholder="이름과 직급"></label>
      <label class="field"><span>수행 담당</span><select data-draft="assignee" ${user.role === "lead" ? "" : "disabled"}>${options(people.map((id) => ({ value: id, label: id || "미배정" })), draft.assignee || "")}</select></label>
      <label class="field"><span>상태</span><select data-draft="status" ${user.role === "requester" ? "disabled" : ""}>${options(STATUSES, draft.status)}</select></label>
      <label class="field"><span>우선순위</span><select data-draft="priority">${options(PRIORITIES, draft.priority)}</select></label>
      <label class="field"><span>시작일</span><input data-draft="start" type="date" value="${esc(draft.start || "")}"></label>
      <label class="field"><span>종료 예정</span><input data-draft="due" type="date" value="${esc(draft.due || "")}"></label>
      <label class="field"><span>진도율</span><input data-draft="progress" type="number" min="0" max="100" value="${draft.progress ?? ""}"></label>
    </div>
    <label class="field"><span>진행 내용</span><textarea data-draft="summary">${esc(draft.summary)}</textarea></label>
    <div class="field"><span>작업 유형</span><div class="checks">${types.map((type) => `<label><input type="checkbox" data-type="${esc(type)}" ${(draft.workTypes || []).includes(type) ? "checked" : ""}>${esc(type)}</label>`).join("")}</div></div>
    <label class="field"><span>이번 주 진행</span><textarea data-draft="progressNote">${esc(draft.progressNote || "")}</textarea></label>
    <label class="field"><span>산출물</span><textarea data-draft="deliverable" placeholder="완료 시 필수. 예: 조도 검토서 송부">${esc(draft.deliverable || "")}</textarea></label>
    <label class="field"><span>이후 요청</span><textarea data-draft="followUp">${esc(draft.followUp || "")}</textarea></label>
    <label class="field"><span>메모</span><textarea data-draft="note">${esc(draft.note || "")}</textarea></label>
    ${creating ? "" : `<label class="field"><span>기록 추가</span><input data-draft="newLog" value="${esc(draft.newLog || "")}" placeholder="이번 주 결정이나 막힌 이유"></label>`}
    <div class="actions"><button class="btn primary" type="submit">${creating ? "접수하기" : "이 주에 반영"}</button>
      ${!creating && ui.editWeekId && ui.editWeekId !== ui.weekId && user.role === "lead" ? `<button class="btn" data-act="place-current" type="button">이번 주 보드에 올리기</button>` : ""}
    </div>
  </form>`;
}

function renderLogin() {
  return `<div class="login">
    <section class="login-visual">
      <div>
        <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 7.2v9.6M9 10.2c1.2 1.3 4.8 1.3 6 0" fill="none" stroke="#f3eadc" stroke-width="1.2" stroke-linecap="round"/></svg>
        <div class="kicker">DESIGN 1 · OPERATIONS</div>
        <div class="word">Lumen</div>
      </div>
      <div>
        <p class="lede">디자인1팀의 요청, 수행, 협업, 종료를 한 주 단위로 닫는 운영 장부입니다. 시트에 복사되던 주간 체크를 하나의 원장으로 잇습니다.</p>
        <div class="phase-legend">
          <div><strong>생각</strong><span>부서, 요청자, 기한, 유형을 확정</span></div>
          <div><strong>행동</strong><span>담당이 진도와 산출을 남김</span></div>
          <div><strong>연결</strong><span>재작업과 타부서 회신을 추적</span></div>
          <div><strong>종료</strong><span>산출물이 있어야 완료</span></div>
        </div>
      </div>
      <div class="faint" style="color:rgba(243,234,220,.55)">2026 주간 원장 · 외부 접속 · 권한 분리</div>
    </section>
    <section class="login-panel">
      <form class="login-card" id="login-form">
        <h1>들어가기</h1>
        <p class="sub">팀장이 발급한 계정으로 접속합니다. 아래는 이 환경의 기본 계정입니다.</p>
        <div class="stack">
          <label for="login-id">아이디</label>
          <input id="login-id" name="id" autocomplete="username" value="${esc(ui.loginId)}">
          <label for="login-pw">비밀번호</label>
          <input id="login-pw" name="password" type="password" autocomplete="current-password" value="${esc(ui.loginPw)}">
        </div>
        <p class="error">${esc(ui.loginError)}</p>
        <button class="btn primary wide" type="submit">들어가기</button>
        <div class="accounts">
          ${accountHint("jh", "lumen-lead", "팀장 JH")}
          ${accountHint("de", "lumen-de", "선임 DE")}
          ${accountHint("gy", "lumen-gy", "사원 GY")}
          ${accountHint("sales", "lumen-req", "영업 요청 창구")}
          ${accountHint("ceo", "lumen-view", "대표이사")}
        </div>
      </form>
    </section>
  </div>`;
}

function accountHint(id, password, label) {
  return `<button type="button" data-act="fill" data-id="${esc(id)}" data-pw="${esc(password)}">${esc(label)} · ${esc(id)} / ${esc(password)}</button>`;
}

function renderShell() {
  const week = currentWeek();
  const showWeek = !["org", "intake"].includes(ui.view) && user.role !== "requester";
  return `<div class="app">
    <aside class="side">
      <div class="brand"><small>DESIGN 1</small><div class="word">Lumen</div></div>
      <nav class="nav">${navItems().map(([id, label]) => `<button type="button" class="${ui.view === id ? "on" : ""}" data-act="nav" data-view="${id}">${esc(label)}</button>`).join("")}</nav>
      <div class="side-foot">주간 원장 ${state.weeks.length}주<br>${state.tasks.length}개 업무</div>
    </aside>
    <div class="main">
      <header class="topbar">
        ${showWeek ? `<select class="week-select" data-act="week-select" style="width:auto">${state.weeks.map((item) => `<option value="${esc(item.id)}"${item.id === week.id ? " selected" : ""}>${esc(item.label)}</option>`).join("")}</select>` : `<strong>LUMEN</strong>`}
        <input id="q" class="search" placeholder="프로젝트, 요청자, 내용" value="${esc(ui.q)}">
        <div class="spacer"></div>
        ${user.role !== "executive" ? `<button class="btn primary noprint" data-act="nav" data-view="intake" type="button">접수</button>` : ""}
        <span class="who">${esc(user.name)} · ${esc(roleLabel(user.role))}</span>
        <button class="btn noprint" data-act="logout" type="button">나가기</button>
      </header>
      <div class="content">${renderView()}</div>
    </div>
  </div>
  ${ui.view === "intake" ? "" : renderDrawer()}
  ${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ""}`;
}

function renderView() {
  if (ui.view === "ops") return renderOps();
  if (ui.view === "week") return renderWeek();
  if (ui.view === "projects") return renderProjects();
  if (ui.view === "calendar") return renderCalendar();
  if (ui.view === "load") return renderLoad();
  if (ui.view === "report") return renderReport();
  if (ui.view === "close") return renderClose();
  if (ui.view === "org") return renderOrg();
  if (ui.view === "intake") return renderIntake();
  return renderOps();
}

function render() {
  const active = document.activeElement;
  const activeId = active?.id;
  const start = active && "selectionStart" in active ? active.selectionStart : null;
  const end = active && "selectionEnd" in active ? active.selectionEnd : null;
  app.innerHTML = user && state ? renderShell() : renderLogin();
  if (activeId) {
    const next = document.getElementById(activeId);
    if (next) {
      next.focus();
      if (start != null && next.setSelectionRange) next.setSelectionRange(start, end);
    }
  }
}

function readDraftFromDom(root) {
  const draft = { ...(ui.draft || defaultDraft()), workTypes: [] };
  root.querySelectorAll("[data-draft]").forEach((field) => {
    const key = field.dataset.draft;
    if (key === "progress") draft.progress = field.value === "" ? null : Number(field.value);
    else draft[key] = field.value;
  });
  root.querySelectorAll("[data-type]").forEach((field) => {
    if (field.checked) draft.workTypes.push(field.dataset.type);
  });
  return draft;
}

function applyDraft(task, draft, creating) {
  const progress = draft.progress === "" || draft.progress == null || Number.isNaN(Number(draft.progress)) ? null : Number(draft.progress);
  const week = weekById(creating ? ui.weekId : (ui.editWeekId || ui.weekId));
  const latestIndex = task.snapshots.reduce((max, snap) => Math.max(max, weekById(snap.weekId)?.index || 0), 0);
  const editingLatest = creating || week.index >= latestIndex;
  const next = {
    project: draft.project.trim(),
    summary: draft.summary.trim(),
    dept: draft.dept,
    requester: draft.requester.trim(),
    assignee: draft.assignee || "",
    workTypes: [...draft.workTypes],
    priority: draft.priority,
    status: draft.status,
    progress,
    start: draft.start || "",
    due: draft.due || "",
    deliverable: (draft.deliverable || "").trim(),
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
  if (draft.placeOnCurrent && ui.weekId !== week.id && !task.snapshots.some((item) => item.weekId === ui.weekId)) {
    task.snapshots.push({ ...snapBody, weekId: ui.weekId });
  }
  const latest = task.snapshots.reduce((best, item) => (weekById(item.weekId).index > weekById(best.weekId).index ? item : best), task.snapshots[0]);
  task.lastWeekId = latest.weekId;
  if (editingLatest) {
    task.status = latest.status;
    task.progress = latest.progress;
    task.assignee = latest.assignee || task.assignee;
    task.priority = latest.priority;
    task.due = latest.due || task.due;
  }
  if (draft.newLog && draft.newLog.trim()) {
    task.logs = task.logs || [];
    task.logs.push({ at: todayISO(), user: user.initials || user.id, weekId: week.id, text: draft.newLog.trim() });
  }
  if (editingLatest && task.requester && !state.requesters.some((item) => item.name === task.requester)) {
    state.requesters.push({ name: task.requester, dept: task.dept });
  }
}

async function submitDraft(creating) {
  const form = document.getElementById(creating ? "intake-form" : "task-form");
  const draft = readDraftFromDom(form);
  draft.placeOnCurrent = Boolean(ui.draft?.placeOnCurrent);
  ui.draft = draft;
  const errors = validateDraft(draft, { creating });
  if (errors.length) {
    ui.formError = errors[0];
    render();
    return;
  }
  ui.formError = "";
  if (creating) {
    const task = {
      id: uid("n"),
      snapshots: [],
      logs: [],
      closeNote: "",
    };
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
    ui.view = user.role === "requester" ? "ops" : "week";
    openTask(task.id);
    showToast("접수했습니다.");
    return;
  }
  const task = state.tasks.find((item) => item.id === ui.taskId);
  applyDraft(task, draft, false);
  audit(`${task.project} ${task.status}`);
  try {
    await saveState();
  } catch (error) {
    ui.formError = error.message;
    render();
    return;
  }
  showToast("이번 주 보드에 반영했습니다.");
}

async function carryForward() {
  const start = document.getElementById("carry-start").value;
  const end = document.getElementById("carry-end").value;
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
  const sourceId = ui.weekId;
  let moved = 0;
  for (const task of state.tasks) {
    const snap = task.snapshots.find((item) => item.weekId === sourceId);
    if (!snap || CLOSED.has(snap.status)) continue;
    if (task.snapshots.some((item) => item.weekId === target.id)) continue;
    task.snapshots.push({ ...snap, weekId: target.id });
    task.lastWeekId = target.id;
    moved += 1;
  }
  audit(`${target.label} 보드를 열고 ${moved}건 이월`);
  ui.weekId = target.id;
  ui.carryOpen = false;
  await saveState();
  showToast(`${moved}건을 다음 주로 옮겼습니다.`);
}

function openTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || (user.role === "requester" && task.createdBy !== user.id)) return;
  const weekId = task.snapshots.some((snap) => snap.weekId === ui.weekId) ? ui.weekId : task.lastWeekId;
  ui.editWeekId = weekId;
  const shown = present(task, weekId);
  ui.taskId = id;
  ui.formError = "";
  ui.draft = {
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
  if (location.hash !== `#/task/${id}`) location.hash = `#/task/${id}`;
  render();
}

function setHashView(view) {
  ui.view = view;
  ui.taskId = "";
  ui.draft = view === "intake" ? defaultDraft() : null;
  ui.formError = "";
  if (location.hash !== `#/${view}`) location.hash = `#/${view}`;
  else render();
}

function onHash() {
  const hash = location.hash || "#/ops";
  const task = hash.match(/^#\/task\/([A-Za-z0-9]+)/);
  if (task) {
    if (!user || !state) return;
    if (ui.taskId !== task[1]) openTask(task[1]);
    return;
  }
  const view = hash.replace("#/", "");
  ui.view = VIEWS.includes(view) ? view : "ops";
  if (user?.role === "requester" && !["ops", "intake"].includes(ui.view)) ui.view = "ops";
  ui.taskId = "";
  if (ui.view === "intake" && !ui.draft) ui.draft = defaultDraft();
  if (ui.view !== "intake") ui.draft = null;
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
  if (act === "nav") {
    setHashView(el.dataset.view);
    return;
  }
  if (act === "logout") {
    logout();
    return;
  }
  if (act === "open") {
    openTask(el.dataset.id);
    return;
  }
  if (act === "close-drawer") {
    setHashView(ui.view === "intake" ? "intake" : (ui.view || "ops"));
    return;
  }
  if (act === "week") {
    ui.weekId = el.dataset.week;
    const week = currentWeek();
    ui.cal = { year: Number(week.start.slice(0, 4)), month: Number(week.start.slice(5, 7)) };
    render();
    return;
  }
  if (act === "board") {
    ui.board = el.dataset.board;
    render();
    return;
  }
  if (act === "phase-filter") {
    ui.filters.phase = ui.filters.phase === el.dataset.phase ? "" : el.dataset.phase;
    ui.view = "week";
    location.hash = "#/week";
    render();
    return;
  }
  if (act === "place-current") {
    const form = document.getElementById("task-form");
    if (form) ui.draft = readDraftFromDom(form);
    ui.draft.placeOnCurrent = true;
    await submitDraft(false);
    return;
  }
  if (act === "set-phase") {
    const map = { think: "시작전", act: "진행중", link: "재작업", close: "완료" };
    if (!ui.draft) ui.draft = defaultDraft();
    const form = document.getElementById("task-form") || document.getElementById("intake-form");
    if (form) ui.draft = readDraftFromDom(form);
    ui.draft.status = map[el.dataset.phase];
    render();
    return;
  }
  if (act === "carry-open") {
    ui.carryOpen = !ui.carryOpen;
    render();
    return;
  }
  if (act === "carry") {
    await carryForward();
    return;
  }
  if (act === "project") {
    ui.focusProject = el.dataset.project;
    render();
    return;
  }
  if (act === "clear-project") {
    ui.focusProject = "";
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
  if (act === "copy-report") {
    try {
      await navigator.clipboard.writeText(ui.narrative);
      showToast("보고 문장을 복사했습니다.");
    } catch {
      downloadText("lumen-report.txt", ui.narrative);
      showToast("복사 대신 파일로 내려받았습니다.");
    }
    return;
  }
  if (act === "print") {
    window.print();
    return;
  }
  if (act === "reset") {
    if (!confirm("현재 수정이 지워지고 시트에서 가져온 원장으로 돌아갑니다.")) return;
    adoptState(await api("/api/reset", { method: "POST" }));
    ui.weekId = state.weeks[state.weeks.length - 1].id;
    showToast("원본 원장으로 되돌렸습니다.");
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.dataset?.filter) {
    ui.filters[target.dataset.filter] = target.value;
    render();
    return;
  }
  if (target.dataset?.act === "week-select") {
    ui.weekId = target.value;
    const week = currentWeek();
    ui.cal = { year: Number(week.start.slice(0, 4)), month: Number(week.start.slice(5, 7)) };
    render();
    return;
  }
  if (target.dataset?.act === "ritual" && user.role === "lead") {
    state.rituals = state.rituals || {};
    state.rituals[ui.weekId] = state.rituals[ui.weekId] || {};
    state.rituals[ui.weekId][target.dataset.key] = target.checked;
    audit(`${currentWeek().label} ${target.dataset.key} ${target.checked ? "확인" : "해제"}`);
    await saveState();
    showToast("주간 점검을 기록했습니다.");
    return;
  }
  if (target.dataset?.report) {
    ui.report[target.dataset.report] = Number(target.value);
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
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "q") {
    ui.q = event.target.value;
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
    ui.loginId = new FormData(event.target).get("id");
    ui.loginPw = new FormData(event.target).get("password");
    await login(String(ui.loginId || "").trim(), String(ui.loginPw || ""));
    return;
  }
  if (formKey === "intake-form") {
    await submitDraft(true);
    return;
  }
  if (formKey === "task-form") {
    await submitDraft(false);
    return;
  }
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
    const id = String(form.get("id") || "").trim();
    if (state.users.some((item) => item.id === id)) {
      showToast("이미 있는 아이디입니다.");
      return;
    }
    state.users.push({
      id,
      name: String(form.get("name") || "").trim(),
      initials: String(form.get("initials") || form.get("id") || "").trim().toUpperCase(),
      role: form.get("role"),
      dept: form.get("dept"),
      title: "",
      password: String(form.get("password") || ""),
    });
    audit(`${form.get("id")} 계정 추가`);
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
  if (event.key === "Escape" && ui.taskId) setHashView(ui.view || "ops");
});

window.addEventListener("hashchange", onHash);

async function boot() {
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
    render();
  }
}

boot();
