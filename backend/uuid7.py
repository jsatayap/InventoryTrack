import os
import time
import uuid

def uuid7() -> uuid.UUID:
    unix_ms = int(time.time() * 1000)
    rand_bytes = os.urandom(10)

    value = bytearray(unix_ms.to_bytes(6, "big") + rand_bytes)
    value[6] = (value[6] & 0x0F) | 0x70  # version 7
    value[8] = (value[8] & 0x3F) | 0x80  # variant 10

    return uuid.UUID(bytes=bytes(value))