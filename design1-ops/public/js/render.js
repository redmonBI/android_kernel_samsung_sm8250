export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function lines(value) {
  return esc(value).replace(/\n/g, "<br>");
}

function pri(priority) {
  const kind = priority === "긴급" ? "urgent" : priority === "높음" ? "high" : priority === "보통" ? "mid" : "low";
  return `<span class="pri ${kind}">${esc(priority || "일반")}</span>`;
}

function st(status) {
  const kind = status === "완료" ? "done" : status === "진행중" ? "run" : status === "대기중" ? "wait" : status === "수시체크" ? "watch" : "idle";
  return `<span class="st ${kind}">${esc(status || "상태 없음")}</span>`;
}

function taskArticle(task, extra = "") {
  const reminder = task.reminderLabel ? `<span class="tag hot">${esc(task.reminderLabel)}</span>` : "";
  const mine = task.mine ? `<span class="tag mine">내 담당</span>` : "";
  const desk = task.deskDone && !task.sheetClosed ? `<span class="tag">데스크 완료</span>` : "";
  const moved = task.overrideDue ? `<span class="tag">일정 변경</span>` : "";
  const important = task.important ? `<span class="tag hot">중요</span>` : "";
  return `<article class="task ${task.reminderKind ? "hot" : ""} ${task.closed ? "closed" : ""}">
    <div class="task-top">${st(task.sheetClosed ? "완료" : task.status)}${pri(task.priority)}${mine}${important}<b>${esc(task.project || task.detail || "이름 없는 업무")}</b><span class="who">${esc(task.assignee || "미배정")}</span></div>
    <div class="meta">${esc(task.detail || "")}</div>
    <div class="task-foot">
      <span class="meta">${esc(task.dueLabel)}${task.assumedTime && task.dueIso ? " · 시간 미입력" : ""}</span>
      ${reminder}${desk}${moved}
      <span class="meta">${esc([task.dept, task.workType, task.progress].filter(Boolean).join(" · "))}</span>
      <span class="spacer"></span>
      <button class="btn tiny" type="button" data-act="select" data-key="${esc(task.key)}">상세</button>
      <button class="btn tiny primary" type="button" data-act="focus" data-source="sheet" data-ref="${esc(task.key)}">체크</button>
      ${extra}
    </div>
  </article>`;
}

function todoArticle(todo) {
  const doing = todo.status === "doing" ? `<span class="st run">진행중</span>` : "";
  const important = todo.important ? `<span class="tag hot">중요</span>` : "";
  const reminder = todo.reminderLabel ? `<span class="tag hot">${esc(todo.reminderLabel)}</span>` : "";
  return `<article class="todo ${todo.important ? "important" : ""}">
    <div class="todo-top">${doing}${important}${reminder}<b>${esc(todo.title)}</b></div>
    <div class="meta">${esc(todo.dueLabel)}${todo.note ? ` · ${esc(todo.note)}` : ""}${todo.snoozeLabel ? ` · ${esc(todo.snoozeLabel)} 재확인` : ""}</div>
    <div class="row-actions">
      <button class="btn tiny good" type="button" data-act="todo-status" data-id="${esc(todo.id)}" data-status="done">완료</button>
      <button class="btn tiny" type="button" data-act="todo-status" data-id="${esc(todo.id)}" data-status="${todo.status === "doing" ? "open" : "doing"}">${todo.status === "doing" ? "대기로" : "진행중"}</button>
      <button class="btn tiny primary" type="button" data-act="focus" data-source="todo" data-ref="${esc(todo.id)}">체크</button>
      <button class="btn tiny" type="button" data-act="todo-move" data-id="${esc(todo.id)}" data-bucket="today">오늘</button>
      <button class="btn tiny" type="button" data-act="todo-move" data-id="${esc(todo.id)}" data-bucket="week">이번 주</button>
      <button class="btn tiny" type="button" data-act="todo-move" data-id="${esc(todo.id)}" data-bucket="next">다음 주</button>
      <button class="btn tiny" type="button" data-act="todo-flag" data-id="${esc(todo.id)}" data-important="${todo.important ? "0" : "1"}">${todo.important ? "중요 해제" : "중요"}</button>
      <button class="btn tiny danger" type="button" data-act="todo-delete" data-id="${esc(todo.id)}">삭제</button>
    </div>
  </article>`;
}

