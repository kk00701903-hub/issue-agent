"""판매 페이지 만들기: cloud/landing.template.html → cloud/static/index.html(콘솔이 보여 줌) + 미리보기용(그림 내장).

  python -m cloud.build_landing [--preview 출력경로]
"""
import argparse
import base64
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _won(n):
    return f"{int(n):,}원"


def price_tables():
    """요금표 두 개(결제 기간별 사용료, 할인 기준)를 plans.json 에서 만든다 — 콘솔 결제와 같은 계산(cloud.app.price_table)."""
    import json
    import sys
    sys.path.insert(0, str(HERE.parent))
    from cloud.app import price_table
    plans = json.loads((HERE / "plans.json").read_text(encoding="utf-8"))
    rows = price_table()
    periods = rows[0]["periods"] if rows else []
    head = "<tr><th>요금제</th>" + "".join(
        f"<th>{p['label']}{' · ' + str(round(p['discount'] * 100)) + '% 할인' if p['discount'] else ''}</th>" for p in periods) + "<th>연간 결제 시 월 환산</th><th>연간 절약</th></tr>"
    body = ""
    for r in rows:
        cells = "".join(f"<td{' class="best"' if p['months'] == 12 else ''}>{_won(p['amount'])}{'<br><small>' + _won(p['per_month']) + ' / 월</small>' if p['months'] > 1 else ''}</td>" for p in r["periods"])
        y = next((p for p in r["periods"] if p["months"] == 12), None)
        body += f"<tr><td><b>{r['name']}</b></td>{cells}<td>{_won(y['per_month']) if y else '-'}</td><td class=\"save\">{_won(y['saving']) if y else '-'}</td></tr>"
    price = f'<table class="price-tbl"><thead>{head}</thead><tbody>{body}</tbody></table>'
    drows = "".join(f"<tr><td><b>{p['label']}</b></td><td>{round(p['discount'] * 100)}%</td><td class=\"l\">{p['months']}개월 한 번에 결제</td><td class=\"l\">자동 적용</td></tr>" for p in periods if p["discount"])
    drows += "".join(f"<tr><td><b>{d['label']}</b></td><td>+{round(d['rate'] * 100)}%</td><td class=\"l\">{d['rule']}</td><td class=\"l\">{d['proof']}</td></tr>" for d in plans.get("extra_discounts", []))
    disc = f'<table class="price-tbl"><thead><tr><th>할인</th><th>할인율</th><th class=\"l\">기준</th><th class=\"l\">확인 방법</th></tr></thead><tbody>{drows}</tbody></table>'
    return price, disc, str(round(float(plans.get("max_discount") or 0) * 100))


def render(console="/app", signup="/app#signup", img="/static/office.jpg", terms="/static/terms.html", privacy="/static/privacy.html"):
    t = (HERE / "landing.template.html").read_text(encoding="utf-8")
    pt, dt, mx = price_tables()
    for k, v in {"{{CONSOLE}}": console, "{{SIGNUP}}": signup, "{{OFFICE_IMG}}": img, "{{TERMS}}": terms, "{{PRIVACY}}": privacy,
                 "{{PRICE_TABLE}}": pt, "{{DISCOUNT_TABLE}}": dt, "{{MAX_DISCOUNT}}": mx}.items():
        t = t.replace(k, v)
    return t


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview")
    a = ap.parse_args(argv)
    page = render()
    (HERE / "static" / "index.html").write_text("<!doctype html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n" + page.replace("<div class=\"wrap\">", "</head>\n<body>\n<div class=\"wrap\">", 1) + "\n</body>\n</html>\n", encoding="utf-8")
    if a.preview:
        img = "data:image/jpeg;base64," + base64.b64encode((HERE / "static" / "office.jpg").read_bytes()).decode()
        Path(a.preview).write_text(render(console="#pricing", signup="#pricing", img=img, terms="#", privacy="#"), encoding="utf-8")
    print("ok")


if __name__ == "__main__":
    main()
