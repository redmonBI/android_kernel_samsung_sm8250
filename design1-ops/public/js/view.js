import {
  PHASES,
  PRIORITIES,
  STATUSES,
  buildNarrative,
  collapseSnapshots,
  isOpenStatus,
  isStalled,
  loadWeight,
  periodStats,
  phaseMeta,
  phaseOf,
  present,
  tasksOnWeek,
} from "./metrics.js";
import { esc, formatDot, formatLong, roleLabel, todayISO } from "./util.js";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function renderLogin(ctx) {
  const healthClass = ctx.health === "ok" ? "ok" : ctx.health === "down" ? "down" : "";
  const healthText = ctx.health === "ok"
    ? "서버에 연결되었습니다. 이 주소로 팀 장부를 같이 봅니다."
    : ctx.health === "down"
      ? "서버가 응답하지 않습니다. design1-ops 폴더에서 node server.js 를 실행하고 http://127.0.0.1:4173 을 여세요."
      : "서버 연결을 확인하고 있습니다.";
  return `<div class="login">
    <section class="login-story">
      <div>
        <div class="kicker">DESIGN 1</div>
        <div class="word">Lumen</div>
      </div>
      <div>
        <p>요청이 들어오면 접수하고, 이번 주 보드에서 수행하고, 산출물이 남으면 닫습니다. 주간 시트를 복사하지 않고 하나의 장부로 잇습니다.</p>
        <div class="story-grid">
          <div><strong>오늘</strong><span>내 일과 오늘 손댈 것</span></div>
          <div><strong>접수함</strong><span>배정 전 요청을 팀장이 닫음</span></div>
          <div><strong>이번 주</strong><span>목록과 보드, 오른쪽 상세</span></div>
          <div><strong>마감</strong><span>기한, 정체, 이월을 순서대로</span></div>
        </div>
      </div>
      <div style="color:#a39b91;font-size:13px">2026 주간 원장</div>
    </section>
    <section class="login-panel">
      <form class="card" id="login-form">
        <div class="health ${healthClass}"><i></i><span>${esc(healthText)}</span></div>
        <h1>들어가기</h1>
        <p class="sub">팀장이 발급한 계정으로 접속합니다.</p>
        <div class="stack">
          <label for="login-id">아이디</label>
          <input id="login-id" name="loginId" autocomplete="username" value="${esc(ctx.loginId || "")}">
          <label for="login-pw">비밀번호</label>
          <input id="login-pw" name="password" type="password" autocomplete="current-password" value="${esc(ctx.loginPw || "")}">
        </div>
        <p class="error">${esc(ctx.loginError || "")}</p>
        <button class="btn primary wide" type="submit">들어가기</button>
        <details class="accounts">
          <summary>이 환경의 기본 계정</summary>
          ${account("jh", "lumen-lead", "팀장 JH")}
          ${account("de", "lumen-de", "선임 DE")}
          ${account("gy", "lumen-gy", "사원 GY")}
          ${account("sales", "lumen-req", "영업 요청")}
          ${account("ceo", "lumen-view", "대표이사")}
        </details>
      </form>
    </section>
  </div>`;
}

function account(id, password, label) {
  return `<button type="button" data-act="fill" data-id="${esc(id)}" data-pw="${esc(password)}">${esc(label)} · ${esc(id)} / ${esc(password)}</button>`;
}

