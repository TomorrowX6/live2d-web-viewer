#!/usr/bin/env python3
"""Tiny static server for the Live2D Web Viewer.

The app uses ES modules, fetch() and WebGL textures, so it must be served over
http:// (opening index.html via file:// will not work). Run:

    python serve.py            # serves on http://127.0.0.1:8000
    python serve.py 8080       # custom port
"""
import sys
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".wasm": "application/wasm",
        ".moc": "application/octet-stream",
        ".moc3": "application/octet-stream",
        ".lpk": "application/octet-stream",
        ".bin3": "application/octet-stream",
        ".png": "image/png",
        ".webp": "image/webp",
    }

    def end_headers(self):
        # dev: never cache, so edits show up immediately
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("  · " + (fmt % args) + "\n")


def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    handler = partial(Handler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://127.0.0.1:{port}/"
    print("=" * 54)
    print("  Live2D Web Viewer")
    print(f"  Serving {ROOT}")
    print(f"  ->  {url}")
    print("  Press Ctrl+C to stop.")
    print("=" * 54)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
