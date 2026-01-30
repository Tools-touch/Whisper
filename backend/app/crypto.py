from base58 import b58decode
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey


def verify_signature(pubkey_b58: str, signature_b58: str, message: bytes) -> bool:
    try:
        verify_key = VerifyKey(b58decode(pubkey_b58))
        verify_key.verify(message, b58decode(signature_b58))
        return True
    except BadSignatureError:
        return False
    except Exception:
        return False
