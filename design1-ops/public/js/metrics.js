export const CLOSED = new Set(["완료", "완료(추가)", "취소"]);
export const STATUSES = ["시작전", "대기중", "진행중", "수시체크", "추가작업", "재작업", "보류(지연)", "완료", "완료(추가)", "취소"];
export const PRIORITIES = ["긴급", "높음", "보통", "일반"];
export const PHASES = [
  { id: "think", label: "생각", hint: "접수와 범위", statuses: ["시작전", "대기중"] },
  { id: "act", label: "행동", hint: "수행", statuses: ["진행중", "수시체크", "추가작업"] },
  { id: "link", label: "연결", hint: "재작업·협업", statuses: ["재작업", "보류(지연)"] },
  { id: "close", label: "종료", hint: "산출물 확정", statuses: ["완료", "완료(추가)", "취소"] },
];

const PHASE_OF = {};
for (const phase of PHASES) {
  for (const status of phase.statuses) PHASE_OF[status] = phase.id;
}

export function phaseOf(status) {
  return PHASE_OF[status] || "act";
}

export function phaseMeta(status) {
  return PHASES.find((phase) => phase.id === phaseOf(status)) || PHASES[1];
}

export function weightOf(priority) {
  return { 긴급: 3, 높음: 2, 보통: 1, 일반: 0.5 }[priority] ?? 1;
}

export function loadWeight(task) {
  if (!isOpenStatus(task.status)) return 0;
  const base = weightOf(task.priority);
  if (task.status === "수시체크") return base * 0.4;
  if (task.status === "대기중" || task.status === "시작전") return base * 0.5;
  return base;
}

export function isOpenStatus(status) {
  return !CLOSED.has(status);
}

export function snapOf(task, weekId) {
  return task.snapshots.find((snap) => snap.weekId === weekId) || null;
}

export function present(task, weekId) {
  const snap = snapOf(task, weekId);
  if (!snap) {
    return {
      ...task,
      onBoard: false,
      workTypes: task.workTypes || [],
    };
  }
  return {
    ...task,
    onBoard: true,
    status: snap.status || task.status,
    priority: snap.priority || task.priority,
    progress: snap.progress,
    assignee: snap.assignee || task.assignee || "",
    due: snap.due || task.due || "",
    progressNote: snap.progressNote || "",
    dept: snap.dept || task.dept,
    workTypes: snap.workTypes?.length ? snap.workTypes : (task.workTypes || []),
  };
}

export function tasksOnWeek(tasks, weekId) {
  return tasks.filter((task) => task.snapshots.some((snap) => snap.weekId === weekId));
}

export function isStalled(task, weekId, weeks) {
  const index = weeks.findIndex((week) => week.id === weekId);
  if (index < 0) return false;
  const visible = new Set(weeks.slice(0, index + 1).map((week) => week.id));
  const snaps = task.snapshots.filter((snap) => visible.has(snap.weekId));
  if (snaps.length < 4) return false;
  const tail = snaps.slice(-4);
  const latest = tail[tail.length - 1];
  if (!["진행중", "대기중", "수시체크", "보류(지연)"].includes(latest.status)) return false;
  return tail.every((snap) => snap.status === tail[0].status && snap.progress === tail[0].progress);
}

export function collapseSnapshots(task, weeks) {
  const byId = new Map(weeks.map((week) => [week.id, week]));
  const ordered = [...task.snapshots].sort((a, b) => (byId.get(a.weekId)?.index || 0) - (byId.get(b.weekId)?.index || 0));
  const groups = [];
  for (const snap of ordered) {
    const prev = groups[groups.length - 1];
    const same = prev
      && prev.status === snap.status
      && prev.progress === snap.progress
      && prev.priority === snap.priority
      && (prev.progressNote || "") === (snap.progressNote || "");
    if (same) {
      prev.endWeekId = snap.weekId;
      prev.count += 1;
    } else {
      groups.push({ ...snap, endWeekId: snap.weekId, count: 1 });
    }
  }
  return groups;
}

