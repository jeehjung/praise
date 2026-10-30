const ALLOWED_ORIGINS = new Set([
  "https://jeehjung.github.io"
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";

    const cors = {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    if (allowedOrigin) cors["Access-Control-Allow-Origin"] = allowedOrigin;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...cors }
    });

    try {
      await init(env.DB);

      if (url.pathname === "/api/state" && req.method === "GET") {
        const week = validWeek(url.searchParams.get("week")) || isoWeek(new Date());
        const people = await env.DB.prepare("SELECT id,name FROM people ORDER BY id").all();
        const counts = await env.DB.prepare(
          "SELECT recipient_id,COUNT(*) count FROM stickers WHERE week_key=? GROUP BY recipient_id"
        ).bind(week).all();
        const recent = await env.DB.prepare(
          "SELECT s.id,s.week_key,s.created_at,p.name recipient,s.giver_name FROM stickers s JOIN people p ON p.id=s.recipient_id WHERE s.week_key=? ORDER BY s.created_at DESC LIMIT 300"
        ).bind(week).all();
        const countMap = Object.fromEntries(counts.results.map(x => [x.recipient_id, x.count]));
        return json({
          week,
          people: people.results.map(x => ({ ...x, stickers: countMap[x.id] || 0 })),
          recent: recent.results
        });
      }

      if (url.pathname === "/api/people" && req.method === "POST") {
        const body = await req.json();
        const name = clean(body.name);
        if (!name) return json({ error: "이름은 1~30자로 입력해 주세요." }, 400);
        if (await env.DB.prepare("SELECT id FROM people WHERE name=? COLLATE NOCASE").bind(name).first()) {
          return json({ error: "이미 등록된 이름입니다." }, 409);
        }
        await env.DB.prepare("INSERT INTO people(name,created_at) VALUES(?,?)")
          .bind(name, new Date().toISOString()).run();
        return json({ ok: true }, 201);
      }

      if (url.pathname === "/api/stickers" && req.method === "POST") {
        const body = await req.json();
        const recipientId = Number(body.recipientId);
        const giverName = clean(body.giverName);
        const week = validWeek(body.week) || isoWeek(new Date());

        if (!Number.isInteger(recipientId) || recipientId < 1) {
          return json({ error: "칭찬받는 사람을 선택해 주세요." }, 400);
        }
        if (!giverName) return json({ error: "칭찬하는 사람 이름을 입력해 주세요." }, 400);
        if (!await env.DB.prepare("SELECT id FROM people WHERE id=?").bind(recipientId).first()) {
          return json({ error: "대상을 찾을 수 없습니다." }, 404);
        }
        if (await env.DB.prepare(
          "SELECT id FROM stickers WHERE week_key=? AND recipient_id=? AND giver_name=? COLLATE NOCASE"
        ).bind(week, recipientId, giverName).first()) {
          return json({ error: "이번 주에는 이 대상에게 이미 스티커를 줬습니다." }, 409);
        }
        await env.DB.prepare(
          "INSERT INTO stickers(recipient_id,giver_name,week_key,created_at) VALUES(?,?,?,?)"
        ).bind(recipientId, giverName, week, new Date().toISOString()).run();
        return json({ ok: true }, 201);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: "서버 오류", detail: String(error.message || error) }, 500);
    }
  }
};

async function init(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS people(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE COLLATE NOCASE,created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS stickers(id INTEGER PRIMARY KEY AUTOINCREMENT,recipient_id INTEGER NOT NULL,giver_name TEXT NOT NULL,week_key TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(recipient_id) REFERENCES people(id),UNIQUE(week_key,recipient_id,giver_name COLLATE NOCASE))").run();
  const result = await db.prepare("SELECT COUNT(*) n FROM people").first();
  if (!result.n) {
    for (const name of ["사람1", "사람2", "사람3"]) {
      await db.prepare("INSERT OR IGNORE INTO people(name,created_at) VALUES(?,?)")
        .bind(name, new Date().toISOString()).run();
    }
  }
}

function clean(value) {
  if (typeof value !== "string") return "";
  const text = value.trim().replace(/\\s+/g, " ");
  return text.length <= 30 ? text : "";
}
function validWeek(value) {
  return typeof value === "string" && /^\\d{4}-W\\d{2}$/.test(value) ? value : null;
}
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() + "-W" + String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, "0");
}
