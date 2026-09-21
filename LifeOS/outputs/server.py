"""Run LifeOS locally with Python's standard library."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json
import threading
import webbrowser

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_env_file():
    values = {}
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return values
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        values[name.strip()] = value.strip().strip('"').strip("'")
    return values


ENV = load_env_file()


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] in ("/supabase-config.js", "/api/supabase-config"):
            payload = (
                "window.LIFEOS_SUPABASE_CONFIG = "
                + json.dumps({
                    "url": ENV.get("SUPABASE_URL", ""),
                    "key": ENV.get("SUPABASE_PUBLISHABLE_KEY", ""),
                })
                + ";"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path == "/":
            self.path = "/lifeos.html"
        super().do_GET()


def main():
    parser = argparse.ArgumentParser(description="LifeOS local web preview")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    folder = Path(__file__).resolve().parent
    handler = partial(Handler, directory=str(folder))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as exc:
        print(f"Could not start server: {exc}")
        print("Try another port: python server.py --port 8766")
        return 1
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"LifeOS is available at {url}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
