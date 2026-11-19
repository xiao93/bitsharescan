#!/usr/bin/env python3
"""Crawl BitShares P2P peers from the official seed list.

Speaks the Graphene encrypted socket (secp256k1 ECDH, AES-256-CBC) and the
net protocol hello / address_request / address_message exchange. Does not
attribute nodes to witnesses: hello messages carry node keys, not accounts.
"""
import hashlib
import json
import os
import socket
import struct
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

CHAIN_ID = bytes.fromhex("4018d7844c78f6a6c41c6a552b898022310fc5dec06da467ee7905a8dad512c8")
PROTOCOL = 106
HELLO = 5006
ACCEPTED = 5007
REJECTED = 5008
ADDRESS_REQUEST = 5009
ADDRESS = 5010
SEEDS = [
    "bts-seed1.abit-more.com:62015",
    "seed.roelandp.nl:1776",
    "seed1.xbts.io:1776",
    "seed2.xbts.io:1776",
    "seed4.xbts.io:1776",
    "seeds.btsnodes.com:1776",
    "seed.bitshares.eu:1776",
    "seed.bitsharesnodes.com:1776",
]
OUT = Path(__file__).resolve().parents[1] / "public" / "data" / "p2p-nodes.json"
MAX_NODES = 80
TIMEOUT = 6
DEADLINE = time.time() + 180

K0 = 0xC3A5C85C97CB3127
K1 = 0xB492B66FBE98F273
K2 = 0x9AE16A3B2F90404F
MASK = (1 << 64) - 1


def u64(n):
    return n & MASK


def rot(val, shift):
    if shift == 0:
        return val
    return u64((val >> shift) | (val << (64 - shift)))


def fetch64(buf, off):
    return int.from_bytes(buf[off:off + 8], "little")


def fetch32(buf, off):
    return int.from_bytes(buf[off:off + 4], "little")


def shift_mix(val):
    return u64(val ^ (val >> 47))


def hash128to64(hi, lo):
    kmul = 0x9DDFEA08EB382D69
    a = u64((lo ^ hi) * kmul)
    a = u64(a ^ (a >> 47))
    b = u64((hi ^ a) * kmul)
    b = u64(b ^ (b >> 47))
    return u64(b * kmul)


def hash_len16(u, v, mul=None):
    if mul is None:
        return hash128to64(u, v)
    a = u64((u ^ v) * mul)
    a = u64(a ^ (a >> 47))
    b = u64((v ^ a) * mul)
    b = u64(b ^ (b >> 47))
    return u64(b * mul)


def hash_len0to16(buf, length):
    if length >= 8:
        mul = u64(K2 + length * 2)
        a = u64(fetch64(buf, 0) + K2)
        b = fetch64(buf, length - 8)
        c = u64(rot(b, 37) * mul + a)
        d = u64((rot(a, 25) + b) * mul)
        return hash_len16(c, d, mul)
    if length >= 4:
        mul = u64(K2 + length * 2)
        a = fetch32(buf, 0)
        return hash_len16(u64(length + (a << 3)), fetch32(buf, length - 4), mul)
    if length > 0:
        a = buf[0]
        b = buf[length >> 1]
        c = buf[length - 1]
        y = a + (b << 8)
        z = length + (c << 2)
        return u64(shift_mix(u64(y * K2) ^ u64(z * K0)) * K2)
    return K2


def city_murmur(buf, length, hi, lo):
    a = lo
    b = hi
    c = 0
    d = 0
    remain = length - 16
    if remain <= 0:
        a = u64(shift_mix(u64(a * K1)) * K1)
        c = u64(b * K1 + hash_len0to16(buf, length))
        d = shift_mix(u64(a + (fetch64(buf, 0) if length >= 8 else c)))
    else:
        c = hash_len16(u64(fetch64(buf, length - 8) + K1), a)
        d = hash_len16(u64(b + length), u64(c + fetch64(buf, length - 16)))
        a = u64(a + d)
        off = 0
        while remain > 0:
            a = u64(a ^ u64(shift_mix(u64(fetch64(buf, off) * K1)) * K1))
            a = u64(a * K1)
            b = u64(b ^ a)
            c = u64(c ^ u64(shift_mix(u64(fetch64(buf, off + 8) * K1)) * K1))
            c = u64(c * K1)
            d = u64(d ^ c)
            off += 16
            remain -= 16
        buf = buf[off:]
    a = hash_len16(a, c)
    b = hash_len16(d, b)
    return u64(a ^ b), hash_len16(b, a)


