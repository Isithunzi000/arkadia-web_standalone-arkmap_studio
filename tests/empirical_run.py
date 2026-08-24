#!/usr/bin/env python3
# empirical_run.py — runner CDP dla grup real-time (domyslnie E15).
#
# Po co CDP zamiast --dump-dom: E15 czeka na REALNY cykl service workera,
# ktory pod --virtual-time-budget gloduje na obciazonym hoscie (zawiechy CI
# 34af1db/a543243/ea33f85 — BRAK SUMMARY przy zerze FAIL-i asercji).
# --timeout z dump-dom NIE jest alternatywa: w nowym headless uzywa zegara
# wirtualnego (sonda 2026-08-24: timer 8 s "odpalil" w 1 s realnego).
# Ten runner: realny zegar, czeka na window.__EMPIRICAL_DONE__ (driver ma
# watchdog 90 s — domkniecie gwarantowane), potem drukuje outerHTML na stdout
# w formacie identycznym jak --dump-dom (grep R|/SUMMARY w empirical.sh
# dziala bez zmian). Modelowany na tests/perf/cdp_run.py (Arc 18).
#
# Uzycie:  python3 tests/empirical_run.py <url> [timeout_ms]
# Stdout:  outerHTML strony (jak --dump-dom); przy timeout/crash: nic + kod != 0.
# Kod wyjscia: 0 = DOM zwrocony, 2 = timeout, 3 = crash.
import asyncio, json, os, shutil, subprocess, sys, tempfile, time

import websockets

CHROME = os.environ.get('CHROMIUM_BIN', 'chromium')
TIMEOUT = int(sys.argv[2]) if len(sys.argv) > 2 else 150000

_HEADLESS = [] if 'headless-shell' in os.path.basename(CHROME) else ['--headless=new']
FLAGS = _HEADLESS + [
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    '--user-data-dir={ud}', 'about:blank',
]

async def main(url):
    ud = tempfile.mkdtemp(prefix='arkemp_')
    proc = subprocess.Popen(
        [CHROME] + [f.format(ud=ud) for f in FLAGS],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        port = None
        for _ in range(100):
            p = os.path.join(ud, 'DevToolsActivePort')
            if os.path.exists(p):
                port = int(open(p).readline().strip())
                break
            await asyncio.sleep(0.1)
        if port is None:
            print('brak DevToolsActivePort', file=sys.stderr); return 3

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
                    print('targetCrashed', file=sys.stderr); return 3
                try:
                    if await ev('window.__EMPIRICAL_DONE__ === true'):
                        html = await ev('document.documentElement.outerHTML')
                        if html:
                            print(html); return 0
                        print('pusty DOM po __EMPIRICAL_DONE__', file=sys.stderr); return 3
                except Exception:
                    pass
                await asyncio.sleep(0.25)
            print('timeout ' + str(TIMEOUT) + 'ms (watchdog drivera powinien odpalic pierwszy — sprawdz log)', file=sys.stderr)
            return 2
    except Exception as e:
        print(str(e)[:200], file=sys.stderr); return 3
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(ud, ignore_errors=True)

sys.exit(asyncio.run(main(sys.argv[1])))
