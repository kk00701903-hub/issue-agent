"""콘솔 관리자 명령(판매자용).

  python -m cloud.admin orgs                                  조직 목록
  python -m cloud.admin set-plan --email a@b.c --plan pro [--months 1]   입금 확인 뒤 요금제 적용
  python -m cloud.admin payments                              결제 대기 목록
  python -m cloud.admin paid --ref ord_xxx                    주문 입금 확인(요금제 자동 적용)
"""
import argparse
import json
import sys

from cloud import app, db


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("orgs")
    sp = sub.add_parser("set-plan"); sp.add_argument("--email", required=True); sp.add_argument("--plan", required=True); sp.add_argument("--months", type=int, default=1)
    sub.add_parser("payments")
    pd = sub.add_parser("paid"); pd.add_argument("--ref", required=True)
    a = ap.parse_args(argv)
    db.init()
    if a.cmd == "orgs":
        for o in db.all_("SELECT o.*, (SELECT email FROM users WHERE org_id=o.id AND role='owner' LIMIT 1) owner FROM orgs o ORDER BY id"):
            print(json.dumps(o, ensure_ascii=False))
    elif a.cmd == "set-plan":
        u = db.user_by_email(a.email.lower())
        if not u:
            print("없는 이메일"); return 1
        print("ok" if app.activate_plan(u["org_id"], a.plan, a.months, "admin") else "실패(요금제 이름 확인)")
    elif a.cmd == "payments":
        for p in db.all_("SELECT * FROM payments WHERE status!='paid' ORDER BY id DESC"):
            print(json.dumps(p, ensure_ascii=False))
    elif a.cmd == "paid":
        p = db.one("SELECT * FROM payments WHERE ref=?", (a.ref,))
        if not p:
            print("없는 주문"); return 1
        db.exec("UPDATE payments SET status='paid' WHERE id=?", (p["id"],))
        app.activate_plan(p["org_id"], p["plan"], p["months"], p["ref"])
        print("ok")
    else:
        ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
