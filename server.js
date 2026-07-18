const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = 4000;
const DB_PATH = path.join(__dirname, "data", "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };

function readDB() { return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")); }
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname === "/admin" || pathname === "/admin/") {
    return serveStatic(res, path.join(PUBLIC_DIR, "admin", "index.html"));
  }
  if (pathname.startsWith("/admin/")) {
    return serveStatic(res, path.join(PUBLIC_DIR, pathname));
  }
  if (pathname === "/") {
    res.writeHead(302, { Location: "/admin" });
    return res.end();
  }

  if (pathname === "/api/stats" && req.method === "GET") {
    const db = readDB();
    const stats = { New: 0, Contacted: 0, Converted: 0 };
    db.leads.forEach((l) => { if (stats[l.status] !== undefined) stats[l.status]++; });
    return sendJSON(res, 200, { stats, totalLeads: db.leads.length, totalUsers: db.users.length });
  }

  if (pathname === "/api/leads" && req.method === "GET") {
    return sendJSON(res, 200, readDB().leads);
  }

  if (pathname === "/api/leads" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.name) return sendJSON(res, 400, { error: "Lead name is required" });
    const db = readDB();
    const lead = {
      id: newId("l"), name: body.name, email: body.email || "", phone: body.phone || "",
      source: body.source || "", assignedTo: "Unassigned", status: "New", followUp: "", notes: [],
    };
    db.leads.unshift(lead);
    writeDB(db);
    return sendJSON(res, 201, lead);
  }

  const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const db = readDB();
    const lead = db.leads.find((l) => l.id === leadMatch[1]);
    if (!lead) return sendJSON(res, 404, { error: "Lead not found" });
    Object.assign(lead, body);
    writeDB(db);
    return sendJSON(res, 200, lead);
  }
  if (leadMatch && req.method === "DELETE") {
    const db = readDB();
    const before = db.leads.length;
    db.leads = db.leads.filter((l) => l.id !== leadMatch[1]);
    if (db.leads.length === before) return sendJSON(res, 404, { error: "Lead not found" });
    writeDB(db);
    res.writeHead(204);
    return res.end();
  }

  const noteMatch = pathname.match(/^\/api\/leads\/([^/]+)\/notes$/);
  if (noteMatch && req.method === "POST") {
    const body = await readBody(req);
    if (!body.text) return sendJSON(res, 400, { error: "Note text is required" });
    const db = readDB();
    const lead = db.leads.find((l) => l.id === noteMatch[1]);
    if (!lead) return sendJSON(res, 404, { error: "Lead not found" });
    lead.notes.unshift({ id: newId("n"), text: body.text, at: new Date().toISOString() });
    writeDB(db);
    return sendJSON(res, 201, lead);
  }

  if (pathname === "/api/users" && req.method === "GET") {
    return sendJSON(res, 200, readDB().users);
  }
  if (pathname === "/api/users" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.name || !body.email) return sendJSON(res, 400, { error: "Name and email are required" });
    const db = readDB();
    const user = { id: newId("u"), name: body.name, email: body.email, role: body.role || "user" };
    db.users.push(user);
    writeDB(db);
    return sendJSON(res, 201, user);
  }
  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && req.method === "DELETE") {
    const db = readDB();
    const before = db.users.length;
    db.users = db.users.filter((u) => u.id !== userMatch[1]);
    if (db.users.length === before) return sendJSON(res, 404, { error: "User not found" });
    writeDB(db);
    res.writeHead(204);
    return res.end();
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Mini CRM running at http://localhost:${PORT}/admin`);
});