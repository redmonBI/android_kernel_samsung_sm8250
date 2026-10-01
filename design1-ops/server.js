const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const SEED = path.join(DATA, "seed.json");
const STATE = path.join(DATA, "state.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";

const sessions = new Map();
let queue = Promise.resolve();

function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ensureState() {
  if (!fs.existsSync(STATE)) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.copyFileSync(SEED, STATE);
  }
  return readJson(STATE);
}

function writeState(data) {
  const tmp = `${STATE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, STATE);
}

function publicState(state, actor) {
  const { password, ...sessionUser } = actor || {};
  return {
    ...state,
    users: state.users.map(({ password: secret, ...user }) => user),
    sessionUser,
  };
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12_000_000) {
        reject(new Error("요청이 너무 큽니다."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function actorFrom(req, state) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const userId = sessions.get(token);
  if (!userId) return null;
  return state.users.find((user) => user.id === userId) || null;
}

function mergeUsers(current, incoming, actor) {
  if (!Array.isArray(incoming)) return current;
  const merged = [];
  for (const item of incoming) {
    if (!item || !item.id || merged.some((user) => user.id === item.id)) continue;
    const prev = current.find((user) => user.id === item.id);
    if (prev) {
      merged.push({
        ...prev,
        name: item.name || prev.name,
        title: item.title || prev.title,
        dept: item.dept || prev.dept,
        initials: item.initials || prev.initials,
        role: item.id === actor.id ? "lead" : (item.role || prev.role),
      });
    } else if (item.password && /^[a-z0-9]{2,16}$/.test(item.id)) {
      merged.push({
        id: item.id,
        password: String(item.password),
        name: item.name || item.id,
        title: item.title || "",
        dept: item.dept || "",
        initials: (item.initials || item.id.slice(0, 2)).toUpperCase(),
        role: item.role || "designer",
      });
    }
  }
  for (const user of current) {
    if (!merged.some((item) => item.id === user.id)) merged.push(user);
  }
  return merged;
}

function sanitize(current, incoming, actor) {
  const next = {
    meta: current.meta,
    users: current.users,
    departments: current.departments,
    requesters: current.requesters,
    workTypes: current.workTypes,
    weeks: current.weeks,
    tasks: current.tasks,
    rituals: current.rituals || {},
    settings: current.settings,
    audit: Array.isArray(current.audit) ? current.audit : [],
  };

  if (actor.role === "executive") return current;

  if (actor.role === "lead") {
    next.weeks = Array.isArray(incoming.weeks) ? incoming.weeks : current.weeks;
    next.tasks = Array.isArray(incoming.tasks) ? incoming.tasks : current.tasks;
    next.rituals = incoming.rituals || {};
    next.settings = incoming.settings || current.settings;
    next.requesters = Array.isArray(incoming.requesters) ? incoming.requesters : current.requesters;
    next.departments = Array.isArray(incoming.departments) ? incoming.departments : current.departments;
    next.workTypes = Array.isArray(incoming.workTypes) ? incoming.workTypes : current.workTypes;
    next.users = mergeUsers(current.users, incoming.users, actor);
    next.audit = Array.isArray(incoming.audit) ? incoming.audit.slice(-400) : current.audit;
    return next;
  }

  const previous = new Map(current.tasks.map((task) => [task.id, task]));
  const incomingTasks = Array.isArray(incoming.tasks) ? incoming.tasks : current.tasks;
  const kept = incomingTasks.map((task) => {
    const prev = previous.get(task.id);
    if (!prev) {
      if (actor.role === "requester") {
        return {
          ...task,
          assignee: "",
          status: "시작전",
          createdBy: actor.id,
          snapshots: (task.snapshots || []).map((snap) => ({ ...snap, assignee: "", status: "시작전" })),
        };
      }
      const assignee = task.assignee && task.assignee !== actor.initials ? actor.initials : (task.assignee || actor.initials);
      return {
        ...task,
        assignee,
        createdBy: actor.id,
        snapshots: (task.snapshots || []).map((snap) => ({ ...snap, assignee })),
      };
    }
    const owns = actor.role === "designer" && prev.assignee === actor.initials;
    const ownRequest = actor.role === "requester" && prev.createdBy === actor.id && prev.status === "시작전";
    if (ownRequest) {
      return {
        ...prev,
        ...task,
        id: prev.id,
        createdBy: prev.createdBy,
        status: "시작전",
        assignee: "",
        snapshots: (task.snapshots || prev.snapshots).map((snap) => ({ ...snap, status: "시작전", assignee: "" })),
      };
    }
    if (owns) {
      const merged = { ...prev, ...task, id: prev.id, assignee: prev.assignee, createdBy: prev.createdBy || actor.id };
      merged.snapshots = (merged.snapshots || []).map((snap) => ({ ...snap, assignee: prev.assignee }));
      return merged;
    }
    return prev;
  });
  const seen = new Set(kept.map((task) => task.id));
  for (const task of current.tasks) {
    if (!seen.has(task.id)) kept.push(task);
  }
  next.tasks = kept;
  if (Array.isArray(incoming.audit)) next.audit = incoming.audit.slice(-400);
  return next;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  enqueue(async () => {
    try {
      if (url.pathname === "/api/health" && req.method === "GET") {
        return send(res, 200, JSON.stringify({ ok: true, name: "LUMEN" }));
      }

      if (url.pathname === "/api/login" && req.method === "POST") {
        const body = await readBody(req);
        const state = ensureState();
        const user = state.users.find((item) => item.id === String(body.id || "").trim() && item.password === String(body.password || ""));
        if (!user) return send(res, 401, JSON.stringify({ error: "아이디 또는 비밀번호를 확인하세요." }));
        const token = crypto.randomBytes(24).toString("hex");
        sessions.set(token, user.id);
        const pub = { ...user };
        delete pub.password;
        return send(res, 200, JSON.stringify({ token, user: pub }));
      }

      if (url.pathname === "/api/password" && req.method === "POST") {
        const state = ensureState();
        const actor = actorFrom(req, state);
        if (!actor) return send(res, 401, JSON.stringify({ error: "로그인이 필요합니다." }));
        const body = await readBody(req);
        if (actor.password !== String(body.current || "")) {
          return send(res, 400, JSON.stringify({ error: "현재 비밀번호가 맞지 않습니다." }));
        }
        const nextPassword = String(body.next || "");
        if (nextPassword.length < 6) return send(res, 400, JSON.stringify({ error: "새 비밀번호는 6자 이상으로 정하세요." }));
        actor.password = nextPassword;
        writeState(state);
        return send(res, 200, JSON.stringify({ ok: true }));
      }

      if (url.pathname === "/api/reset" && req.method === "POST") {
        const state = ensureState();
        const actor = actorFrom(req, state);
        if (!actor || actor.role !== "lead") return send(res, 403, JSON.stringify({ error: "팀장만 원장을 되돌릴 수 있습니다." }));
        const seed = readJson(SEED);
        writeState(seed);
        return send(res, 200, JSON.stringify(publicState(seed, actor)));
      }

      if (url.pathname === "/api/state" && req.method === "GET") {
        const state = ensureState();
        const actor = actorFrom(req, state);
        if (!actor) return send(res, 401, JSON.stringify({ error: "로그인이 필요합니다." }));
        return send(res, 200, JSON.stringify(publicState(state, actor)));
      }

      if (url.pathname === "/api/state" && req.method === "PUT") {
        const state = ensureState();
        const actor = actorFrom(req, state);
        if (!actor) return send(res, 401, JSON.stringify({ error: "로그인이 필요합니다." }));
        const body = await readBody(req);
        delete body.sessionUser;
        const next = sanitize(state, body, actor);
        writeState(next);
        return send(res, 200, JSON.stringify(publicState(next, actor)));
      }

      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/index.html";
      const file = path.normalize(path.join(PUBLIC, pathname));
      if (!file.startsWith(PUBLIC)) return send(res, 403, "forbidden", "text/plain; charset=utf-8");
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return send(res, 404, "not found", "text/plain; charset=utf-8");
      }
      const ext = path.extname(file);
      res.writeHead(200, {
        "Content-Type": TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      if (!res.headersSent) send(res, 500, JSON.stringify({ error: "요청을 처리하지 못했습니다." }));
    }
  }).catch(() => {
    if (!res.headersSent) send(res, 500, JSON.stringify({ error: "요청을 처리하지 못했습니다." }));
  });
});

server.listen(PORT, HOST, () => {
  ensureState();
  console.log(`LUMEN ready`);
  console.log(`  local   http://127.0.0.1:${PORT}`);
  console.log(`  network http://0.0.0.0:${PORT}`);
});
