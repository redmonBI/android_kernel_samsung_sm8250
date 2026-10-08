import { renderApp, renderLogin } from "./render.js";

const app = document.querySelector("#app");
const views = ["today", "sheet", "team", "mine", "alerts"];
let token = sessionStorage.getItem("lumen-desk-token") || "";
let desk = null;
let ui = freshUi();

function freshUi() {
  const view = location.hash.replace("#/", "");
  return {
    view: views.includes(view) ? view : "today",
    q: "",
    status: "",
    priority: "",
    assignee: "",
    due: "",
    selected: "",
    panel: "",
    focus: null,
    loginId: "",
    loginError: "",
    toast: "",
    undo: null,
  };
}

function site(path) {
  return new URL(String(path).replace(/^\//, ""), document.baseURI);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(site(path), { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") {
    logout();
    throw new Error(data.error || "로그인이 필요합니다.");
  }
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function render() {
  const active = document.activeElement;
  const keep = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ? active.id : "";
  const pos = keep && active.selectionStart;
  app.innerHTML = desk ? renderApp(desk, ui) : renderLogin(ui);
  if (!keep) return;
  const next = document.getElementById(keep);
  if (!next) return;
  next.focus();
  if (typeof pos === "number" && next.setSelectionRange) {
    try { next.setSelectionRange(pos, pos); } catch { /* date inputs */ }
  }
}

function toast(message) {
  ui.toast = message;
  render();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    ui.toast = "";
    ui.undo = null;
    render();
  }, 2600);
}

function logout() {
  token = "";
  desk = null;
  sessionStorage.removeItem("lumen-desk-token");
  ui = freshUi();
  render();
}

async function refresh() {
  const prev = desk?.counts?.changes ?? 0;
  desk = await api("/api/desk");
  if (desk.counts.changes > prev) toast("시트에 새 변경이 있습니다.");
  if (ui.focus) {
    const alive = ui.focus.source === "sheet"
      ? desk.tasks.some((task) => task.key === ui.focus.ref)
      : ["today", "week", "next", "later", "done"].some((key) => desk.todos[key].some((todo) => todo.id === ui.focus.ref));
    if (!alive) ui.focus = null;
  }
  render();
}

async function act(body) {
  const data = await api("/api/act", { method: "POST", body: JSON.stringify(body) });
  desk = data.desk;
  if (data.deleted) ui.undo = data.deleted;
  render();
  return data;
}

async function login(id, password) {
  ui.loginError = "";
  ui.loginId = id;
  try {
    const result = await api("/api/login", { method: "POST", body: JSON.stringify({ id, password }) });
    token = result.token;
    sessionStorage.setItem("lumen-desk-token", token);
    location.hash = "#/today";
    await refresh();
  } catch (error) {
    ui.loginError = error.message;
    render();
  }
}

function go(view) {
  ui.view = view;
  location.hash = `#/${view}`;
  render();
}