function visibleTasks(desk, ui) {
  const query = ui.q.trim().toLowerCase();
  return desk.tasks.filter((task) => {
    if (ui.status && task.status !== ui.status) return false;
    if (ui.priority && task.priority !== ui.priority) return false;
    if (ui.assignee && (task.assignee || "미배정") !== ui.assignee) return false;
    if (ui.due === "soon" && !task.reminderKind) return false;
    if (ui.due === "overdue" && task.reminderKind !== "overdue") return false;
    if (ui.due === "open" && task.closed) return false;
    if (!query) return true;
    const blob = [task.project, task.detail, task.requester, task.assignee, task.workType, task.dept, task.progressNote].join(" ").toLowerCase();
    return blob.includes(query);
  });
}

function options(values, current, allLabel) {
  return [`<option value="">${esc(allLabel)}</option>`]
    .concat(values.map((value) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(value)}</option>`))
    .join("");
}

function detail(task) {
  if (!task) return "";
  const fields = [
    ["요청", `${task.dept} ${task.requester}`.trim()],
    ["작업", task.workType],
    ["시작", task.start],
    ["시트 종료", task.dueRaw || "없음"],
    ["진도", task.progress],
    ["등록", task.registeredAt],
    ["시트 수정", task.updatedAt],
    ["진행 사항", task.progressNote],
    ["요청·개선", task.requestNote],
    ["비고", task.memo],
    ["데스크 메모", task.note],
    ["바꾼 일정", task.overrideDue],
  ];
  const history = (task.history || []).slice(-5).reverse().map((item) => `<div>${esc(item.user)} · ${esc(item.action)} ${esc(item.detail || "")}</div>`).join("");
  const sentence = [task.deskDone ? "완료" : task.status, task.project, task.assignee, task.overrideDue || task.dueRaw, task.note].filter(Boolean).join(" · ");
  return `<aside class="card detail">
    <div class="task-top">${st(task.status)}${pri(task.priority)}<span class="who">${esc(task.assignee || "미배정")}</span></div>
    <h3>${esc(task.project || "업무")}</h3>
    <p>${lines(task.detail || "")}</p>
    ${fields.filter(([, value]) => String(value || "").trim()).map(([label, value]) => `<div class="meta"><b>${esc(label)}</b> ${lines(value)}</div>`).join("")}
    <div class="choice">
      <button class="btn good" type="button" data-act="check-done" data-key="${esc(task.key)}">완료</button>
      <button class="btn warn" type="button" data-act="check-snooze" data-source="sheet" data-ref="${esc(task.key)}" data-mode="1h">1시간 뒤 재확인</button>
      <button class="btn warn" type="button" data-act="check-snooze" data-source="sheet" data-ref="${esc(task.key)}" data-mode="tomorrow">내일 아침</button>
      <button class="btn" type="button" data-act="panel" data-panel="reschedule" data-source="sheet" data-ref="${esc(task.key)}">일정 변경</button>
      <button class="btn" type="button" data-act="flag" data-key="${esc(task.key)}" data-important="${task.important ? "0" : "1"}">${task.important ? "중요 해제" : "중요 팝업"}</button>
      ${task.deskDone ? `<button class="btn" type="button" data-act="reopen" data-key="${esc(task.key)}">다시 열기</button>` : ""}
      <button class="btn" type="button" data-act="copy" data-copy="${esc(encodeURIComponent(sentence))}">시트에 적을 문장 복사</button>
    </div>
    ${history ? `<div class="history">${history}</div>` : ""}
  </aside>`;
}

function todayView(desk, ui) {
  const tasks = visibleTasks(desk, ui);
  const reminders = tasks.filter((task) => task.reminderKind && !task.closed);
  const mine = tasks.filter((task) => task.mine && !task.closed);
  const todos = desk.todos.today;
  return `<section class="card">
      <div class="kicker">오늘 ${esc(desk.todayLabel)}</div>
      <h2 style="font-size:28px;margin:4px 0 8px">지금 놓치면 안 되는 일</h2>
      <div class="meta">${esc(desk.weekLabel)} · 시트 열린 업무 ${desk.counts.open}건 · 체크 ${reminders.length}건</div>
      ${desk.insights.length ? `<ul class="insights">${desk.insights.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : `<p class="sub">담당이 고르게 나뉘어 있고, 겹친 프로젝트 이름은 없습니다.</p>`}
    </section>
    <div class="split">
      <section>
        <div class="section-head"><h2>시트에서 체크할 업무</h2><span class="meta">하루 전, 한 시간 전, 지난 기한</span></div>
        <div class="list">${reminders.length ? reminders.map((task) => taskArticle(task)).join("") : `<p class="empty">이 기준에 걸리는 시트 업무가 없습니다.</p>`}</div>
      </section>
      <section>
        <div class="section-head"><h2>내 할 일</h2><button class="btn tiny" type="button" data-act="nav" data-view="mine">전체</button></div>
        <div class="list">${todos.length ? todos.map(todoArticle).join("") : `<p class="empty">오늘로 둔 개인 할 일이 없습니다.</p>`}</div>
        <h2 style="margin-top:18px">내 담당</h2>
        <div class="list">${mine.length ? mine.slice(0, 6).map((task) => taskArticle(task)).join("") : `<p class="empty">이번 시트에서 내 담당으로 열린 업무가 없습니다.</p>`}</div>
      </section>
    </div>
    <section>
      <div class="section-head"><h2>방금 바뀐 시트</h2><button class="btn tiny" type="button" data-act="nav" data-view="alerts">알림 전체</button></div>
      <div class="list">${recentChanges(desk, 5)}</div>
    </section>`;
}

function sheetView(desk, ui) {
  const tasks = visibleTasks(desk, ui);
  const people = [...new Set(desk.tasks.map((task) => task.assignee || "미배정"))];
  const statuses = [...new Set(desk.tasks.map((task) => task.status).filter(Boolean))];
  const priorities = [...new Set(desk.tasks.map((task) => task.priority).filter(Boolean))];
  const selected = desk.tasks.find((task) => task.key === ui.selected);
  return `<section class="card">
      <div class="section-head">
        <div><div class="kicker">주간 시트</div><h2>${esc(desk.sheet.tabName || "업무 체크 리스트")}</h2></div>
        <a class="btn" href="${esc(desk.sheet.url)}" target="_blank" rel="noreferrer">시트 열기</a>
      </div>
      <p class="sub">원본은 구글 시트입니다. 여기서 고른 완료, 재확인, 일정은 데스크에 남고, 시트 상태와 다르면 표시합니다.</p>
      <div class="filters">
        <select id="filter-status">${options(statuses, ui.status, "모든 상태")}</select>
        <select id="filter-priority">${options(priorities, ui.priority, "모든 우선순위")}</select>
        <select id="filter-assignee">${options(people, ui.assignee, "모든 담당")}</select>
        <select id="filter-due">
          <option value="">모든 기한</option>
          <option value="open" ${ui.due === "open" ? "selected" : ""}>열린 업무</option>
          <option value="soon" ${ui.due === "soon" ? "selected" : ""}>체크 필요</option>
          <option value="overdue" ${ui.due === "overdue" ? "selected" : ""}>기한 지남</option>
        </select>
      </div>
    </section>
    ${selected
      ? `<div class="split"><div class="list">${tasks.length ? tasks.map((task) => taskArticle(task)).join("") : `<p class="empty">조건에 맞는 업무가 없습니다.</p>`}</div>${detail(selected)}</div>`
      : `<div class="list">${tasks.length ? tasks.map((task) => taskArticle(task)).join("") : `<p class="empty">조건에 맞는 업무가 없습니다.</p>`}</div>`}`;
}

function teamView(desk) {
  const max = Math.max(1, ...desk.workload.map((item) => item.weight));
  return `<section class="card">
      <div class="kicker">업무 분장</div>
      <h2 style="font-size:28px;margin-top:4px">누가 무엇을 안고 있는지</h2>
      ${desk.insights.length ? `<ul class="insights">${desk.insights.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : `<p class="sub">눈에 띄는 편중은 없습니다.</p>`}
    </section>
    <div class="people">${desk.workload.map((person) => `<article class="person">
      <div class="task-top"><b>${esc(person.name)}</b><span class="meta">가중 ${person.weight}</span></div>
      <div class="bar"><span style="width:${Math.round(person.weight / max * 100)}%"></span></div>
      <div class="meta">열린 ${person.open} · 긴급 ${person.urgent} · 높음 ${person.high} · 마감 임박 ${person.dueSoon}</div>
      <ul>${person.titles.map((title) => `<li>${esc(title)}</li>`).join("")}</ul>
    </article>`).join("")}</div>
    <section>
      <h2>겹치는 프로젝트</h2>
      <div class="list">${desk.duplicates.length ? desk.duplicates.map((group) => `<article class="dup">
        <b>${esc(group.project)}</b>
        <div class="meta">${group.sameDetail ? "진행 내용까지 같습니다." : "같은 프로젝트 이름이 여러 줄입니다."}</div>
        <ul>${group.rows.map((row) => `<li>${esc(row.assignee)} · ${esc(row.status)} · ${esc(row.workType || row.detail || "")}</li>`).join("")}</ul>
      </article>`).join("") : `<p class="empty">같은 프로젝트 이름이 두 줄 이상인 열린 업무는 없습니다.</p>`}</div>
    </section>`;
}

function mineView(desk) {
  const columns = [
    ["today", "오늘", desk.todos.today],
    ["week", "이번 주", desk.todos.week],
    ["next", "다음 주", desk.todos.next],
    ["later", "나중", desk.todos.later],
  ];
  return `<section class="card">
      <div class="kicker">시트 밖</div>
      <h2 style="font-size:28px">내가 매일 챙기는 일</h2>
      <p class="sub">시트에 없는 일을 오늘, 이번 주, 다음 주로 옮겨 둡니다. 날짜가 지나면 오늘 칸으로 올라오고, 중요로 표시하면 팝업을 닫기 전에 완료·재확인·일정 변경 중 하나를 골라야 합니다.</p>
      <form id="todo-form" class="composer">
        <div><label for="todo-title">할 일</label><input id="todo-title" name="title" required placeholder="예: 견적 회신"></div>
        <div><label for="todo-note">메모</label><input id="todo-note" name="note" placeholder="어디까지 됐는지"></div>
        <div><label for="todo-date">날짜</label><input id="todo-date" name="dueDate" type="date"></div>
        <div><label for="todo-time">시간</label><input id="todo-time" name="dueTime" type="time"></div>
        <div><label for="todo-bucket">위치</label><select id="todo-bucket" name="bucket"><option value="today">오늘</option><option value="week">이번 주</option><option value="next">다음 주</option><option value="later">나중</option></select></div>
        <label class="checkline"><input name="important" type="checkbox">중요 팝업</label>
        <button class="btn primary" type="submit">등록</button>
      </form>
    </section>
    <div class="columns">${columns.map(([id, label, items]) => `<section class="column"><h3>${label} ${items.length}</h3>${items.length ? items.map(todoArticle).join("") : `<p class="empty">비어 있습니다.</p>`}</section>`).join("")}</div>
    ${desk.todos.done.length ? `<section><h2>최근 완료</h2><div class="list">${desk.todos.done.map((todo) => `<article class="todo"><b>${esc(todo.title)}</b><div class="row-actions"><button class="btn tiny" type="button" data-act="todo-status" data-id="${esc(todo.id)}" data-status="open">다시 열기</button></div></article>`).join("")}</div></section>` : ""}`;
}

function recentChanges(desk, limit) {
  const items = desk.changes.filter((change) => change.kind !== "touched").slice(0, limit);
  if (!items.length) return `<p class="empty">아직 알림이 없습니다. 시트를 처음 연결한 뒤에는 추가와 수정만 올라옵니다.</p>`;
  return items.map(changeArticle).join("");
}

function changeArticle(change) {
  const diffs = (change.diffs || []).slice(0, 4).map((diff) => `<div class="diff">${esc(diff.field)}: ${esc(diff.before || "비어 있음")} → ${esc(diff.after || "비어 있음")}</div>`).join("");
  return `<article class="change ${change.seen ? "" : "unseen"}">
    <div class="task-top"><span class="tag ${change.seen ? "" : "hot"}">${esc(change.kind)}</span><b>${esc(change.summary)}</b></div>
    <div class="meta">${esc(change.atLabel)} ${esc(change.tabName || "")} ${esc(change.assignee || "")}</div>
    ${diffs}
    ${change.seen ? "" : `<div class="row-actions"><button class="btn tiny" type="button" data-act="ack" data-id="${esc(change.id)}">확인했습니다</button>${change.key ? `<button class="btn tiny primary" type="button" data-act="focus" data-source="sheet" data-ref="${esc(change.key)}">업무 체크</button>` : ""}</div>`}
  </article>`;
}

function alertsView(desk) {
  const settings = desk.settings;
  const lead = desk.me.role === "lead";
  return `<section class="card">
      <div class="section-head">
        <div><div class="kicker">알림</div><h2>시트 변경과 기준</h2></div>
        <button class="btn" type="button" data-act="ack-all">변경 알림 모두 확인</button>
      </div>
      <p class="sub">하루 전은 ${settings.dayLeadHours}시간, 한 시간 전은 ${settings.hourLeadMinutes}분입니다. 시트에 시간이 없으면 ${esc(settings.dateOnlyTime)}을 종료 시각으로 봅니다.</p>
    </section>
    <div class="list">${recentChanges(desk, 40)}</div>
    ${lead ? `<form id="settings-form" class="card settings">
      <div><label for="day-lead">하루 전 기준 (시간)</label><input id="day-lead" name="dayLeadHours" type="number" min="1" max="168" value="${esc(settings.dayLeadHours)}"></div>
      <div><label for="hour-lead">한 시간 전 기준 (분)</label><input id="hour-lead" name="hourLeadMinutes" type="number" min="5" max="1440" value="${esc(settings.hourLeadMinutes)}"></div>
      <div><label for="date-only">날짜만 있을 때 기준 시각</label><input id="date-only" name="dateOnlyTime" type="time" value="${esc(settings.dateOnlyTime)}"></div>
      <label class="checkline"><input name="popupUrgent" type="checkbox" ${settings.popupUrgent ? "checked" : ""}>긴급 업무는 기한이 가까우면 팝업</label>
      <label class="checkline"><input name="followLatest" type="checkbox" ${settings.followLatest ? "checked" : ""}>새 주간 시트가 생기면 그 탭을 따라감</label>
      <button class="btn primary" type="submit">기준 저장</button>
    </form>` : ""}`;
}

function findTodo(desk, id) {
  return ["today", "week", "next", "later", "done"].flatMap((key) => desk.todos[key]).find((todo) => todo.id === id);
}

function dialogItem(desk, ui) {
  if (ui.focus?.source === "sheet") {
    const task = desk.tasks.find((item) => item.key === ui.focus.ref);
    if (!task) return null;
    const forced = desk.blocking.find((item) => item.source === "sheet" && item.ref === task.key);
    return {
      voluntary: !forced,
      left: forced ? desk.blocking.length : 1,
      source: "sheet",
      ref: task.key,
      label: forced?.label || "체크",
      title: task.project || task.detail || "업무",
      priority: task.priority,
      lines: [task.detail, `${task.assignee || "미배정"} · ${task.status}`, task.dueLabel, task.assumedTime ? "시트에는 날짜만 있습니다." : ""].filter(Boolean),
    };
  }
  if (ui.focus?.source === "todo") {
    const todo = findTodo(desk, ui.focus.ref);
    if (!todo) return null;
    const forced = desk.blocking.find((item) => item.source === "todo" && item.ref === todo.id);
    return {
      voluntary: !forced,
      left: forced ? desk.blocking.length : 1,
      source: "todo",
      ref: todo.id,
      label: forced?.label || "체크",
      title: todo.title,
      priority: todo.important ? "중요" : "",
      lines: [todo.note, todo.dueLabel].filter(Boolean),
    };
  }
  const item = desk.blocking[0];
  if (!item) return null;
  return { ...item, voluntary: false, left: desk.blocking.length };
}

function dialog(desk, ui) {
  const item = dialogItem(desk, ui);
  if (!item) return "";
  const reschedule = ui.panel === "reschedule";
  const isChange = item.source === "change";
  return `<div class="scrim" role="dialog" aria-modal="true">
    <div class="dialog ${item.voluntary ? "" : "block"}">
      <div class="kicker">${esc(item.label || "확인")} · ${item.left}건</div>
      <h2>${esc(item.title)}</h2>
      ${item.priority ? pri(item.priority) : ""}
      ${(item.lines || []).map((line) => `<p>${lines(line)}</p>`).join("")}
      ${isChange ? `<div class="choice">
        <button class="btn primary" type="button" data-act="ack" data-id="${esc(item.ref)}">확인했습니다</button>
        ${item.taskKey ? `<button class="btn" type="button" data-act="focus" data-source="sheet" data-ref="${esc(item.taskKey)}">이 업무 체크</button>` : ""}
      </div>` : `<div class="choice">
        <button class="btn good" type="button" data-act="dialog-done" data-source="${esc(item.source)}" data-ref="${esc(item.ref)}">완료</button>
        <button class="btn warn" type="button" data-act="check-snooze" data-source="${esc(item.source)}" data-ref="${esc(item.ref)}" data-mode="1h">1시간 뒤 재확인</button>
        <button class="btn warn" type="button" data-act="check-snooze" data-source="${esc(item.source)}" data-ref="${esc(item.ref)}" data-mode="tomorrow">내일 아침 재확인</button>
        <button class="btn" type="button" data-act="panel" data-panel="${reschedule ? "" : "reschedule"}">일정 변경</button>
        ${item.voluntary ? `<button class="btn quiet" type="button" data-act="close-focus">닫기</button>` : ""}
      </div>`}
      ${reschedule && !isChange ? `<form id="reschedule-form" class="panel" data-source="${esc(item.source)}" data-ref="${esc(item.ref)}">
        <label for="move-date">날짜</label><input id="move-date" name="date" type="date" required>
        <label for="move-time">시간</label><input id="move-time" name="time" type="time">
        <label for="move-note">이유</label><input id="move-note" name="note" placeholder="왜 바뀌는지">
        <button class="btn primary" type="submit">이 일정으로 변경</button>
      </form>` : ""}
      ${item.voluntary ? "" : `<button class="btn danger" type="button" data-act="defer">한 시간 뒤에 다시 보기</button>`}
    </div>
  </div>`;
}

export function renderLogin(ui) {
  return `<div class="login">
    <section class="login-story">
      <div><div class="kicker">DESIGN 1</div><div class="word">Lumen</div></div>
      <div>
        <p>주간 시트에 올라온 팀 업무와, 시트 밖에 적어 둔 내 할 일을 한 데스크에서 체크합니다. 추가와 수정은 알림으로, 마감 하루 전과 한 시간 전은 체크 창으로 올라옵니다.</p>
        <div class="story-grid">
          <div><strong>시트</strong><span>담당, 기한, 변경</span></div>
          <div><strong>체크</strong><span>완료, 재확인, 일정 변경</span></div>
          <div><strong>분장</strong><span>누가 얼마나 안고 있는지</span></div>
          <div><strong>내 할 일</strong><span>오늘과 다음 주, 중요 팝업</span></div>
        </div>
      </div>
      <div class="meta">2026 업무 관리 시트와 연결</div>
    </section>
    <section class="login-panel">
      <form class="card" id="login-form">
        <h1>들어가기</h1>
        <p class="sub">팀 장부를 같이 보려면 계정이 필요합니다.</p>
        <div class="stack">
          <label for="login-id">아이디</label>
          <input id="login-id" name="id" autocomplete="username" value="${esc(ui.loginId || "")}">
          <label for="login-pw">비밀번호</label>
          <input id="login-pw" name="password" type="password" autocomplete="current-password">
        </div>
        <p class="error">${esc(ui.loginError || "")}</p>
        <button class="btn primary" type="submit">들어가기</button>
        <details class="accounts">
          <summary>기본 계정</summary>
          <button type="button" data-act="fill" data-id="jh" data-pw="lumen-lead">팀장 JH · jh / lumen-lead</button>
          <button type="button" data-act="fill" data-id="de" data-pw="lumen-de">선임 DE · de / lumen-de</button>
          <button type="button" data-act="fill" data-id="gy" data-pw="lumen-gy">사원 GY · gy / lumen-gy</button>
        </details>
      </form>
    </section>
  </div>`;
}

export function renderApp(desk, ui) {
  const titles = { today: "오늘", sheet: "이번 주 시트", team: "팀 분장", mine: "내 할 일", alerts: "알림" };
  const counts = {
    today: desk.counts.reminders,
    sheet: desk.counts.open,
    team: desk.duplicates.length,
    mine: desk.counts.todosOpen,
    alerts: desk.counts.changes,
  };
  const nav = [
    ["today", "오늘"],
    ["sheet", "이번 주 시트"],
    ["team", "팀 분장"],
    ["mine", "내 할 일"],
    ["alerts", "알림"],
  ];
  const body = {
    today: todayView(desk, ui),
    sheet: sheetView(desk, ui),
    team: teamView(desk),
    mine: mineView(desk),
    alerts: alertsView(desk),
  }[ui.view] || todayView(desk, ui);
  const week = desk.me.role === "lead" && desk.sheet.tabs.length
    ? `<select id="week">${desk.sheet.tabs.map((tab) => `<option value="${esc(tab.gid)}" ${tab.current ? "selected" : ""}>${esc(tab.name)}</option>`).join("")}</select>`
    : "";
  return `<div class="shell">
    <aside class="nav">
      <div class="brand"><small>DESIGN 1</small><div class="word">Lumen</div></div>
      <div>${nav.map(([id, label]) => `<button class="nav-item ${ui.view === id ? "on" : ""}" type="button" data-act="nav" data-view="${id}"><span>${label}</span>${counts[id] ? `<span class="nav-count">${counts[id]}</span>` : ""}</button>`).join("")}</div>
      <div class="nav-foot">
        <span class="avatar">${esc(desk.me.initials)}</span>
        <span>${esc(desk.me.name)}<br><span class="meta">${esc(desk.me.title)}</span></span>
        <button class="btn quiet" type="button" data-act="logout" style="color:#f6f0e8">나가기</button>
      </div>
    </aside>
    <div class="workspace">
      <header class="chrome">
        <div class="crumbs">디자인1팀 / <b>${esc(titles[ui.view] || "오늘")}</b></div>
        ${week}
        <input id="q" class="search" placeholder="프로젝트, 담당, 요청자" value="${esc(ui.q || "")}">
        <span class="spacer"></span>
        <span class="meta"><i class="syncdot ${desk.sheet.error ? "bad" : ""}"></i> ${esc(desk.sheet.fetchedAtLabel || "연결 중")}</span>
        <button class="btn" type="button" data-act="sync">시트 새로고침</button>
        <button class="icon-btn" type="button" data-act="nav" data-view="alerts">알림 ${desk.counts.changes || ""}</button>
      </header>
      <div class="stage">
        ${desk.sheet.error ? `<div class="banner bad">${esc(desk.sheet.error)}</div>` : ""}
        ${desk.counts.changes ? `<div class="banner"><span>시트에 확인하지 않은 변경이 ${desk.counts.changes}건 있습니다.</span><button class="btn tiny" type="button" data-act="nav" data-view="alerts">보기</button></div>` : ""}
        ${body}
      </div>
    </div>
  </div>
  ${dialog(desk, ui)}
  ${ui.toast ? `<div class="toast">${esc(ui.toast)}${ui.undo ? `<button class="btn tiny" type="button" data-act="undo">되돌리기</button>` : ""}</div>` : ""}`;
}
