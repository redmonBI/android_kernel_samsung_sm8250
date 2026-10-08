import assert from "node:assert/strict";
import test from "node:test";
import { applyLive, buildLive, ingestRows } from "../public/js/sheet/ledger-sync.js";

const NOW = new Date("2026-10-08T09:00:00+09:00");
const LEAD = { id: "jh", initials: "JH", role: "lead", name: "JH" };

function ledger() {
  return {
    weeks: [{
      id: "2026-0928",
      label: "09.28–10.02",
      start: "2026-09-28",
      end: "2026-10-02",
      month: 9,
      year: 2026,
      index: 1,
    }],
    tasks: [{
      id: "old",
      project: "알래스카",
      summary: "조도",
      assignee: "GY",
      status: "진행중",
      priority: "높음",
      due: "",
      progress: null,
      dept: "영업",
      requester: "",
      workTypes: [],
      snapshots: [{
        weekId: "2026-0928",
        status: "진행중",
        priority: "높음",
        assignee: "GY",
        due: "",
        progress: null,
        progressNote: "",
        dept: "영업",
        workTypes: [],
      }],
      logs: [],
    }],
    users: [LEAD],
    sheetRevision: 0,
  };
}

function row(partial = {}) {
  return {
    key: "row1",
    status: "진행중",
    priority: "긴급",
    dept: "영업1-3팀",
    requester: "이동준 차장",
    assignee: "GY",
    workType: "조도(검토)",
    project: "알래스카",
    detail: "조도 검토",
    start: "2026.10.07",
    dueRaw: "2026.10.08",
    progress: "",
    registeredAt: "2026-10-07 16:40",
    updatedAt: "2026-10-07 16:40",
    progressNote: "",
    requestNote: "",
    memo: "",
    ...partial,
  };
}

const meta = { gid: "514547906", tabName: "업무 체크 리스트(10.06-10.08)", at: NOW.toISOString() };

test("the first sheet pull opens the current week without marking every row as new", () => {
  const state = ledger();
  const result = ingestRows(state, [row()], meta);
  assert.equal(result.week.id, "2026-1006");
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].id, "old");
  assert.equal(state.tasks[0].due, "2026-10-08");
  assert.equal(state.tasks[0].priority, "긴급");
  assert.ok(state.tasks[0].snapshots.some((snap) => snap.weekId === "2026-1006"));
  assert.deepEqual(result.changes.map((change) => change.kind).sort(), ["connected", "new-tab"]);
});

test("a later sheet edit is an alert, and a desk date change is kept", () => {
  const state = ledger();
  ingestRows(state, [row()], meta);
  const edited = ingestRows(state, [row({ status: "대기중" })], { ...meta, at: "2026-10-08T01:00:00.000Z" });
  assert.equal(edited.changes.some((change) => change.kind === "updated"), true);
  assert.equal(state.tasks[0].status, "대기중");
  applyLive(state, LEAD, { type: "check", action: "reschedule", id: "old", date: "2026-10-16", time: "15:00" }, NOW);
  ingestRows(state, [row({ status: "대기중", dueRaw: "2026.10.08" })], { ...meta, at: "2026-10-08T02:00:00.000Z" });
  assert.equal(state.tasks[0].due, "2026-10-16");
  assert.equal(state.tasks[0].dueTime, "15:00");
});

test("urgent work due today blocks inside the existing ledger", () => {
  const state = ledger();
  ingestRows(state, [row()], meta);
  const live = buildLive(state, LEAD, NOW);
  assert.equal(live.weekId, "2026-1006");
  assert.equal(live.blocking.some((item) => item.title === "알래스카"), true);
  assert.equal(live.reminders[0].reminderLabel, "오늘 마감");
});

test("marking a personal todo important blocks, and moving it to next week clears today", () => {
  const state = ledger();
  ingestRows(state, [row({ priority: "보통", dueRaw: "2026.11.01" })], meta);
  applyLive(state, LEAD, { type: "todo", action: "create", title: "견적 회신", bucket: "today", important: true }, NOW);
  let live = buildLive(state, LEAD, NOW);
  assert.equal(live.blocking.some((item) => item.title === "견적 회신"), true);
  const todo = state.todos.find((item) => item.title === "견적 회신");
  applyLive(state, LEAD, { type: "todo", action: "move", id: todo.id, bucket: "next" }, NOW);
  live = buildLive(state, LEAD, NOW);
  assert.equal(live.todos.today.some((item) => item.title === "견적 회신"), false);
  assert.equal(live.todos.next.some((item) => item.title === "견적 회신"), true);
});
