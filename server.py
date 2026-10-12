"""손금 운세 로컬 서버 (Python 표준 라이브러리만 사용).

site/ 폴더만 정적 파일로 제공하고, API 키가 있으면 AI 사진 분석(/api/analyze)을 켠다.
해석 자체는 브라우저(site/engine.js)에서 하므로 GitHub Pages에서는 이 서버 없이 동작한다.

실행: python server.py  →  http://localhost:8000
"""
import base64
import binascii
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"
MAX_BODY = 8 * 1024 * 1024  # 사진 업로드 한도 8MB
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def load_env():
    """palm_app/.env와 상위 폴더 .env에서 키를 읽는다. 이미 설정된 환경변수가 우선."""
    for env in (ROOT / ".env", ROOT.parent / ".env"):
        if not env.exists():
            continue
        for line in env.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_env()

import vision  # noqa: E402


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("사진이 너무 커요. 8MB 이하로 올려 주세요.")
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        if self.path == "/api/config":
            return self.send_json(200, {"ai": vision.enabled()})
        return super().do_GET()

    def do_POST(self):
        try:
            data = self.read_json()
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "잘못된 요청입니다."})
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})

        if self.path == "/api/analyze":
            if not vision.enabled():
                return self.send_json(503, {"error": "AI 분석이 꺼져 있어요. 직접 선택해 주세요."})
            image = data.get("image") or ""
            try:
                header, b64 = image.split(",", 1)
                media_type = header.removeprefix("data:").split(";")[0]
                if media_type not in IMAGE_TYPES:
                    raise ValueError
                base64.b64decode(b64, validate=True)
            except (ValueError, binascii.Error):
                return self.send_json(400, {"error": "JPG나 PNG 사진을 올려 주세요."})
            try:
                # 사진은 분석에만 쓰고 저장하지 않는다
                return self.send_json(200, vision.analyze(b64, media_type))
            except Exception as e:  # noqa: BLE001 - 어떤 실패든 수동 선택으로 넘어가게 한다
                print(f"[analyze] {type(e).__name__}: {e}", file=sys.stderr)
                msg = str(e) if isinstance(e, RuntimeError) else "AI 분석에 실패했어요. 직접 선택해 주세요."
                return self.send_json(502, {"error": msg})

        return self.send_json(404, {"error": "없는 주소입니다."})


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    mode = "AI 분석 켜짐" if vision.enabled() else "직접 선택 모드 (AI 분석 꺼짐)"
    print(f"손금 운세 서비스: http://localhost:{port}  [{mode}]")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