def city_hash128(buf):
    if len(buf) >= 16:
        hi = fetch64(buf, 0)
        lo = u64(fetch64(buf, 8) + K0)
        return city_murmur(buf[16:], len(buf) - 16, hi, lo) if len(buf) - 16 < 128 else city_murmur(buf[16:], len(buf) - 16, hi, lo)
    return city_murmur(buf, len(buf), K0, K1)


def aes_iv(secret):
    hi, lo = city_hash128(secret)
    return hi.to_bytes(8, "little") + lo.to_bytes(8, "little")


def uvar(n):
    out = bytearray()
    while True:
        byte = n & 0x7F
        n >>= 7
        if n:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def pack_str(text):
    raw = text.encode()
    return uvar(len(raw)) + raw


def read_uvar(buf, off):
    value = 0
    shift = 0
    while True:
        byte = buf[off]
        off += 1
        value |= (byte & 0x7F) << shift
        if byte < 128:
            return value, off
        shift += 7


def ip_text(num):
    return ".".join(str((num >> shift) & 255) for shift in (24, 16, 8, 0))


def sign_digest(priv_bytes, digest):
    from coincurve import PrivateKey
    signed = PrivateKey(priv_bytes).sign_recoverable(digest, hasher=None)
    recid = signed[64]
    return bytes([27 + 4 + recid]) + signed[:64]


def compressed_pub(priv_bytes):
    key = ec.derive_private_key(int.from_bytes(priv_bytes, "big"), ec.SECP256K1())
    return key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.CompressedPoint)


def shared_secret(priv_bytes, peer_pub):
    priv = ec.derive_private_key(int.from_bytes(priv_bytes, "big"), ec.SECP256K1())
    peer = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256K1(), peer_pub)
    point = priv.exchange(ec.ECDH(), peer)
    return hashlib.sha512(point).digest()