export function renderShell(ctx) {
  const week = currentWeek(ctx);
  return `<div class="shell">
    <aside class="nav">
      <div class="brand"><small>DESIGN 1</small><div class="word">Lumen</div></div>
      <div class="nav-scroll">${navItems(ctx).map(([id, label, count]) => `<button type="button" class="nav-item ${ctx.ui.view === id ? "on" : ""}" data-act="nav" data-view="${id}"><span>${esc(label)}</span>${count != null ? `<span class="nav-count">${count}</span>` : ""}</button>`).join("")}</div>
      <div class="nav-foot">
        <span class="avatar av-${esc(ctx.user.initials)}">${esc(ctx.user.initials)}</span>
        <span style="font-size:13px">${esc(ctx.user.name)}<br><span class="muted">${esc(roleLabel(ctx.user.role))}</span></span>
        <button class="btn quiet" data-act="logout" type="button" style="color:#f4efe8">나가기</button>
      </div>
    </aside>
    <div class="workspace">
      <header class="chrome">
        <div class="crumbs">디자인1팀 / <b>${esc(crumb(ctx))}</b></div>
        ${showWeek(ctx) ? `<select class="week" data-act="week-select">${ctx.state.weeks.map((item) => `<option value="${esc(item.id)}" ${item.id === week.id ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select>` : ""}
        <input id="q" class="search" placeholder="업무, 프로젝트, 요청자" value="${esc(ctx.ui.q || "")}">
        <div class="spacer"></div>
        <button class="btn quiet noprint" data-act="palette" type="button">Ctrl K</button>
        ${ctx.user.role === "executive" ? "" : `<button class="btn primary noprint" data-act="nav" data-view="new" type="button">접수</button>`}
      </header>
      <div class="stage">${renderView(ctx)}</div>
    </div>
  </div>
  ${ctx.ui.palette ? renderPalette(ctx) : ""}
  ${ctx.ui.toast ? `<div class="toast" role="status">${esc(ctx.ui.toast)}</div>` : ""}`;
}

function navItems(ctx) {
  if (ctx.user.role === "requester") return [["today", "내 요청", visible(ctx).length], ["new", "접수", null]];
  const week = currentWeek(ctx);
  const board = tasksOnWeek(visible(ctx), week.id).map((task) => present(task, week.id));
  const mine = board.filter((task) => task.assignee === ctx.user.initials && isOpenStatus(task.status)).length;
  const triage = board.filter((task) => task.status === "시작전" || !task.assignee).length;
  return [
    ["today", "오늘", mine],
    ["inbox", "접수함", triage],
    ["cycle", "이번 주", board.length],
    ["projects", "프로젝트", null],
    ["calendar", "일정", null],
    ["load", "부하", null],
    ["report", "보고", null],
    ["review", "마감", null],
    ["org", "조직", null],
  ];
}

function crumb(ctx) {
  return {
    today: "오늘",
    inbox: "접수함",
    cycle: "이번 주",
    projects: "프로젝트",
    calendar: "일정",
    load: "부하",
    report: "보고",
    review: "마감",
    org: "조직",
    new: "접수",
    work: "업무",
  }[ctx.ui.view] || "오늘";
}

function showWeek(ctx) {
  return !["org", "new"].includes(ctx.ui.view) && ctx.user.role !== "requester";
}

function currentWeek(ctx) {
  return ctx.state.weeks.find((week) => week.id === ctx.ui.weekId) || ctx.state.weeks[ctx.state.weeks.length - 1];
}

function visible(ctx) {
  if (ctx.user.role === "requester") return ctx.state.tasks.filter((task) => task.createdBy === ctx.user.id);
  return ctx.state.tasks;
}

function boardOf(ctx) {
  const week = currentWeek(ctx);
  return tasksOnWeek(visible(ctx), week.id).map((task) => present(task, week.id)).filter((task) => matches(ctx, task));
}

function matches(ctx, task) {
  const q = (ctx.ui.q || "").trim().toLowerCase();
  if (q) {
    const hay = [task.project, task.summary, task.requester, task.dept, task.assignee].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const f = ctx.ui.filters;
  if (f.status && task.status !== f.status) return false;
  if (f.priority && task.priority !== f.priority) return false;
  if (f.assignee && task.assignee !== f.assignee) return false;
  if (f.dept && task.dept !== f.dept) return false;
  return true;
}

function asOf(week) {
  const today = todayISO();
  if (today >= week.start && today <= week.end) return today;
  if (today < week.start) return week.start;
  return week.end;
}

function renderView(ctx) {
  if (ctx.ui.view === "today") return renderToday(ctx);
  if (ctx.ui.view === "inbox") return renderInbox(ctx);
  if (ctx.ui.view === "cycle") return renderCycle(ctx);
  if (ctx.ui.view === "projects") return renderProjects(ctx);
  if (ctx.ui.view === "calendar") return renderCalendar(ctx);
  if (ctx.ui.view === "load") return renderLoad(ctx);
  if (ctx.ui.view === "report") return renderReport(ctx);
  if (ctx.ui.view === "review") return renderReview(ctx);
  if (ctx.ui.view === "org") return renderOrg(ctx);
  if (ctx.ui.view === "new") return renderNew(ctx);
  if (ctx.ui.view === "work") return renderWorkPage(ctx);
  return renderToday(ctx);
}

function head(kicker, title, lead, tools = "") {
  return `<header class="page-head"><div><div class="page-kicker">${esc(kicker)}</div><h1 class="page-title">${title}</h1>${lead ? `<p class="page-lead">${lead}</p>` : ""}</div><div class="page-tools noprint">${tools}</div></header>`;
}

function renderToday(ctx) {
  if (ctx.user.role === "requester") return renderRequesterHome(ctx);
  const week = currentWeek(ctx);
  const today = todayISO();
  const date = new Date(`${today}T00:00:00`);
  const board = tasksOnWeek(visible(ctx), week.id).map((task) => present(task, week.id));
  const mine = board.filter((task) => task.assignee === ctx.user.initials && isOpenStatus(task.status));
  const late = board.filter((task) => isOpenStatus(task.status) && task.due && task.due < asOf(week));
  const stalled = board.filter((task) => isStalled(task, week.id, ctx.state.weeks));
  const done = board.filter((task) => task.status === "완료" || task.status === "완료(추가)");
  const hint = date.getDay() === 1 ? "월요일입니다. 이월과 신규 접수를 배정하면 주간 계획이 닫힙니다."
    : date.getDay() === 3 ? "수요일입니다. 막힌 일과 몰린 담당을 보면 중간 점검이 됩니다."
      : date.getDay() === 5 ? "금요일입니다. 산출물을 확인하고 다음 주로 넘길 일을 정하세요."
        : `${week.label} 보드를 기준으로 오늘 손댈 일을 골랐습니다.`;
  return `${head("오늘", `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`, hint)}
    <section class="kpis">
      ${kpi(mine.length, "내가 맡은 열린 일")}
      ${kpi(late.length, "기한을 넘긴 일")}
      ${kpi(stalled.length, "정체")}
      ${kpi(done.length, "이번 주 종료")}
    </section>
    <div class="home-grid">
      <section class="panel"><h2>내 일</h2>${mine.length ? mine.map((task) => row(task, ctx)).join("") : `<div class="empty">이번 주 보드에서 맡은 열린 일이 없습니다.</div>`}</section>
      <div>
        <section class="panel"><h2>손댈 것</h2>${attention(ctx).map((item) => `<button class="mini" data-act="select" data-id="${esc(item.task.id)}" data-view="cycle" type="button" style="padding:8px 0;border-top:1px solid var(--line)"><b>${esc(item.tag)}</b> ${esc(item.task.project)}<div class="muted">${esc(item.task.assignee || "미배정")} · ${esc(formatDot(item.task.due))}</div></button>`).join("") || `<div class="empty">바로 손댈 위험이 없습니다.</div>`}</section>
        <section class="panel"><h2>담당 부하</h2>${loadRows(ctx).map((rowItem) => barRow(rowItem.name, rowItem.weight, rowItem.capacity)).join("")}</section>
      </div>
    </div>`;
}

function renderRequesterHome(ctx) {
  const tasks = visible(ctx).slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return `${head("내 요청", "올린 업무", "접수는 생각 단계에 남고, 팀장이 담당과 상태를 정합니다.")}
    ${tasks.length ? tasks.map((task) => row(present(task, task.lastWeekId), ctx)).join("") : `<div class="panel empty">아직 접수한 업무가 없습니다. 접수에서 부서, 요청자, 기한, 작업 유형을 남겨 주세요.</div>`}`;
}

function kpi(value, label) {
  return `<article class="kpi"><em class="nums">${esc(value)}</em><span>${esc(label)}</span></article>`;
}

function attention(ctx) {
  const week = currentWeek(ctx);
  const today = asOf(week);
  const items = [];
  for (const task of tasksOnWeek(visible(ctx), week.id).map((item) => present(item, week.id))) {
    if (task.due && task.due < today && isOpenStatus(task.status)) items.push({ task, tag: "기한 지남", rank: 1 });
    else if (task.status === "재작업" || task.status === "보류(지연)") items.push({ task, tag: task.status, rank: 2 });
    else if (task.priority === "긴급" && isOpenStatus(task.status)) items.push({ task, tag: "긴급", rank: 3 });
    else if (isStalled(task, week.id, ctx.state.weeks)) items.push({ task, tag: "정체", rank: 4 });
    else if (task.due === today && isOpenStatus(task.status)) items.push({ task, tag: "오늘 마감", rank: 5 });
  }
  const seen = new Set();
  return items.sort((a, b) => a.rank - b.rank).filter((item) => (seen.has(item.task.id) ? false : seen.add(item.task.id))).slice(0, 6);
}

function loadRows(ctx) {
  const week = currentWeek(ctx);
  const tasks = tasksOnWeek(visible(ctx), week.id).map((task) => present(task, week.id));
  return [
    ["JH", "JH 팀장"],
    ["DE", "DE 선임"],
    ["GY", "GY 사원"],
  ].map(([id, name]) => {
    const mine = tasks.filter((task) => task.assignee === id && isOpenStatus(task.status));
    return {
      id,
      name,
      open: mine.length,
      weight: mine.reduce((sum, task) => sum + loadWeight(task), 0),
      capacity: ctx.state.settings?.capacity?.[id] ?? 8,
      done: tasks.filter((task) => task.assignee === id && (task.status === "완료" || task.status === "완료(추가)")).length,
      items: mine,
    };
  });
}

function barRow(label, value, capacity) {
  const ratio = capacity ? Math.min(100, Math.round((value / capacity) * 100)) : 0;
  const over = value > capacity;
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `<div class="bar-row"><span>${esc(label)}</span><div class="track ${over ? "over" : ""}"><i style="width:${ratio}%"></i></div><span class="nums">${shown}/${capacity}</span></div>`;
}

function row(task, ctx) {
  const on = ctx.ui.selectedId === task.id ? "on" : "";
  const key = String(task.status || "").replace(/[()]/g, "");
  const width = task.progress == null ? 0 : Math.max(0, Math.min(100, Number(task.progress)));
  return `<button class="rowline ${on}" data-act="select" data-id="${esc(task.id)}" type="button">
    <i class="dot s-${esc(key)}"></i>
    <span class="prio prio-${esc(task.priority)}">${esc(task.priority || "—")}</span>
    <span class="row-main"><strong>${esc(task.project)}</strong><em>${esc(task.summary === task.project ? task.dept : task.summary)}</em></span>
    <span class="row-dept">${esc(task.dept || "—")}</span>
    <span class="avatar av-${esc(task.assignee)}">${esc(task.assignee || "·")}</span>
    <span class="row-due">${esc(formatDot(task.due))}</span>
    <span class="mini-bar"><span class="track"><i style="width:${width}%"></i></span></span>
  </button>`;
}

function renderInbox(ctx) {
  const tasks = boardOf(ctx).filter((task) => task.status === "시작전" || !task.assignee);
  return `${head("접수함", "배정 전", "시작 전이거나 담당이 없는 줄입니다. 팀장이 담당을 정하면 이번 주 수행으로 넘어갑니다.")}
    ${split(ctx, tasks, "접수함에 남은 일이 없습니다.")}`;
}

function renderCycle(ctx) {
  const week = currentWeek(ctx);
  const tasks = boardOf(ctx).sort(sortTasks);
  const tools = `<div class="seg">
      <button type="button" class="${ctx.ui.layout === "list" ? "on" : ""}" data-act="layout" data-layout="list">목록</button>
      <button type="button" class="${ctx.ui.layout === "board" ? "on" : ""}" data-act="layout" data-layout="board">보드</button>
    </div>
    <select data-filter="group">${options([["status", "상태"], ["phase", "흐름"], ["assignee", "담당"], ["dept", "부서"]], ctx.ui.group || "status")}</select>`;
  return `${head("이번 주", week.label, `${formatLong(week.start)} – ${formatLong(week.end)} · ${tasks.length}줄`, tools)}
    ${filterBar(ctx)}
    ${ctx.ui.layout === "board" ? boardView(ctx, tasks) : split(ctx, tasks, "이 조건에 해당하는 업무가 없습니다.")}`;
}

function filterBar(ctx) {
  const f = ctx.ui.filters;
  return `<div class="filters noprint">
    <select data-filter="status">${options(STATUSES, f.status, "상태 전체")}</select>
    <select data-filter="priority">${options(PRIORITIES, f.priority, "우선순위 전체")}</select>
    <select data-filter="assignee">${options(["JH", "DE", "GY"], f.assignee, "담당 전체")}</select>
    <select data-filter="dept">${options(ctx.state.departments, f.dept, "부서 전체")}</select>
  </div>`;
}

function options(list, current, blank) {
  const html = [];
  if (blank != null) html.push(`<option value="">${esc(blank)}</option>`);
  for (const item of list) {
    const value = Array.isArray(item) ? item[0] : item;
    const label = Array.isArray(item) ? item[1] : item;
    html.push(`<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`);
  }
  return html.join("");
}

function sortTasks(a, b) {
  const rank = { 긴급: 0, 높음: 1, 보통: 2, 일반: 3 };
  const phase = PHASES.findIndex((item) => item.id === phaseOf(a.status)) - PHASES.findIndex((item) => item.id === phaseOf(b.status));
  if (phase) return phase;
  return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
}

function groupOf(task, group) {
  if (group === "assignee") return task.assignee || "미배정";
  if (group === "dept") return task.dept || "미지정";
  if (group === "phase") return phaseMeta(task.status).label;
  return task.status || "상태 없음";
}

function split(ctx, tasks, empty) {
  const selected = tasks.find((task) => task.id === ctx.ui.selectedId);
  return `<div class="split-view">
    <div class="pane list">${tasks.length ? groupedRows(ctx, tasks) : `<div class="empty">${esc(empty)}</div>`}</div>
    <div class="pane detail">${selected ? issue(ctx, selected, true) : `<div class="empty">목록에서 업무를 고르면 여기에 열립니다.</div>`}</div>
  </div>`;
}

function groupedRows(ctx, tasks) {
  const group = ctx.ui.group || "status";
  if (ctx.ui.view === "inbox") return tasks.map((task) => row(task, ctx)).join("");
  const map = new Map();
  for (const task of tasks) {
    const key = groupOf(task, group);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  return [...map.entries()].map(([key, list]) => `<div class="group-label">${esc(key)} · ${list.length}</div>${list.map((task) => row(task, ctx)).join("")}`).join("");
}

function boardView(ctx, tasks) {
  const group = ctx.ui.group || "status";
  const map = new Map();
  const order = group === "phase" ? PHASES.map((phase) => phase.label) : group === "status" ? STATUSES : [];
  for (const task of tasks) {
    const key = groupOf(task, group);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  const keys = [...new Set([...order.filter((key) => map.has(key)), ...map.keys()])];
  return `<div class="board">${keys.map((key) => `<section class="board-col"><h3>${esc(key)} <span class="muted">${(map.get(key) || []).length}</span></h3>${(map.get(key) || []).map((task) => `<button class="card ${ctx.ui.selectedId === task.id ? "on" : ""}" data-act="select" data-id="${esc(task.id)}" type="button"><strong>${esc(task.project)}</strong><span class="clamp">${esc(task.summary)}</span><div class="muted" style="margin-top:6px">${esc(task.assignee || "미배정")} · ${esc(task.priority)}</div></button>`).join("")}</section>`).join("")}</div>`;
}

function issue(ctx, task, embedded) {
  const raw = ctx.state.tasks.find((item) => item.id === task.id) || task;
  const editable = canEdit(ctx, task);
  const draft = ctx.ui.draft?.taskId === task.id ? ctx.ui.draft : fieldsFrom(task, raw);
  const groups = collapseSnapshots(raw, ctx.state.weeks);
  return `<article class="issue ${embedded ? "" : "solo"}">
    <div class="issue-body">
      <div class="page-kicker">${esc(phaseMeta(draft.status).label)} · ${esc(currentWeek(ctx).label)}</div>
      <h2>${esc(draft.project || task.project)}</h2>
      <dl class="wh">
        <dt>누가 요청</dt><dd>${esc(draft.dept || "—")} · ${esc(draft.requester || "—")}</dd>
        <dt>누가 수행</dt><dd>${esc(draft.assignee || "미배정")}</dd>
        <dt>언제</dt><dd>${esc(formatLong(draft.start))} – ${esc(formatLong(draft.due))}</dd>
        <dt>무엇을</dt><dd>${esc(draft.summary || "—")}</dd>
        <dt>어떻게</dt><dd>${esc((draft.workTypes || []).join(", ") || "—")}</dd>
      </dl>
      ${editable ? workForm(ctx, draft) : `<p class="muted">이 계정은 이 업무를 열람합니다.</p>`}
      <h3 style="margin-top:8px">주간 흐름</h3>
      <ul class="timeline">${groups.map((group) => {
        const start = ctx.state.weeks.find((week) => week.id === group.weekId);
        const end = ctx.state.weeks.find((week) => week.id === group.endWeekId);
        const span = group.count > 1 ? `${start?.label || ""} – ${end?.label || ""} · ${group.count}주 동일` : (start?.label || "");
        return `<li><b>${esc(span)}</b><div class="muted">${esc(group.status)} · 진도 ${group.progress == null ? "미입력" : `${group.progress}%`}</div></li>`;
      }).join("")}</ul>
    </div>
    <aside class="props">
      <div class="prop"><span>상태</span><b>${esc(draft.status)}</b></div>
      <div class="prop"><span>우선순위</span><b class="prio-${esc(draft.priority)}">${esc(draft.priority)}</b></div>
      <div class="prop"><span>담당</span><b>${esc(draft.assignee || "미배정")}</b></div>
      <div class="prop"><span>요청 부서</span><b>${esc(draft.dept || "—")}</b></div>
      <div class="prop"><span>종료 예정</span><b>${esc(formatLong(draft.due))}</b></div>
      ${embedded ? `<button class="btn" data-act="open-full" data-id="${esc(task.id)}" type="button">전체 화면</button>` : `<button class="btn" data-act="nav" data-view="cycle" type="button">이번 주로</button>`}
    </aside>
  </article>`;
}

function fieldsFrom(task, raw) {
  return {
    taskId: task.id,
    project: raw.project,
    summary: raw.summary,
    dept: task.dept || "",
    requester: raw.requester || "",
    assignee: task.assignee || "",
    workTypes: [...(task.workTypes || [])],
    priority: task.priority || "보통",
    status: task.status || "시작전",
    progress: task.progress,
    start: raw.start || "",
    due: task.due || "",
    deliverable: raw.deliverable || "",
    followUp: raw.followUp || "",
    note: raw.note || "",
    progressNote: task.progressNote || "",
    newLog: "",
  };
}

function canEdit(ctx, task) {
  if (ctx.user.role === "lead") return true;
  if (ctx.user.role === "designer") return task.assignee === ctx.user.initials;
  if (ctx.user.role === "requester") return task.createdBy === ctx.user.id && task.status === "시작전";
  return false;
}

function workForm(ctx, draft) {
  const types = [...ctx.state.workTypes];
  for (const type of draft.workTypes || []) if (!types.includes(type)) types.push(type);
  const people = ["", "JH", "DE", "GY"];
  if (draft.assignee && !people.includes(draft.assignee)) people.push(draft.assignee);
  const depts = ctx.state.departments.includes(draft.dept) || !draft.dept ? ctx.state.departments : [draft.dept, ...ctx.state.departments];
  const lock = ctx.user.role !== "lead";
  return `<form id="work-form">
    ${ctx.ui.formError ? `<p class="error">${esc(ctx.ui.formError)}</p>` : ""}
    <div class="prop"><span>프로젝트명</span><input data-draft="project" value="${esc(draft.project)}"></div>
    <label class="prop"><span>진행 내용</span><textarea data-draft="summary">${esc(draft.summary)}</textarea></label>
    <div class="checks" style="margin:8px 0 12px">${PHASES.map((phase) => `<button class="btn ${phaseOf(draft.status) === phase.id ? "primary" : ""}" data-act="set-phase" data-phase="${phase.id}" type="button">${esc(phase.label)}</button>`).join("")}</div>
    <div class="prop"><span>요청 부서</span><select data-draft="dept">${options(depts, draft.dept, "선택")}</select></div>
    <div class="prop"><span>요청자</span><input data-draft="requester" value="${esc(draft.requester)}"></div>
    <div class="prop"><span>수행 담당</span><select data-draft="assignee" ${lock ? "disabled" : ""}>${options(people.map((id) => [id, id || "미배정"]), draft.assignee || "")}</select></div>
    <div class="prop"><span>상태</span><select data-draft="status" ${ctx.user.role === "requester" ? "disabled" : ""}>${options(STATUSES, draft.status)}</select></div>
    <div class="prop"><span>우선순위</span><select data-draft="priority">${options(PRIORITIES, draft.priority)}</select></div>
    <div class="prop"><span>시작일</span><input data-draft="start" type="date" value="${esc(draft.start || "")}"></div>
    <div class="prop"><span>종료 예정</span><input data-draft="due" type="date" value="${esc(draft.due || "")}"></div>
    <div class="prop"><span>진도율</span><input data-draft="progress" type="number" min="0" max="100" value="${draft.progress ?? ""}"></div>
    <div class="prop"><span>작업 유형</span><div class="checks">${types.map((type) => `<label><input type="checkbox" data-type="${esc(type)}" ${(draft.workTypes || []).includes(type) ? "checked" : ""}>${esc(type)}</label>`).join("")}</div></div>
    <label class="prop"><span>이번 주 진행</span><textarea data-draft="progressNote">${esc(draft.progressNote || "")}</textarea></label>
    <label class="prop"><span>산출물</span><textarea data-draft="deliverable" placeholder="완료할 때 한 줄">${esc(draft.deliverable || "")}</textarea></label>
    <label class="prop"><span>기록 추가</span><input data-draft="newLog" value="${esc(draft.newLog || "")}" placeholder="결정이나 막힌 이유"></label>
    <div class="actions"><button class="btn primary" type="submit">이 주에 반영</button></div>
  </form>`;
}

function renderWorkPage(ctx) {
  const raw = ctx.state.tasks.find((task) => task.id === ctx.ui.selectedId);
  if (!raw) return `<div class="empty">업무를 찾지 못했습니다.</div>`;
  const weekId = raw.snapshots.some((snap) => snap.weekId === ctx.ui.weekId) ? ctx.ui.weekId : raw.lastWeekId;
  return issue(ctx, present(raw, weekId), false);
}

function renderProjects(ctx) {
  const q = (ctx.ui.q || "").trim().toLowerCase();
  const map = new Map();
  for (const task of visible(ctx)) {
    const key = task.project || "(프로젝트명 없음)";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  let groups = [...map.entries()].map(([name, tasks]) => {
    const open = tasks.filter((task) => isOpenStatus(task.status)).length;
    const stalled = tasks.filter((task) => isStalled(task, currentWeek(ctx).id, ctx.state.weeks)).length;
    const last = Math.max(...tasks.map((task) => weekIndex(ctx, task.lastWeekId)));
    return { name, tasks, open, stalled, last, people: [...new Set(tasks.map((task) => task.assignee).filter(Boolean))] };
  }).sort((a, b) => b.last - a.last || b.open - a.open);
  if (q) groups = groups.filter((group) => group.name.toLowerCase().includes(q));
  if (ctx.ui.project) {
    const group = groups.find((item) => item.name === ctx.ui.project) || [...map.entries()].map(([name, tasks]) => ({ name, tasks })).find((item) => item.name === ctx.ui.project);
    if (group) {
      return `${head("프로젝트", esc(group.name), `${group.tasks.length}개 업무 · 열린 일 ${group.tasks.filter((task) => isOpenStatus(task.status)).length}`, `<button class="btn" data-act="clear-project" type="button">전체</button>`)}
        ${group.tasks.map((task) => row(present(task, task.lastWeekId), ctx)).join("")}`;
    }
  }
  const rows = groups.map((group) => `<tr class="hit" data-act="project" data-project="${esc(group.name)}"><td><b>${esc(group.name)}</b></td><td class="nums">${group.open}</td><td class="nums">${group.stalled}</td><td>${esc(group.people.join(" "))}</td><td>${group.stalled ? "정체" : group.open ? "진행" : "종료"}</td></tr>`).join("");
  return `${head("프로젝트", "현장과 문서", "같은 이름은 한 프로젝트로 모으고, 정체가 있으면 진행보다 먼저 보입니다.")}
    <div class="table-wrap"><table><thead><tr><th>프로젝트</th><th>열림</th><th>정체</th><th>담당</th><th>상태</th></tr></thead><tbody>${rows || `<tr><td colspan="5">없음</td></tr>`}</tbody></table></div>`;
}

function weekIndex(ctx, id) {
  return ctx.state.weeks.find((week) => week.id === id)?.index || 0;
}

function renderCalendar(ctx) {
  const { year, month } = ctx.ui.cal;
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  const pad = (first.getDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const week = currentWeek(ctx);
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const dated = visible(ctx).filter((task) => task.due && task.due.startsWith(prefix));
  const today = todayISO();
  return `${head("일정", `${year}년 ${month}월`, "종료 예정일이 있는 업무입니다. 선택된 주는 테두리가 있습니다.", `<button class="btn" data-act="month" data-delta="-1" type="button">이전달</button><button class="btn" data-act="month" data-delta="1" type="button">다음달</button>`)}
    <div class="cal-grid" style="margin-bottom:6px">${["월", "화", "수", "목", "금", "토", "일"].map((day) => `<div class="dow">${day}</div>`).join("")}</div>
    <div class="cal-grid">${cells.map((day) => {
      if (!day) return `<div class="day"></div>`;
      const iso = `${prefix}-${String(day).padStart(2, "0")}`;
      const chips = dated.filter((task) => task.due === iso).slice(0, 3).map((task) => `<button class="chip" data-act="select" data-id="${esc(task.id)}" data-view="work" type="button">${esc(task.project)}</button>`).join("");
      return `<div class="day ${iso >= week.start && iso <= week.end ? "inweek" : ""}"><div class="n">${day === Number(today.slice(8)) && iso.slice(0, 7) === today.slice(0, 7) ? `<b>${day}</b>` : day}</div>${chips}</div>`;
    }).join("")}</div>`;
}

function renderLoad(ctx) {
  const rows = loadRows(ctx);
  return `${head("부하", `${currentWeek(ctx).label}`, "긴급 3, 높음 2, 보통 1, 일반 0.5입니다. 수시 점검은 0.4배, 시작 전과 대기는 0.5배입니다.")}
    <div class="people">${rows.map((person) => `<article class="person"><h3>${esc(person.name)}</h3><p class="muted">진행 ${person.open} · 이번 주 종료 ${person.done}</p>${barRow("부하", person.weight, person.capacity)}${person.items.map((task) => `<button class="mini" data-act="select" data-id="${esc(task.id)}" data-view="cycle" type="button" style="padding:8px 0;border-top:1px solid var(--line)"><b>${esc(task.project)}</b><div class="muted">${esc(task.priority)} · ${esc(task.status)}</div></button>`).join("") || `<div class="empty">열린 일이 없습니다.</div>`}</article>`).join("")}</div>`;
}

function renderReport(ctx) {
  const period = selectedPeriod(ctx);
  const stats = periodStats(visible(ctx), period.weeks);
  const stalled = period.weeks.length ? visible(ctx).filter((task) => task.snapshots.some((snap) => period.weeks.some((week) => week.id === snap.weekId)) && isStalled(task, period.weeks[period.weeks.length - 1].id, ctx.state.weeks)) : [];
  ctx.ui.narrative = buildNarrative(period.label, stats, stalled.length);
  const people = Object.entries(stats.byPerson).sort((a, b) => b[1].slots - a[1].slots);
  const depts = Object.entries(stats.byDept).sort((a, b) => b[1].slots - a[1].slots);
  const maxDept = Math.max(...depts.map((item) => item[1].slots), 1);
  return `${head("보고", period.label, "슬롯 완료율은 그 기간 보드에 올라온 줄 기준입니다. 고유 업무는 여러 주에 이어진 일을 한 건으로 모읍니다.", `<div class="seg">${[["week", "주"], ["month", "월"], ["quarter", "분기"], ["half", "반기"], ["year", "연"]].map(([id, label]) => `<button type="button" class="${ctx.ui.report.grain === id ? "on" : ""}" data-act="grain" data-grain="${id}">${label}</button>`).join("")}</div>`)}
    <div class="filters noprint">
      ${ctx.ui.report.grain === "month" ? `<select data-report="month">${options([4, 5, 6, 7, 8, 9, 10].map((month) => [String(month), `${month}월`]), String(ctx.ui.report.month))}</select>` : ""}
      ${ctx.ui.report.grain === "quarter" ? `<select data-report="quarter">${options([1, 2, 3, 4].map((quarter) => [String(quarter), `${quarter}분기`]), String(ctx.ui.report.quarter))}</select>` : ""}
      ${ctx.ui.report.grain === "half" ? `<select data-report="half">${options([["1", "상반기"], ["2", "하반기"]], String(ctx.ui.report.half))}</select>` : ""}
      <button class="btn" data-act="copy-report" type="button">문장 복사</button>
      <button class="btn" data-act="print" type="button">인쇄</button>
    </div>
    <div class="report-text">${esc(ctx.ui.narrative)}</div>
    <section class="kpis">${kpi(stats.slots, "주간 슬롯")}${kpi(stats.done, "완료 슬롯")}${kpi(`${Math.round(stats.rate * 1000) / 10}%`, "슬롯 완료율")}${kpi(stats.unique, "고유 업무")}</section>
    <div class="home-grid">
      <section class="panel"><h2>담당</h2><div class="table-wrap"><table><thead><tr><th>담당</th><th>슬롯</th><th>완료</th><th>완료율</th><th>긴급</th><th>높음</th><th>보통</th><th>일반</th></tr></thead><tbody>${people.map(([name, rowItem]) => `<tr><td>${esc(name)}</td><td class="nums">${rowItem.slots}</td><td class="nums">${rowItem.done}</td><td class="nums">${rowItem.slots ? Math.round((rowItem.done / rowItem.slots) * 1000) / 10 : 0}%</td><td class="nums">${rowItem.긴급}</td><td class="nums">${rowItem.높음}</td><td class="nums">${rowItem.보통}</td><td class="nums">${rowItem.일반}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="panel"><h2>요청 부서</h2>${depts.slice(0, 8).map(([name, rowItem]) => barRow(name, rowItem.slots, maxDept)).join("")}</section>
    </div>`;
}

function selectedPeriod(ctx) {
  const year = 2026;
  if (ctx.ui.report.grain === "week") {
    const week = currentWeek(ctx);
    return { label: `${week.label} 주간`, weeks: [week] };
  }
  if (ctx.ui.report.grain === "month") return { label: `${year}년 ${ctx.ui.report.month}월`, weeks: ctx.state.weeks.filter((week) => week.year === year && week.month === ctx.ui.report.month) };
  if (ctx.ui.report.grain === "quarter") {
    const start = (ctx.ui.report.quarter - 1) * 3 + 1;
    const months = [start, start + 1, start + 2];
    return { label: `${year}년 ${ctx.ui.report.quarter}분기`, weeks: ctx.state.weeks.filter((week) => months.includes(week.month)) };
  }
  if (ctx.ui.report.grain === "half") {
    const months = ctx.ui.report.half === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
    return { label: `${year}년 ${ctx.ui.report.half === 1 ? "상반기" : "하반기"}`, weeks: ctx.state.weeks.filter((week) => months.includes(week.month)) };
  }
  return { label: `${year}년`, weeks: ctx.state.weeks.filter((week) => week.year === year) };
}

function renderReview(ctx) {
  const week = currentWeek(ctx);
  const today = asOf(week);
  const tasks = tasksOnWeek(visible(ctx), week.id).map((task) => present(task, week.id));
  const steps = [
    ["기한을 넘긴 일", tasks.filter((task) => isOpenStatus(task.status) && task.due && task.due < today)],
    ["진도가 4주 이상 같은 일", tasks.filter((task) => isStalled(task, week.id, ctx.state.weeks))],
    ["이번 주 안에 닫을 일", tasks.filter((task) => isOpenStatus(task.status) && task.due && task.due >= week.start && task.due <= week.end)],
    ["산출물 없이 완료된 일", tasks.filter((task) => (task.status === "완료" || task.status === "완료(추가)") && !String(task.deliverable || task.progressNote || "").trim())],
  ];
  const step = Math.min(ctx.ui.reviewStep || 0, steps.length);
  return `${head("마감", week.label, "기한, 정체, 이번 주 마감, 산출물, 이월 순서로 주를 닫습니다.")}
    <div class="wizard">${steps.map(([title], index) => `<button class="btn ${step === index ? "primary" : ""}" data-act="review-step" data-step="${index}" type="button">${index + 1}. ${esc(title)}</button>`).join("")}${ctx.user.role === "lead" ? `<button class="btn ${step === steps.length ? "primary" : ""}" data-act="review-step" data-step="${steps.length}" type="button">5. 다음 주</button>` : ""}</div>
    ${step < steps.length ? `<section class="panel"><h2>${esc(steps[step][0])} · ${steps[step][1].length}</h2>${steps[step][1].length ? steps[step][1].map((task) => row(task, ctx)).join("") : `<div class="empty">이 단계에 해당하는 일이 없습니다.</div>`}<div class="actions"><button class="btn" data-act="review-step" data-step="${Math.max(0, step - 1)}" type="button">이전</button><button class="btn primary" data-act="review-step" data-step="${step + 1}" type="button">다음</button></div></section>` : renderCarry(ctx)}`;
}

function renderCarry(ctx) {
  const week = currentWeek(ctx);
  const open = tasksOnWeek(ctx.state.tasks, week.id).filter((task) => {
    const snap = task.snapshots.find((item) => item.weekId === week.id);
    return snap && !["완료", "완료(추가)", "취소"].includes(snap.status);
  }).length;
  return `<section class="panel"><h2>다음 주 보드</h2><p class="page-lead">끝나지 않은 ${open}건만 다음 주로 옮깁니다. 완료와 취소는 이번 주에 남습니다.</p>
    <div class="actions" style="margin-top:12px">
      <label class="prop">시작<input id="carry-start" type="date" value="${esc(ctx.ui.carryStart || "")}"></label>
      <label class="prop">종료<input id="carry-end" type="date" value="${esc(ctx.ui.carryEnd || "")}"></label>
    </div>
    <button class="btn primary" data-act="carry" type="button">이월하고 다음 주 열기</button>
  </section>`;
}

function renderNew(ctx) {
  const draft = ctx.ui.draft || {
    project: "",
    summary: "",
    dept: ctx.user.role === "requester" ? ctx.user.dept : "",
    requester: "",
    assignee: ctx.user.role === "designer" ? ctx.user.initials : "",
    workTypes: [],
    priority: "보통",
    status: "시작전",
    progress: null,
    start: todayISO(),
    due: "",
    deliverable: "",
    progressNote: "",
    newLog: "",
    followUp: "",
    note: "",
  };
  return `${head("접수", "새 업무", "부서, 요청자, 종료 예정, 작업 유형이 있어야 접수됩니다.")}
    <section class="panel" style="max-width:720px">${workForm(ctx, draft).replace('id="work-form"', 'id="intake-form"').replace("이 주에 반영", "접수하기")}</section>`;
}

function renderOrg(ctx) {
  const lead = ctx.user.role === "lead";
  return `${head("조직", "사람과 권한", "팀장은 배정과 종료와 이월을 하고, 디자이너는 자기 업무를 고칩니다. 요청 부서는 접수와 자기 요청만 봅니다.")}
    <section class="panel"><h2>운영 기준</h2>
      <p>접수에는 부서, 요청자, 종료 예정, 작업 유형이 있습니다.</p>
      <p>진행으로 넘길 때는 수행 담당이 있습니다.</p>
      <p>완료에는 산출물 한 줄이 남습니다. 같은 진도가 4주면 정체입니다.</p>
    </section>
    <section class="panel"><h2>확인이 필요한 기준</h2>
      <p>JH, DE, GY는 시트에 적힌 이니셜입니다. 성명과 정식 직급은 아직 장부에 없습니다.</p>
      <p>주간 수용량은 JH 8, DE 8, GY 8로 잡아 두었습니다. 실제 동시 수행 한도에 맞게 바꾸면 됩니다.</p>
      <p>영업 계정은 개인이 아니라 요청 창구 하나입니다. 영업 담당자별 계정이 필요하면 조직에서 추가합니다.</p>
      <p>산출물은 문장으로만 남습니다. 파일 경로나 도면 링크 칸은 아직 없습니다.</p>
      <p>수시 점검은 끝나지 않는 현장으로 보고 부하를 낮게 계산합니다. 종료 기준이 있으면 상태를 완료로 닫으면 됩니다.</p>
    </section>
    <section class="panel"><h2>권한</h2>
      <div class="table-wrap"><table><thead><tr><th></th><th>팀장</th><th>디자이너</th><th>요청</th><th>임원</th></tr></thead>
      <tbody>
        ${perm("보드 열람", "전체", "전체", "본인 요청", "전체")}
        ${perm("접수", "가능", "가능", "가능", "없음")}
        ${perm("담당 배정", "가능", "본인 고정", "없음", "없음")}
        ${perm("종료", "가능", "본인 산출물", "없음", "없음")}
        ${perm("이월", "가능", "없음", "없음", "없음")}
        ${perm("보고", "가능", "가능", "없음", "가능")}
      </tbody></table></div>
    </section>
    <div class="home-grid">
      <section class="panel"><h2>계정</h2>
        ${ctx.state.users.map((item) => `<div style="display:grid;grid-template-columns:1fr 140px;gap:8px;align-items:center;margin:8px 0"><div><b>${esc(item.name)}</b><div class="muted">${esc(item.dept)} · ${esc(item.id)}</div></div>${lead && item.id !== ctx.user.id ? `<select data-act="role" data-user="${esc(item.id)}">${options([["lead", "팀장"], ["designer", "디자이너"], ["requester", "요청 부서"], ["executive", "임원"]], item.role)}</select>` : `<div>${esc(roleLabel(item.role))}</div>`}</div>`).join("")}
        ${lead ? `<form id="new-user" class="stack" style="margin-top:12px"><b>계정 추가</b><input name="userId" placeholder="아이디" required pattern="[a-z0-9]{2,16}"><input name="name" placeholder="이름" required><input name="initials" placeholder="이니셜" maxlength="4"><select name="role">${options([["designer", "디자이너"], ["requester", "요청 부서"], ["executive", "임원"]], "designer")}</select><select name="dept">${options(ctx.state.departments, "디자인1팀")}</select><input name="password" placeholder="임시 비밀번호" required minlength="6"><button class="btn primary" type="submit">만들기</button></form>` : ""}
      </section>
      <div>
        <section class="panel"><h2>내 비밀번호</h2><form id="password" class="stack"><input name="current" type="password" placeholder="현재 비밀번호" required><input name="next" type="password" placeholder="새 비밀번호" required minlength="6"><button class="btn" type="submit">변경</button></form></section>
        ${lead ? `<section class="panel"><h2>주간 수용량</h2><form id="capacity" class="stack">${["JH", "DE", "GY"].map((id) => `<label class="prop"><span>${id}</span><input name="${id}" type="number" min="1" max="20" value="${esc(ctx.state.settings.capacity[id])}"></label>`).join("")}<button class="btn" type="submit">저장</button></form><button class="btn" data-act="reset" type="button" style="margin-top:10px">시트 원본으로 되돌리기</button></section>` : ""}
      </div>
    </div>`;
}

function perm(label, ...cells) {
  return `<tr><td>${esc(label)}</td>${cells.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`;
}

function renderPalette(ctx) {
  const q = (ctx.ui.paletteQ || "").trim().toLowerCase();
  const pages = navItems(ctx).filter((item) => !q || item[1].includes(q));
  const tasks = visible(ctx).filter((task) => !q || `${task.project} ${task.summary} ${task.requester}`.toLowerCase().includes(q)).slice(0, 8);
  return `<div class="palette-back" data-act="palette-close"></div>
    <div class="palette" role="dialog">
      <input id="palette-q" placeholder="화면 또는 업무" value="${esc(ctx.ui.paletteQ || "")}">
      ${pages.map(([id, label]) => `<button type="button" data-act="nav" data-view="${id}">${esc(label)}</button>`).join("")}
      ${tasks.map((task) => `<button type="button" data-act="select" data-id="${esc(task.id)}" data-view="work">${esc(task.project)} <span class="muted">${esc(task.summary)}</span></button>`).join("")}
    </div>`;
}
