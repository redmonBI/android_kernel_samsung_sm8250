import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  buildDesk,
  diffRows,
  freshState,
  latestChecklist,
  parseCsv,
  parseDue,
  parseSheet,
  weekScore,
} from "../public/js/sheet/domain.js";

const NOW = new Date("2026-10-08T09:00:00+09:00");

function row(partial) {
  return {
    status: "진행중",
    priority: "보통",
    dept: "영업1팀",
    requester: "김요청",
    assignee: "GY",
    workType: "조도(검토)",
    project: "샘플 현장",
    detail: "조도 검토",
    start: "2026.10.01",
    dueRaw: "2026.10.20",
    progress: "",
    registeredAt: "2026-10-01 09:00",
    updatedAt: "2026-10-01 09:00",
    progressNote: "",
    requestNote: "",
    memo: "",
    ...partial,
  };
}

test("parses quoted commas and the live header shape", () => {
  const csv = [
    "상태,우선순위,요청 부서,요청자,작업자,작업내역,프로젝트명,진행 내용,시작일,종료(예정),진도율,등록일,2026-10-06 11:15,진행 사항,요청&개선 사항,비고",
    "진행중,긴급,영업1-3팀,이동준 차장,GY,조도(검토),알래스카,\"조도 검토, 현장\",2026.10.07,2026.10.08,,2026-10-07 16:40,2026-10-07 16:40,,",
  ].join("\n");
  const parsed = parseSheet(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].project, "알래스카");
  assert.equal(parsed.rows[0].detail, "조도 검토, 현장");
  assert.equal(parsed.rows[0].priority, "긴급");
  assert.equal(parsed.rows[0].dueRaw, "2026.10.08");
  assert.equal(parsed.rows[0].updatedAt, "2026-10-07 16:40");
});

test("parses the date formats used on the weekly sheet", () => {
  const samples = ["2026. 10. 16", "2026.10.07", "2026-09-30", "2026. 1. 1", "2026.09.14"];
  for (const sample of samples) {
    const parsed = parseDue(sample, "18:00");
    assert.ok(parsed, sample);
    assert.equal(parsed.assumedTime, true);
    assert.equal(parsed.hour, 18);
  }
  assert.equal(parseDue("-", "18:00"), null);
  assert.equal(parseDue("", "18:00"), null);
  const timed = parseDue("2026-10-08 14:30", "18:00");
  assert.equal(timed.hasTime, true);
  assert.equal(timed.hour, 14);
  assert.equal(timed.minute, 30);
  assert.equal(timed.instant.toISOString(), "2026-10-08T05:30:00.000Z");
});

test("picks the latest checklist tab, including a year wrap", () => {
  const tabs = [
    { gid: "1", name: "업무 체크 리스트(09.28-10.02)" },
    { gid: "2", name: "업무 체크 리스트(10.06-10.08)" },
    { gid: "3", name: "🏆 팀 성취 대시보드" },
    { gid: "4", name: "업무 체크 리스트(12.29-01.02)" },
  ];
  assert.equal(latestChecklist(tabs, 2026).gid, "4");
  assert.ok(weekScore("업무 체크 리스트(12.29-01.02)", 2026) > weekScore("업무 체크 리스트(10.06-10.08)", 2026));
});

test("diffs additions, edits, removals, and timestamp-only touches", () => {
  const before = parseSheet([
    "상태,프로젝트명,작업자,진행 내용,종료(예정),등록일,2026-10-01 09:00",
    "진행중,호텔,DE,스펙서,2026.10.20,2026-10-01 09:00,2026-10-01 09:00",
  ].join("\n")).rows;
  const after = parseSheet([
    "상태,프로젝트명,작업자,진행 내용,종료(예정),등록일,2026-10-02 09:00",
    "완료,호텔,DE,스펙서,2026.10.20,2026-10-01 09:00,2026-10-02 09:00",
    "시작전,카페,GY,조도,2026.10.08,2026-10-02 10:00,2026-10-02 10:00",
  ].join("\n")).rows;
  let n = 0;
  const diff = diffRows(before, after, { gid: "1", tabName: "이번 주", at: NOW.toISOString(), id: () => `c${n += 1}` });
  assert.deepEqual(diff.changes.map((change) => change.kind).sort(), ["added", "updated"]);
  const edited = diff.changes.find((change) => change.kind === "updated");
  assert.equal(edited.diffs[0].field, "상태");
  assert.equal(edited.diffs[0].after, "완료");

  const touchedOnly = after.map((item) => (item.project === "호텔" ? { ...item, updatedAt: "2026-10-03 09:00" } : item));
  const touch = diffRows(after, touchedOnly, { gid: "1", tabName: "이번 주", at: NOW.toISOString(), id: () => "t" });
  assert.equal(touch.changes.length, 1);
  assert.equal(touch.changes[0].kind, "touched");

  const removed = diffRows(after, after.filter((item) => item.project !== "카페"), {
    gid: "1", tabName: "이번 주", at: NOW.toISOString(), id: () => "r",
  });
  assert.equal(removed.changes.some((change) => change.kind === "removed"), true);
});

test("first snapshot does not pretend every row was added", () => {
  const rows = parseSheet("상태,프로젝트명\n진행중,호텔").rows;
  const diff = diffRows(null, rows, { gid: "1", tabName: "", at: NOW.toISOString(), id: () => "x" });
  assert.equal(diff.initial, true);
  assert.equal(diff.changes.length, 0);
});

