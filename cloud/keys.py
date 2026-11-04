"""판매자 서명키 만들기.

  python -m cloud.keys new [--write-pub]
    → 비밀 씨앗(CLOUD_SIGNING_SEED, 콘솔 서버 환경변수에만 둘 것)과 공개키를 출력.
      --write-pub 이면 공개키를 hub/keys/vendor.pub 에 써서 실행기 판매본에 넣는다.
비밀 씨앗은 저장소·채팅·메일에 올리지 않는다. 잃어버리면 모든 고객 PC의 공개키를 바꿔야 한다.
"""
import argparse
import secrets
import sys
from pathlib import Path

from hub import ed25519

PUB = Path(__file__).resolve().parent.parent / "hub" / "keys" / "vendor.pub"


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    n = sub.add_parser("new"); n.add_argument("--write-pub", action="store_true")
    p = sub.add_parser("pub"); p.add_argument("seed")
    a = ap.parse_args(argv)
    if a.cmd == "new":
        seed = secrets.token_bytes(32)
        pub = ed25519.public_key(seed).hex()
        print("CLOUD_SIGNING_SEED=" + seed.hex() + "   ← 콘솔 서버 환경변수에만(비밀)")
        print("공개키: " + pub)
        if a.write_pub:
            PUB.parent.mkdir(parents=True, exist_ok=True)
            PUB.write_text(pub + "\n", encoding="utf-8")
            print(f"공개키를 {PUB} 에 썼습니다.")
    elif a.cmd == "pub":
        print(ed25519.public_key(bytes.fromhex(a.seed)).hex())
    else:
        ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
