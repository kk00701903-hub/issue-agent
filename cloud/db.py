"""웹 콘솔 저장소(SQLite). 위치: CLOUD_DB(기본 cloud/data/console.db). 사용자가 늘면 이 파일만 Postgres 로 바꾼다."""
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get("CLOUD_DB", Path(__file__).resolve().parent / "data" / "console.db"))
_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS orgs(id INTEGER PRIMARY KEY, name TEXT, plan TEXT, plan_until TEXT, tools TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, org_id INTEGER, email TEXT UNIQUE, pw_hash TEXT, role TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER, expires TEXT);
CREATE TABLE IF NOT EXISTS pair_codes(code TEXT PRIMARY KEY, org_id INTEGER, expires TEXT, used INTEGER);
CREATE TABLE IF NOT EXISTS devices(id INTEGER PRIMARY KEY, org_id INTEGER, device_id TEXT, name TEXT, token_hash TEXT, created TEXT, last_seen TEXT, last_summary TEXT, revoked INTEGER);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, org_id INTEGER, plan TEXT, months INTEGER, amount INTEGER, status TEXT, ref TEXT UNIQUE, created TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, org_id INTEGER, ts TEXT, kind TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS idx_dev_token ON devices(token_hash);
"""


def conn():
    c = getattr(_local, "c", None)
    if c is None or getattr(_local, "path", None) != str(DB_PATH):
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(str(DB_PATH), timeout=10)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        _local.c, _local.path = c, str(DB_PATH)
    return c


def init():
    conn().executescript(SCHEMA)
    conn().commit()


def exec(sql, args=()):  # noqa: A001
    c = conn()
    cur = c.execute(sql, args)
    c.commit()
    return cur.lastrowid


def one(sql, args=()):
    r = conn().execute(sql, args).fetchone()
    return dict(r) if r else None


def all_(sql, args=()):
    return [dict(r) for r in conn().execute(sql, args).fetchall()]


def org(org_id):
    return one("SELECT * FROM orgs WHERE id=?", (org_id,))


def user_by_email(email):
    return one("SELECT * FROM users WHERE email=?", (email,))


def session_user(token_hash):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return one("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?", (token_hash, now))


def device_by_token(token_hash):
    if not token_hash:
        return None
    return one("SELECT * FROM devices WHERE token_hash=? AND token_hash!=''", (token_hash,))


def devices(org_id):
    import json
    out = []
    for d in all_("SELECT id, device_id, name, created, last_seen, last_summary, revoked FROM devices WHERE org_id=? ORDER BY id", (org_id,)):
        d["summary"] = json.loads(d.pop("last_summary") or "{}")
        d["revoked"] = bool(d["revoked"])
        out.append(d)
    return out


def payments(org_id):
    return all_("SELECT plan, months, amount, status, ref, created FROM payments WHERE org_id=? ORDER BY id DESC LIMIT 20", (org_id,))


def audit(org_id, kind, detail=""):
    exec("INSERT INTO audit(org_id, ts, kind, detail) VALUES(?,?,?,?)", (org_id, datetime.now(timezone.utc).isoformat(timespec="seconds"), kind, str(detail)[:200]))
