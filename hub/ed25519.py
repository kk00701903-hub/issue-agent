"""Ed25519 서명·검증 (RFC 8032, 표준 라이브러리만). 라이선스(이용권) 토큰 검증에 쓴다.

속도보다 의존성 없는 것이 중요해서 순수 파이썬으로 둔다(검증 1번 수 밀리초~수십 밀리초).
판매자 쪽 서명(웹 콘솔)도 같은 모듈을 쓴다. 시험: tests/test_saas.py 가 cryptography 패키지 결과와 맞춰 본다(있을 때).
"""
import hashlib

_q = 2 ** 255 - 19
_l = 2 ** 252 + 27742317777372353535851937790883648493
_d = -121665 * pow(121666, _q - 2, _q) % _q
_I = pow(2, (_q - 1) // 4, _q)


def _H(m):
    return hashlib.sha512(m).digest()


def _xrecover(y):
    xx = (y * y - 1) * pow(_d * y * y + 1, _q - 2, _q)
    x = pow(xx, (_q + 3) // 8, _q)
    if (x * x - xx) % _q != 0:
        x = (x * _I) % _q
    if x % 2 != 0:
        x = _q - x
    return x


_By = 4 * pow(5, _q - 2, _q) % _q
_Bx = _xrecover(_By)
_B = (_Bx, _By, 1, _Bx * _By % _q)
_ZERO = (0, 1, 1, 0)


def _add(P, Q):
    x1, y1, z1, t1 = P
    x2, y2, z2, t2 = Q
    a = (y1 - x1) * (y2 - x2) % _q
    b = (y1 + x1) * (y2 + x2) % _q
    c = t1 * 2 * _d * t2 % _q
    dd = z1 * 2 * z2 % _q
    e, f, g, h = b - a, dd - c, dd + c, b + a
    return (e * f % _q, g * h % _q, f * g % _q, e * h % _q)


def _mul(P, n):
    R = _ZERO
    while n > 0:
        if n & 1:
            R = _add(R, P)
        P = _add(P, P)
        n >>= 1
    return R


def _enc(P):
    x, y, z, _t = P
    zi = pow(z, _q - 2, _q)
    x, y = x * zi % _q, y * zi % _q
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


def _dec(s):
    if len(s) != 32:
        raise ValueError("point length")
    v = int.from_bytes(s, "little")
    y = v & ((1 << 255) - 1)
    if y >= _q:
        raise ValueError("point y")
    x = _xrecover(y)
    if (x & 1) != (v >> 255):
        x = _q - x
    if (-x * x + y * y - 1 - _d * x * x * y * y) % _q != 0:
        raise ValueError("not on curve")
    return (x, y, 1, x * y % _q)


def _clamp(h):
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    return a


def public_key(seed):
    """32바이트 비밀 씨앗 → 32바이트 공개키"""
    if len(seed) != 32:
        raise ValueError("seed must be 32 bytes")
    return _enc(_mul(_B, _clamp(_H(seed))))


def sign(seed, msg):
    h = _H(seed)
    a = _clamp(h)
    pk = _enc(_mul(_B, a))
    r = int.from_bytes(_H(h[32:] + msg), "little") % _l
    R = _enc(_mul(_B, r))
    k = int.from_bytes(_H(R + pk + msg), "little") % _l
    S = (r + k * a) % _l
    return R + S.to_bytes(32, "little")


def verify(pk, msg, sig):
    """서명이 맞으면 True. 형식이 틀리면 False(예외를 내지 않음)."""
    try:
        if len(sig) != 64 or len(pk) != 32:
            return False
        R = _dec(sig[:32])
        A = _dec(pk)
        S = int.from_bytes(sig[32:], "little")
        if S >= _l:
            return False
        k = int.from_bytes(_H(sig[:32] + pk + msg), "little") % _l
        return _enc(_mul(_B, S)) == _enc(_add(R, _mul(A, k)))
    except (ValueError, TypeError):
        return False
