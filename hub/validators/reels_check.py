"""옛 경로 호환: 인스타그램 검수기는 tools/instagram/validator.py 로 옮겼다.

사용: python -m hub.validators.reels_check <package.json>  (= python -m tools.instagram.validator)
"""
import sys

from tools.instagram.validator import accounts, main, validate  # noqa: F401


def __getattr__(name):
    if name == "ACCOUNTS":  # 옛 코드 호환: 지금 설정된 계정 ID 목록
        return tuple(accounts())
    raise AttributeError(name)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
