#!/usr/bin/env python3
"""Sanad «اسأل سند» relay.

The app sends: POST /sanad-ask, Authorization: Bearer <employee's Supabase access token>,
body {"question": "..."}.
The relay checks the login with Supabase, reads ONLY that employee's own dashboard
(employee_dashboard() with no employee id, under the employee's own token and RLS),
applies daily limits, and asks the OpenClaw agent sanad_assistant on loopback.
The OpenClaw gateway token never leaves this server.
"""
import json, os, sqlite3, threading, time, urllib.request, urllib.error, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SUPA = "https://etaetoflotynlmgrehuu.supabase.co"
SUPA_KEY = os.environ["SANAD_SUPABASE_PUBLISHABLE_KEY"]  # public key, set in /etc/sanad-ask.env
GATEWAY = "http://127.0.0.1:18789/v1/chat/completions"
AGENT = "openclaw/sanad_assistant"
CONFIG = "/home/openclaw/.openclaw/openclaw.json"
DATA = "/var/lib/sanad-ask"
PER_USER_DAY = int(os.environ.get("SANAD_ASK_PER_USER_DAY", "20"))
GLOBAL_DAY = int(os.environ.get("SANAD_ASK_GLOBAL_DAY", "1000"))
MAX_Q = 500
KW = datetime.timezone(datetime.timedelta(hours=3))

_db_lock = threading.Lock()
_db = sqlite3.connect(os.path.join(DATA, "usage.db"), check_same_thread=False)
_db.execute("create table if not exists usage(day text, user_id text, n integer, primary key(day,user_id))")
_db.commit()

MSG = {
    "auth": "سجّل دخولك من جديد وحاول مرة ثانية.",
    "bad": "اكتب سؤالك (500 حرف بالكثير).",
    "limit": "وصلت الحد اليومي للأسئلة. تقدر تسأل مرة ثانية باچر.",
    "busy": "المساعد مشغول الحين. حاول بعد شوي.",
    "nodata": "ما قدرت أجيب بياناتك الحين. حاول بعد شوي.",
    "notemp": "هالحساب مو مربوط بموظف، فالمساعد ما يقدر يجاوب عنه.",
}


def http_json(url, *, data=None, headers=None, timeout=15):
    req = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(),
                                 headers=headers or {}, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:
            return e.code, None


def gateway_token():
    with open(CONFIG) as f:
        return json.load(f)["gateway"]["auth"]["token"]


def take_quota(user_id):
    day = datetime.datetime.now(KW).date().isoformat()
    with _db_lock:
        total = _db.execute("select coalesce(sum(n),0) from usage where day=?", (day,)).fetchone()[0]
        mine = _db.execute("select coalesce(n,0) from usage where day=? and user_id=?", (day, user_id)).fetchone()
        mine = mine[0] if mine else 0
        if mine >= PER_USER_DAY or total >= GLOBAL_DAY:
            return False, PER_USER_DAY - mine
        _db.execute("insert into usage(day,user_id,n) values(?,?,1) on conflict(day,user_id) do update set n=n+1",
                    (day, user_id))
        _db.commit()
        return True, PER_USER_DAY - mine - 1


def safe(text):
    # Keep the question/data from closing our tags.
    return text.replace("<", "‹").replace(">", "›")


MODEL = "anthropic/claude-haiku-5-5"


def db_log(auth, question, answer, status):
    """Write to public.assistant_log via log_assistant_question, as the employee. Fire and forget."""
    def run():
        try:
            http_json(SUPA + "/rest/v1/rpc/log_assistant_question",
                      data={"p_question": question[:MAX_Q], "p_answer": answer, "p_status": status,
                            "p_model": MODEL if answer else None},
                      headers={"apikey": SUPA_KEY, "Authorization": auth, "Content-Type": "application/json"},
                      timeout=5)
        except Exception:
            pass
    threading.Thread(target=run, daemon=True).start()


def log(entry):
    entry["ts"] = datetime.datetime.now(KW).isoformat(timespec="seconds")
    with _db_lock, open(os.path.join(DATA, "log.jsonl"), "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


class H(BaseHTTPRequestHandler):
    server_version = "sanad-ask"

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def fail(self, code, key):
        self.reply(code, {"error": key, "message": MSG[key]})

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.rstrip("/") == "/sanad-ask":
            return self.reply(200, {"ok": True})
        self.reply(404, {"error": "not_found"})

    def do_POST(self):
        t0 = time.time()
        if self.path.rstrip("/") != "/sanad-ask":
            return self.reply(404, {"error": "not_found"})
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or len(auth) > 4096:
            return self.fail(401, "auth")
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > 4096:
            return self.fail(400, "bad")
        try:
            q = (json.loads(self.rfile.read(n)).get("question") or "").strip()
        except Exception:
            return self.fail(400, "bad")
        if not q or len(q) > MAX_Q:
            if q:
                db_log(auth, q, None, "bad")
            return self.fail(400, "bad")

        sh = {"apikey": SUPA_KEY, "Authorization": auth, "Content-Type": "application/json"}
        code, user = http_json(SUPA + "/auth/v1/user", headers=sh)
        if code != 200 or not user or not user.get("id"):
            return self.fail(401, "auth")
        uid = user["id"]

        # Own data only: no employee id is sent, so the RPC returns the caller's own record.
        code, dash = http_json(SUPA + "/rest/v1/rpc/employee_dashboard", data={}, headers=sh, timeout=20)
        if code in (401, 403) or (isinstance(dash, dict) and dash.get("code") == "42501"):
            return self.fail(403, "notemp")
        if code != 200 or not isinstance(dash, dict):
            db_log(auth, q, None, "nodata")
            return self.fail(502, "nodata")

        ok, left = take_quota(uid)
        if not ok:
            db_log(auth, q, None, "limit")
            return self.fail(429, "limit")

        today = datetime.datetime.now(KW).date().isoformat()
        content = ("<بيانات_الموظف>\n" + safe(json.dumps(dash, ensure_ascii=False)) +
                   f"\n</بيانات_الموظف>\nتاريخ اليوم: {today}\n<السؤال>\n" + safe(q) + "\n</السؤال>")
        try:
            gh = {"Authorization": "Bearer " + gateway_token(), "Content-Type": "application/json"}
            code, out = http_json(GATEWAY, data={"model": AGENT, "messages": [{"role": "user", "content": content}],
                                                 "max_completion_tokens": 700}, headers=gh, timeout=120)
            answer = (out or {}).get("choices", [{}])[0].get("message", {}).get("content") if code == 200 else None
        except Exception:
            code, answer = 599, None
        fn = (dash.get("employee") or dash.get("info") or {}).get("file_number") if isinstance(dash, dict) else None
        log({"user_id": uid, "file_number": fn, "question": q, "answer": answer, "status": code,
             "ms": int((time.time() - t0) * 1000)})
        if not answer:
            db_log(auth, q, None, "busy" if code in (429, 503, 599) else "error")
            return self.fail(503, "busy")
        db_log(auth, q, answer.strip()[:4000], "answered")
        self.reply(200, {"answer": answer.strip(), "remaining_today": left,
                         "note": "رد آلي من مساعد سند. للتأكيد راجع الموارد البشرية."})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 18801), H).serve_forever()