class SecureSock:
    def __init__(self, sock, secret):
        key = hashlib.sha256(secret).digest()
        iv = aes_iv(secret)
        self.sock = sock
        self.enc = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
        self.dec = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()

    def send_plain(self, payload):
        header = struct.pack("<II", len(payload), 0)
        # msg type is set by caller inside a full frame; this helper sends already framed bytes
        padded = payload + bytes((-len(payload)) % 16)
        self.sock.sendall(self.enc.update(padded))

    def send_message(self, msg_type, payload):
        raw = struct.pack("<II", len(payload), msg_type) + payload
        padded = raw + bytes((-len(raw)) % 16)
        self.sock.sendall(self.enc.update(padded))

    def _read_exact(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise EOFError("socket closed")
            buf += chunk
        return buf

    def read_message(self):
        block = self.dec.update(self._read_exact(16))
        size, msg_type = struct.unpack_from("<II", block)
        if size > 2_000_000:
            raise ValueError(f"message too large {size}")
        leftover = 8
        remaining = 16 * ((size - leftover + 15) // 16) if size > leftover else 0
        extra = self.dec.update(self._read_exact(remaining)) if remaining else b""
        data = (block[8:] + extra)[:size]
        return msg_type, data


def parse_hello(data):
    length, off = read_uvar(data, 0)
    user_agent = data[off:off + length].decode("utf-8", "replace")
    off += length
    version = struct.unpack_from("<I", data, off)[0]
    off += 4 + 4 + 2 + 2 + 33 + 65 + 32
    info = {"user_agent": user_agent, "core_protocol_version": version}
    try:
        info.update(parse_user_data(data, off))
    except Exception:
        pass
    return info


def parse_user_data(data, off):
    count, off = read_uvar(data, off)
    found = {}
    for _ in range(count):
        key_len, off = read_uvar(data, off)
        key = data[off:off + key_len].decode("utf-8", "replace")
        off += key_len
        kind = data[off]
        off += 1
        if kind in (1, 2):
            value = struct.unpack_from("<Q", data, off)[0]
            off += 8
            if kind == 1 and value >= 2**63:
                value -= 2**64
        elif kind == 4:
            value = data[off]
            off += 1
        elif kind == 5:
            n, off = read_uvar(data, off)
            value = data[off:off + n].decode("utf-8", "replace")
            off += n
        elif kind == 8:
            n, off = read_uvar(data, off)
            value = data[off:off + n].hex()
            off += n
        else:
            break
        found[key] = value
    return {
        "fc_git_revision": str(found.get("fc_git_revision_sha", "")),
        "graphene_git_revision": str(found.get("graphene_git_revision_sha", "")),
        "platform": str(found.get("platform", "")),
        "bitness": found.get("bitness", ""),
        "head_block": found.get("last_known_fork_block_number"),
    }


def parse_addresses(data):
    count, off = read_uvar(data, 0)
    peers = []
    for _ in range(min(count, 500)):
        ip = struct.unpack_from("<I", data, off)[0]
        port = struct.unpack_from("<H", data, off + 4)[0]
        seen = struct.unpack_from("<I", data, off + 6)[0]
        latency = struct.unpack_from("<q", data, off + 10)[0]
        off += 18 + 33 + 1 + 1
        peers.append({"ip": ip_text(ip), "port": port, "last_seen": seen, "latency_us": latency})
    return peers


def handshake(ip, port, via):
    record = {
        "ip": ip, "port": port, "reachable": False, "user_agent": "", "fc_git_revision": "",
        "platform": "", "bitness": "", "head_block": None, "last_seen": None, "first_via": via,
        "peers": [], "error": "",
    }
    try:
        sock = socket.create_connection((ip, port), TIMEOUT)
        sock.settimeout(TIMEOUT)
    except Exception as exc:
        record["error"] = f"{type(exc).__name__}: {exc}"
        return record
    try:
        priv = os.urandom(32)
        pub = compressed_pub(priv)
        sock.sendall(pub)
        peer_pub = sock.recv(33)
        if len(peer_pub) != 33:
            record["error"] = "short public key"
            return record
        secret = shared_secret(priv, peer_pub)
        secure = SecureSock(sock, secret)
        digest = hashlib.sha256(secret).digest()
        sig = sign_digest(priv, digest)
        hello = pack_str("btscan-p2p/1") + struct.pack("<I", PROTOCOL) + struct.pack("<IHH", 0, 0, 0) + pub + sig + CHAIN_ID + b"\x00"
        secure.send_message(HELLO, hello)
        peers = []
        asked = False
        hello_info = {}
        for _ in range(8):
            msg_type, payload = secure.read_message()
            if msg_type == HELLO:
                hello_info = parse_hello(payload)
            elif msg_type == REJECTED:
                record["error"] = "connection rejected"
                record["user_agent"] = hello_info.get("user_agent", "")
                return record
            elif msg_type == ACCEPTED:
                secure.send_message(ADDRESS_REQUEST, b"")
                asked = True
            elif msg_type == ADDRESS:
                peers = parse_addresses(payload)
                break
            elif asked:
                break
        record.update({
            "reachable": True,
            "user_agent": hello_info.get("user_agent", ""),
            "fc_git_revision": hello_info.get("fc_git_revision", ""),
            "platform": hello_info.get("platform", ""),
            "bitness": "" if hello_info.get("bitness", "") == "" else str(hello_info.get("bitness")),
            "head_block": hello_info.get("head_block"),
            "peers": peers,
        })
        return record
    except Exception as exc:
        record["error"] = f"{type(exc).__name__}: {exc}"
        return record
    finally:
        sock.close()


def resolve_seed(seed):
    host, port = seed.rsplit(":", 1)
    try:
        infos = socket.getaddrinfo(host, int(port), socket.AF_INET, socket.SOCK_STREAM)
    except socket.gaierror:
        return []
    return [(item[4][0], int(port), seed) for item in infos]


def geolocate(ips):
    found = {}
    batch = list(ips)
    for start in range(0, len(batch), 80):
        chunk = batch[start:start + 80]
        body = json.dumps([{"query": ip, "fields": "status,country,countryCode,city,as,query"} for ip in chunk]).encode()
        req = urllib.request.Request("http://ip-api.com/batch", data=body, headers={"Content-Type": "application/json"})
        try:
            rows = json.load(urllib.request.urlopen(req, timeout=30))
        except Exception:
            rows = []
        for row in rows:
            if row.get("status") == "success":
                found[row["query"]] = {
                    "country": row.get("country") or "",
                    "country_code": row.get("countryCode") or "",
                    "city": row.get("city") or "",
                    "asn": row.get("as") or "",
                }
    return found


def main():
    global CHAIN_ID, SEEDS, OUT, DEADLINE
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", choices=("mainnet", "testnet"), default="mainnet")
    args = parser.parse_args()
    if args.network == "testnet":
        CHAIN_ID = bytes.fromhex("39f5e2ede1f8bc1a3a54a7914414e3779e33193f1f5693510e73cb7a87617447")
        SEEDS = [
            "bts-testnet-seed1.abit-more.com:1779",
            "testnet-seed.xbts.io:1778",
        ]
        OUT = Path(__file__).resolve().parents[1] / "public" / "data" / "p2p-nodes-testnet.json"
    DEADLINE = time.time() + 180
    queue = []
    seen = set()
    for seed in SEEDS:
        for ip, port, via in resolve_seed(seed):
            key = f"{ip}:{port}"
            if key not in seen:
                seen.add(key)
                queue.append((ip, port, f"seed:{via}"))
    results = []
    index = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        pending = {}
        while (index < len(queue) or pending) and len(results) < MAX_NODES and time.time() < DEADLINE:
            while index < len(queue) and len(pending) < 6 and len(results) + len(pending) < MAX_NODES and time.time() < DEADLINE:
                ip, port, via = queue[index]
                index += 1
                pending[pool.submit(handshake, ip, port, via)] = (ip, port)
            if not pending:
                break
            done = next(as_completed(list(pending)))
            pending.pop(done)
            record = done.result()
            peers = record.pop("peers", [])
            results.append(record)
            if record["reachable"]:
                for peer in peers:
                    parts = peer["ip"].split(".")
                    private = (
                        not peer["ip"] or peer["port"] <= 0 or peer["ip"].startswith(("10.", "127.", "192.168.", "0.", "100.64."))
                        or (len(parts) == 4 and parts[0] == "172" and parts[1].isdigit() and 16 <= int(parts[1]) <= 31)
                    )
                    if private:
                        continue
                    key = f"{peer['ip']}:{peer['port']}"
                    if key in seen:
                        continue
                    seen.add(key)
                    queue.append((peer["ip"], peer["port"], record["ip"]))
    places = geolocate([row["ip"] for row in results])
    generated = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for row in results:
        row.update(places.get(row["ip"], {"country": "", "country_code": "", "city": "", "asn": ""}))
        if row["reachable"]:
            row["last_seen"] = generated
    reachable = [row for row in results if row["reachable"]]
    countries = sorted({row["country"] for row in results if row.get("country")})
    payload = {
        "generated_at": generated,
        "chain_id": CHAIN_ID.hex(),
        "seeds": SEEDS,
        "summary": {
            "discovered": len(results),
            "reachable": len(reachable),
            "countries": len(countries),
        },
        "nodes": results,
        "note": "P2P hello messages identify node keys, not witness accounts. Witness IPs elsewhere on this page come only from public URLs and the official seed list.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload["summary"]))
    print("errors", [row["error"] for row in results if row["error"]][:8])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
