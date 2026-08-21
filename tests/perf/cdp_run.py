#!/usr/bin/env python3
# cdp_run.py — launcher perf-drivera przez Chrome DevTools Protocol (Arc 18).
#
# Po co CDP zamiast --dump-dom: --dump-dom bez virtual-time-budget zrzuca DOM
# od razu po evencie load, nie czekajac na asynchroniczny scenariusz. CDP
# pozwala CZEKAC AZ window.__PERF_DONE__ (realny zegar, zero sztucznych
# timeoutow) i wykryc crash targetu (Inspector.targetCrashed / zamkniecie WS).
#
# Uzycie:  python3 tests/perf/cdp_run.py <url> [timeout_ms]
# Stdout:  jedna linia PERFJSON|{...} / PERFERR|... / PERFTIMEOUT / PERFCRASH
# Kod wyjscia: 0 = PERFJSON, 1 = PERFERR, 2 = timeout, 3 = crash.
import asyncio, json, os, shutil, subprocess, sys, tempfile, time

import websockets

CHROME = os.environ.get('CHROMIUM_BIN', 'chromium')
TIMEOUT = int(sys.argv[2]) if len(sys.argv) > 2 else 120000

# chrome-headless-shell JEST juz headless (flaga --headless=new jest dla zwyklego
# chromium; headless-shell moze jej nie przyjmowac) — wykrywamy po nazwie binarki.
_HEADLESS = [] if 'headless-shell' in os.path.basename(CHROME) else ['--headless=new']
FLAGS = _HEADLESS + [
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--enable-precise-memory-info', '--remote-debugging-port=0',
    '--user-data-dir={ud}', 'about:blank',
]

async def main(url):
    ud = tempfile.mkdtemp(prefix='arkperf_')
    proc = subprocess.Popen(
        [CHROME] + [f.format(ud=ud) for f in FLAGS],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        # port debugowania z pliku DevToolsActivePort
        port = None
        for _ in range(100):
            p = os.path.join(ud, 'DevToolsActivePort')
            if os.path.exists(p):
                port = int(open(p).readline().strip())
                break
            await asyncio.sleep(0.1)
        if port is None:
            print('PERFERR|brak DevToolsActivePort'); return 1

        import urllib.request
        ver = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version'))
        async with websockets.connect(ver['webSocketDebuggerUrl'], max_size=64 * 1024 * 1024) as ws:
            mid = 0
            crashed = [False]

            async def send(method, params=None, session=None):
                nonlocal mid
                mid += 1
                msg = {'id': mid, 'method': method, 'params': params or {}}
                if session:
                    msg['sessionId'] = session
                await ws.send(json.dumps(msg))
                while True:
                    raw = json.loads(await ws.recv())
                    if raw.get('method') == 'Inspector.targetCrashed':
                        crashed[0] = True
                    if raw.get('id') == mid:
                        return raw

            t = await send('Target.createTarget', {'url': url})
            tid = t['result']['targetId']
            at = await send('Target.attachToTarget', {'targetId': tid, 'flatten': True})
            sess = at['result']['sessionId']
            await send('Runtime.enable', session=sess)
            await send('Inspector.enable', session=sess)

            async def ev(expr):
                r = await send('Runtime.evaluate', {'expression': expr, 'returnByValue': True}, session=sess)
                return r.get('result', {}).get('result', {}).get('value')

            deadline = time.time() + TIMEOUT / 1000
            while time.time() < deadline:
                if crashed[0]:
                    print('PERFCRASH|targetCrashed'); return 3
                try:
                    if await ev('window.__PERF_DONE__ === true'):
                        txt = await ev("document.getElementById('out') ? document.getElementById('out').textContent : ''")
                        if txt and txt.startswith('PERFJSON|'):
                            print(txt); return 0
                        print(txt if txt else 'PERFERR|puste wyjscie drivera'); return 1
                except Exception:
                    pass
                await asyncio.sleep(0.25)
            print('PERFTIMEOUT|' + str(TIMEOUT) + 'ms'); return 2
    except Exception as e:
        print('PERFCRASH|' + str(e)[:200]); return 3
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(ud, ignore_errors=True)

sys.exit(asyncio.run(main(sys.argv[1])))
