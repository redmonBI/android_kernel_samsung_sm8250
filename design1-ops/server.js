import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as domain from "./lib/domain.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA, "state.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const POLL_MS = Number(process.env.POLL_MS || 45000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const sessions = new Map();
let state = loadState();
let queue = Promise.resolve();

function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      const fresh = domain.freshState();
      saved.users = domain.USERS.map((seed) => {
        const prev = (saved.users || []).find((user) => user.id === seed.id);
        return { ...seed, ...(prev || {}), role: seed.role, password: prev?.password || seed.password };
      });
      saved.settings = { ...fresh.settings, ...(saved.settings || {}) };
      saved.sheet = { ...fresh.sheet, ...(saved.sheet || {}) };
      saved.baselines = saved.baselines || {};
      saved.baselineOrder = saved.baselineOrder || [];
      saved.changes = saved.changes || [];
      saved.decisions = saved.decisions || {};
      saved.todos = saved.todos || [];
      return saved;
    }
  } catch (error) {
    console.error("state reset", error.message);
  }
  return domain.freshState();
}

function saveState() {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}

async function fetchTabs() {
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${domain.SHEET_ID}/edit`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`탭 목록 ${response.status}`);
  return domain.parseTabList(await response.text());
}

async function fetchCsv(gid) {
  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${domain.SHEET_ID}/export?format=csv&gid=${gid}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw new Error(`시트 ${response.status}`);
  const text = await response.text();
  if (!text || /<!DOCTYPE html/i.test(text.slice(0, 200))) throw new Error("시트를 읽지 못했습니다.");
  return text;
}

async function syncSheet() {
  try {
    let tabs = state.sheet.tabs || [];
    try {
      const found = await fetchTabs();
      if (found.length) tabs = found;
    } catch (error) {
      console.error("tabs", error.message);
    }
    const latest = domain.latestChecklist(tabs);
    let gid = state.sheet.gid || latest?.gid || domain.FALLBACK_GID;
    const changes = [];
    if (state.settings.followLatest !== false && latest && state.sheet.gid && latest.gid !== state.sheet.gid) {
      gid = latest.gid;
      changes.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        gid,
        tabName: latest.name,
        kind: "new-tab",
        key: "",
        project: "",
        assignee: "",
        priority: "",
        summary: `새 주간 시트가 열렸습니다. ${latest.name}`,
        diffs: [],
        acked: {},
      });
    } else if (!state.sheet.gid && latest) {
      gid = latest.gid;
    }
    if (!/^\d{6,}$/.test(String(gid))) gid = domain.FALLBACK_GID;
    const csv = await fetchCsv(gid);
    const parsed = domain.parseSheet(csv);
    const tabName = tabs.find((tab) => tab.gid === gid)?.name || state.sheet.tabName || "";
    const meta = { gid, tabName, at: new Date().toISOString(), id: () => crypto.randomUUID() };
    const diff = domain.diffRows(state.baselines[gid] || null, parsed.rows, meta);
    if (diff.initial) {
      changes.push({
        id: crypto.randomUUID(),
        at: meta.at,
        gid,
        tabName,
        kind: "connected",
        key: "",
        project: "",
        assignee: "",
        priority: "",
        summary: `${tabName || "주간 시트"}를 연결했습니다. 이제부터 추가와 수정을 알립니다.`,
        diffs: [],
        acked: {},
      });
    } else {
      changes.push(...diff.changes);
    }
    state.baselines[gid] = parsed.rows;
    state.baselineOrder = [gid, ...(state.baselineOrder || []).filter((item) => item !== gid)].slice(0, 6);
    for (const key of Object.keys(state.baselines)) {
      if (!state.baselineOrder.includes(key)) delete state.baselines[key];
    }
    state.changes = [...changes, ...(state.changes || [])].slice(0, 400);
    state.sheet = {
      gid,
      tabName,
      tabs,
      fetchedAt: new Date().toISOString(),
      error: "",
      headers: parsed.headers,
      rows: parsed.rows,
    };
  } catch (error) {
    console.error("sync", error.message);
    state.sheet.error = "시트를 지금 읽지 못했습니다. 마지막으로 받은 내용을 보여 줍니다.";
  }
  saveState();
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(Object.assign(new Error("요청이 너무 큽니다."), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(Object.assign(error, { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function actorFrom(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const userId = sessions.get(token);
  if (!userId) return null;
  return state.users.find((user) => user.id === userId) || null;
}

function deskFor(user) {
  return domain.buildDesk(state, user, new Date());
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    send(res, 200, JSON.stringify({
      ok: true,
      sheet: state.sheet.tabName || "",
      rows: (state.sheet.rows || []).length,
      fetchedAt: state.sheet.fetchedAt || "",
      error: state.sheet.error || "",
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const found = state.users.find((user) => user.id === String(body.id || "").trim() && user.password === String(body.password || ""));
    if (!found) {
      send(res, 401, JSON.stringify({ error: "아이디 또는 비밀번호를 확인하세요." }));
      return;
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, found.id);
    send(res, 200, JSON.stringify({
      token,
      user: { id: found.id, name: found.name, title: found.title, initials: found.initials, role: found.role },
    }));
    return;
  }
  const user = actorFrom(req);
  if (!user) {
    send(res, 401, JSON.stringify({ error: "로그인이 필요합니다." }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/desk") {
    send(res, 200, JSON.stringify(deskFor(user)));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/act") {
    const body = await readBody(req);
    const result = await enqueue(async () => {
      const outcome = domain.applyAction(state, user, body, new Date()) || {};
      if (outcome.sync) await syncSheet();
      else saveState();
      return outcome;
    });
    send(res, 200, JSON.stringify({ desk: deskFor(user), deleted: result.deleted || null }));
    return;
  }
  send(res, 404, JSON.stringify({ error: "없는 주소입니다." }));
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  if (!TYPES[ext]) {
    send(res, 404, "not found", "text/plain; charset=utf-8");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "not found", "text/plain; charset=utf-8");
      return;
    }
    send(res, 200, data, TYPES[ext]);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      const code = error.status || 500;
      send(res, code, JSON.stringify({ error: error.message || "처리하지 못했습니다." }));
    });
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC, requested));
  if (!filePath.startsWith(PUBLIC)) {
    send(res, 403, "forbidden", "text/plain; charset=utf-8");
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`LUMEN desk http://127.0.0.1:${PORT}`);
});

enqueue(() => syncSheet());
setInterval(() => {
  enqueue(() => syncSheet());
}, POLL_MS);