document.body.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-act]");
  if (!el) return;
  const actName = el.dataset.act;
  try {
    if (actName === "fill") {
      ui.loginId = el.dataset.id;
      const password = document.querySelector("#login-pw");
      const id = document.querySelector("#login-id");
      if (id) id.value = el.dataset.id;
      if (password) password.value = el.dataset.pw;
      return;
    }
    if (actName === "nav") return go(el.dataset.view);
    if (actName === "logout") return logout();
    if (actName === "sync") {
      await act({ type: "sync" });
      toast("시트를 다시 받았습니다.");
      return;
    }
    if (actName === "select") {
      ui.selected = el.dataset.key;
      ui.view = "sheet";
      location.hash = "#/sheet";
      render();
      return;
    }
    if (actName === "focus") {
      ui.focus = { source: el.dataset.source, ref: el.dataset.ref };
      ui.panel = "";
      render();
      return;
    }
    if (actName === "close-focus") {
      ui.focus = null;
      ui.panel = "";
      render();
      return;
    }
    if (actName === "panel") {
      ui.panel = ui.panel === "reschedule" ? "" : "reschedule";
      if (el.dataset.ref) ui.focus = { source: el.dataset.source || ui.focus?.source || "sheet", ref: el.dataset.ref };
      render();
      return;
    }
    if (actName === "defer") {
      ui.focus = null;
      ui.panel = "";
      await act({ type: "defer" });
      toast("한 시간 뒤에 다시 띄웁니다.");
      return;
    }
    if (actName === "ack") {
      await act({ type: "ack", id: el.dataset.id });
      if (ui.focus?.source === "change") ui.focus = null;
      return;
    }
    if (actName === "ack-all") {
      await act({ type: "ack", all: true });
      toast("변경 알림을 확인했습니다.");
      return;
    }
    if (actName === "dialog-done" || actName === "check-done") {
      const source = el.dataset.source || "sheet";
      const ref = el.dataset.ref || el.dataset.key;
      if (source === "todo") await act({ type: "todo", action: "status", id: ref, status: "done" });
      else await act({ type: "check", action: "done", key: ref });
      ui.focus = null;
      ui.panel = "";
      toast("완료로 표시했습니다. 시트 상태도 완료로 고쳐 주세요.");
      return;
    }
    if (actName === "check-snooze") {
      const source = el.dataset.source;
      const ref = el.dataset.ref;
      if (source === "todo") await act({ type: "todo", action: "snooze", id: ref, mode: el.dataset.mode });
      else await act({ type: "check", action: "snooze", key: ref, mode: el.dataset.mode });
      ui.focus = null;
      ui.panel = "";
      toast("재확인할 시간을 잡아 두었습니다.");
      return;
    }
    if (actName === "flag") {
      await act({ type: "check", action: "flag", key: el.dataset.key, important: el.dataset.important === "1" });
      return;
    }
    if (actName === "reopen") {
      await act({ type: "check", action: "reopen", key: el.dataset.key });
      return;
    }
    if (actName === "todo-status") {
      await act({ type: "todo", action: "status", id: el.dataset.id, status: el.dataset.status });
      return;
    }
    if (actName === "todo-move") {
      await act({ type: "todo", action: "move", id: el.dataset.id, bucket: el.dataset.bucket });
      toast(el.dataset.bucket === "next" ? "다음 주로 넘겼습니다." : "옮겼습니다.");
      return;
    }
    if (actName === "todo-flag") {
      await act({ type: "todo", action: "flag", id: el.dataset.id, important: el.dataset.important === "1" });
      return;
    }
    if (actName === "todo-delete") {
      const data = await act({ type: "todo", action: "delete", id: el.dataset.id });
      ui.undo = data.deleted;
      toast("할 일을 삭제했습니다.");
      return;
    }
    if (actName === "undo" && ui.undo) {
      const todo = ui.undo;
      ui.undo = null;
      await act({ type: "todo", action: "restore", todo });
      toast("되돌렸습니다.");
      return;
    }
    if (actName === "copy") {
      const text = decodeURIComponent(el.dataset.copy || "");
      try {
        await navigator.clipboard.writeText(text);
        toast("복사했습니다.");
      } catch {
        toast(text);
      }
    }
  } catch (error) {
    toast(error.message);
  }
});

document.body.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    if (form.id === "login-form") {
      await login(String(data.get("id") || ""), String(data.get("password") || ""));
      return;
    }
    if (form.id === "todo-form") {
      await act({
        type: "todo",
        action: "create",
        title: data.get("title"),
        note: data.get("note"),
        dueDate: data.get("dueDate"),
        dueTime: data.get("dueTime"),
        bucket: data.get("bucket"),
        important: data.get("important") === "on",
      });
      toast("할 일을 등록했습니다.");
      return;
    }
    if (form.id === "reschedule-form") {
      const payload = {
        date: data.get("date"),
        time: data.get("time"),
        note: data.get("note"),
      };
      if (form.dataset.source === "todo") {
        await act({ type: "todo", action: "reschedule", id: form.dataset.ref, ...payload, dueTime: payload.time });
      } else {
        await act({ type: "check", action: "reschedule", key: form.dataset.ref, ...payload });
      }
      ui.focus = null;
      ui.panel = "";
      toast("일정을 바꿨습니다. 시트에도 같은 날짜를 적어 주세요.");
      return;
    }
    if (form.id === "settings-form") {
      await act({
        type: "settings",
        dayLeadHours: Number(data.get("dayLeadHours")),
        hourLeadMinutes: Number(data.get("hourLeadMinutes")),
        dateOnlyTime: data.get("dateOnlyTime"),
        popupUrgent: data.get("popupUrgent") === "on",
        followLatest: data.get("followLatest") === "on",
      });
      toast("기준을 저장했습니다.");
    }
  } catch (error) {
    if (form.id === "login-form") {
      ui.loginError = error.message;
      render();
    } else {
      toast(error.message);
    }
  }
});

document.body.addEventListener("input", (event) => {
  if (event.target.id !== "q") return;
  ui.q = event.target.value;
  render();
});

document.body.addEventListener("change", async (event) => {
  const id = event.target.id;
  if (id === "filter-status") ui.status = event.target.value;
  else if (id === "filter-priority") ui.priority = event.target.value;
  else if (id === "filter-assignee") ui.assignee = event.target.value;
  else if (id === "filter-due") ui.due = event.target.value;
  else if (id === "week") {
    try {
      await act({ type: "watch", gid: event.target.value, followLatest: false });
      toast("보는 주간 시트를 바꿨습니다.");
    } catch (error) {
      toast(error.message);
    }
    return;
  } else return;
  render();
});

window.addEventListener("hashchange", () => {
  const view = location.hash.replace("#/", "");
  if (!views.includes(view) || !desk) return;
  ui.view = view;
  render();
});

setInterval(() => {
  if (!token || !desk) return;
  if (desk.blocking.length || ui.focus || ui.panel) return;
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA"].includes(active.tagName)) return;
  refresh().catch(() => {});
}, 12000);

if (token) refresh().catch(() => logout());
else render();