test("urgent work inside the day window blocks, and a finished row does not", () => {
  const state = freshState();
  const parsed = parseSheet([
    "상태,우선순위,작업자,프로젝트명,진행 내용,종료(예정),등록일",
    "진행중,긴급,GY,알래스카,조도 검토,2026.10.08,2026-10-07 16:40",
    "진행중,보통,DE,도서관,설계,2026.10.20,2026-10-01 09:00",
    "완료,긴급,GY,폴햄,조도 검토,2026.10.08,2026-10-07 09:11",
    "진행중,높음,JH,파나크,미팅,2026.10.07,2026-10-01 09:01",
  ].join("\n"));
  state.sheet.rows = parsed.rows;
  state.sheet.gid = "514547906";
  state.sheet.tabName = "업무 체크 리스트(10.06-10.08)";
  const desk = buildDesk(state, state.users[0], NOW);
  const titles = desk.blocking.filter((item) => item.source === "sheet").map((item) => item.title);
  assert.ok(titles.includes("알래스카"));
  assert.ok(titles.includes("파나크"));
  assert.equal(titles.includes("도서관"), false);
  assert.equal(titles.includes("폴햄"), false);
  assert.ok(desk.reminders.some((task) => task.project === "도서관") === false);
  assert.equal(desk.workload.find((item) => item.name === "GY").urgent, 1);
});

test("an hour window blocks any priority, and snooze hides it", () => {
  const state = freshState();
  state.sheet.rows = parseSheet([
    "상태,우선순위,작업자,프로젝트명,진행 내용,종료(예정),등록일",
    "진행중,일반,DE,카페,스펙,2026-10-08 09:30,2026-10-08 08:00",
  ].join("\n")).rows;
  const lead = state.users[0];
  let desk = buildDesk(state, lead, NOW);
  assert.equal(desk.blocking[0].kind, "hour");
  applyAction(state, lead, { type: "check", key: state.sheet.rows[0].key, action: "snooze", mode: "1h" }, NOW);
  desk = buildDesk(state, lead, NOW);
  assert.equal(desk.blocking.length, 0);
  assert.equal(desk.reminders.length, 0);
  desk = buildDesk(state, lead, new Date(NOW.getTime() + 2 * 3600000));
  assert.equal(desk.reminders[0].reminderKind, "overdue");
  assert.equal(desk.blocking.length, 0);
});

test("reschedule replaces the sheet date until the sheet catches up", () => {
  const state = freshState();
  state.sheet.rows = parseSheet([
    "상태,우선순위,작업자,프로젝트명,진행 내용,종료(예정),등록일",
    "진행중,높음,JH,쇼룸,리뉴얼,2026.10.08,2026-04-06 19:28",
  ].join("\n")).rows;
  const key = state.sheet.rows[0].key;
  applyAction(state, state.users[0], {
    type: "check", key, action: "reschedule", date: "2026-10-16", time: "15:00", note: "시공 일정 변경",
  }, NOW);
  const desk = buildDesk(state, state.users[0], NOW);
  const task = desk.tasks.find((item) => item.key === key);
  assert.equal(task.overrideDue, "2026-10-16 15:00");
  assert.equal(task.reminderKind, "");
  assert.match(task.dueLabel, /16일/);
});

test("duplicate projects and personal todos stay in the right week", () => {
  const state = freshState();
  state.sheet.rows = parseSheet([
    "상태,우선순위,작업자,프로젝트명,진행 내용,종료(예정),등록일",
    "진행중,높음,JH,쇼룸,1차,2026.11.01,2026-04-06 19:28",
    "시작전,보통,DE,쇼룸,2차,2026.11.02,2026-04-06 19:29",
    "완료,보통,GY,쇼룸,끝난 줄,2026.09.01,2026-04-06 19:30",
  ].join("\n")).rows;
  const lead = state.users[0];
  applyAction(state, lead, { type: "todo", action: "create", title: "견적 회신", bucket: "today", important: true }, NOW);
  applyAction(state, lead, { type: "todo", action: "create", title: "다음 주 회의", bucket: "next" }, NOW);
  let desk = buildDesk(state, lead, NOW);
  assert.equal(desk.duplicates.length, 1);
  assert.equal(desk.duplicates[0].rows.length, 2);
  assert.equal(desk.todos.today.some((todo) => todo.title === "견적 회신"), true);
  assert.equal(desk.todos.next.some((todo) => todo.title === "다음 주 회의"), true);
  assert.equal(desk.blocking.some((item) => item.title === "견적 회신"), true);
  const todo = state.todos.find((item) => item.title === "견적 회신");
  applyAction(state, lead, { type: "todo", action: "move", id: todo.id, bucket: "next" }, NOW);
  desk = buildDesk(state, lead, NOW);
  assert.equal(desk.todos.today.some((item) => item.title === "견적 회신"), false);
  assert.equal(desk.todos.next.some((item) => item.title === "견적 회신"), true);
});

test("csv keeps multiline cells", () => {
  const rows = parseCsv('상태,진행 사항\n진행중,"1차 완료\n2차 예정"');
  assert.equal(rows[1][1], "1차 완료\n2차 예정");
});
