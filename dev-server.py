#!/usr/bin/env python3
"""Dev-server med no-cache headers, så browseren altid henter den nyeste version af modulerne."""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
    print(f'Dev-server på http://localhost:{PORT} (no-cache)')
    httpd.serve_forever()
