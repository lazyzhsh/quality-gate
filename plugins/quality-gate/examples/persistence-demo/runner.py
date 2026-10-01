"""Real HTTP -> committed SQLite -> independent readback, stdlib only."""
import json
import sqlite3
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from contextlib import closing


def main():
    payload = json.load(sys.stdin)
    run_id = payload['runId']
    mode = sys.argv[1] if len(sys.argv) > 1 else 'normal'
    if mode not in ('normal', 'wrong-value', 'missing-row', 'duplicate', 'rejected'):
        raise ValueError('Unknown fault mode')
    with tempfile.TemporaryDirectory(prefix='qgate-persistence-') as tmp:
        db = Path(tmp) / 'orders.sqlite'
        with closing(sqlite3.connect(db)) as conn, conn:
            conn.execute('CREATE TABLE orders (id TEXT PRIMARY KEY, amount_minor INTEGER, currency TEXT, note TEXT)')

        def snapshot():
            reader = sqlite3.connect(f'{db.as_uri()}?mode=ro', uri=True)
            try:
                reader.row_factory = sqlite3.Row
                rows = reader.execute('SELECT id, amount_minor, currency, note FROM orders WHERE id=?', (run_id,)).fetchall()
                return {'recordCount': len(rows), 'record': dict(rows[0]) if rows else None}
            finally:
                reader.close()

        before = snapshot()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_POST(self):
                if self.path != '/orders':
                    self.send_error(404)
                    return
                order = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                if order['amount_minor'] < 0:
                    body = json.dumps({'id': order['id'], 'error': 'invalid amount'}).encode()
                    self.send_response(422)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if mode != 'missing-row':
                    amount = order['amount_minor'] if mode in ('normal', 'duplicate', 'rejected') else order['amount_minor'] + 1
                    # INSERT OR IGNORE 使同一 id 的重复提交保持幂等（duplicate 模式验证这一点）
                    with closing(sqlite3.connect(db)) as writer, writer:
                        writer.execute('INSERT OR IGNORE INTO orders VALUES (?, ?, ?, ?)',
                                       (order['id'], amount, order['currency'], order['note']))
                # Respond only after the transaction commits; HTTP body is not DB evidence.
                body = json.dumps({'id': order['id'], 'accepted': True}).encode()
                self.send_response(201)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/orders'
            payload = {'id': run_id, 'amount_minor': 1250, 'currency': 'CNY', 'note': None}
            if mode == 'rejected':
                payload = {**payload, 'amount_minor': -1}

            def send():
                request = urllib.request.Request(url, method='POST', headers={'Content-Type': 'application/json'},
                                                 data=json.dumps(payload).encode())
                # Bypass proxy configuration for the local fixture only.
                try:
                    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=3) as response:
                        status = response.status
                        response.read()
                        return status
                except urllib.error.HTTPError as error:
                    error.read()
                    return error.code

            status = send()
            if mode == 'duplicate':
                # 同一 id 重复提交：幂等写入后仍应只有一条记录
                status = send()
            after = snapshot()
            print(json.dumps({'schemaVersion': '0.1', 'runId': run_id,
                              'request': {'method': 'POST', 'url': url, 'status': status},
                              'persistence': {'source': 'sqlite:temporary/orders; committed read-only connection',
                                              'recordCount': after['recordCount'], 'record': after['record']},
                              'snapshots': {'before': before, 'after': after}}))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == '__main__':
    main()
