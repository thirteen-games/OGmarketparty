"""Dev server: python serve.py [port]. Like http.server but sends no-store
so the browser never caches stale CSS/JS modules during development."""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    print(f'Serving Market Party at http://localhost:{port} (caching disabled)')
    HTTPServer(('', port), NoCacheHandler).serve_forever()