export function periodStats(tasks, weeks) {
  const ids = new Set(weeks.map((week) => week.id));
  const byDept = {};
  const byPerson = {};
  const byType = {};
  const byPriority = { 긴급: 0, 높음: 0, 보통: 0, 일반: 0 };
  const unique = new Set();
  const uniqueDone = new Set();
  let slots = 0;
  let done = 0;
  let rework = 0;
  let open = 0;

  const ensurePerson = (name) => {
    if (!byPerson[name]) {
      byPerson[name] = { slots: 0, done: 0, open: 0, rework: 0, 긴급: 0, 높음: 0, 보통: 0, 일반: 0 };
    }
    return byPerson[name];
  };

  for (const task of tasks) {
    for (const snap of task.snapshots) {
      if (!ids.has(snap.weekId)) continue;
      slots += 1;
      unique.add(task.id);
      const dept = snap.dept || "미지정";
      const person = snap.assignee || "미배정";
      byDept[dept] = byDept[dept] || { slots: 0, done: 0 };
      byDept[dept].slots += 1;
      const row = ensurePerson(person);
      row.slots += 1;
      if (byPriority[snap.priority] != null) {
        byPriority[snap.priority] += 1;
        row[snap.priority] += 1;
      }
      if (snap.status === "완료" || snap.status === "완료(추가)") {
        done += 1;
        byDept[dept].done += 1;
        row.done += 1;
        uniqueDone.add(task.id);
      } else if (snap.status !== "취소") {
        open += 1;
        row.open += 1;
      }
      if (snap.status === "재작업") {
        rework += 1;
        row.rework += 1;
      }
      for (const type of snap.workTypes || []) {
        byType[type] = (byType[type] || 0) + 1;
      }
    }
  }

  return {
    slots,
    done,
    rework,
    open,
    unique: unique.size,
    uniqueDone: uniqueDone.size,
    byDept,
    byPerson,
    byType,
    byPriority,
    rate: slots ? done / slots : 0,
  };
}

export function buildNarrative(label, stats, stalledCount) {
  const rate = Math.round(stats.rate * 1000) / 10;
  const dept = Object.entries(stats.byDept).sort((a, b) => b[1].slots - a[1].slots)[0];
  const people = Object.entries(stats.byPerson)
    .filter(([name]) => name && name !== "미배정")
    .sort((a, b) => b[1].done - a[1].done);
  const lines = [
    `${label} 디자인1팀 보드에는 ${stats.slots}줄이 올랐고, 완료 ${stats.done}줄, 슬롯 완료율 ${rate}%입니다.`,
    `고유 업무는 ${stats.unique}건이며, 이 중 완료로 표시된 업무는 ${stats.uniqueDone}건입니다.`,
  ];
  if (dept) lines.push(`요청이 가장 많은 곳은 ${dept[0]}이며 ${dept[1].slots}줄입니다.`);
  if (people[0]) lines.push(`완료 슬롯이 가장 많은 담당은 ${people[0][0]}이며 ${people[0][1].done}줄입니다.`);
  if (stats.rework) lines.push(`재작업으로 표시된 줄은 ${stats.rework}줄입니다.`);
  if (stalledCount) lines.push(`진도가 4주 이상 같은 정체 업무는 ${stalledCount}건입니다. 계속, 보류, 종료 중 하나를 정하면 보드가 닫힙니다.`);
  return lines.join(" ");
}

export function validateDraft(draft, { creating }) {
  const errors = [];
  if (!String(draft.project || "").trim()) errors.push("프로젝트명을 입력하세요.");
  if (!String(draft.summary || "").trim()) errors.push("진행 내용을 입력하세요.");
  if (!draft.dept) errors.push("요청 부서를 선택하세요.");
  if (!String(draft.requester || "").trim()) errors.push("요청자를 입력하세요.");
  if (!draft.workTypes?.length) errors.push("작업 유형을 하나 이상 선택하세요.");
  if (creating && !draft.due) errors.push("종료 예정일을 입력하세요.");
  if (["진행중", "재작업", "추가작업", "완료", "완료(추가)"].includes(draft.status) && !draft.assignee) {
    errors.push("수행 담당을 지정하세요.");
  }
  if ((draft.status === "완료" || draft.status === "완료(추가)") && !String(draft.deliverable || "").trim()) {
    errors.push("종료하려면 산출물을 한 줄 남기세요.");
  }
  if (draft.progress != null && draft.progress !== "" && (Number(draft.progress) < 0 || Number(draft.progress) > 100)) {
    errors.push("진도율은 0에서 100 사이입니다.");
  }
  return errors;
}
