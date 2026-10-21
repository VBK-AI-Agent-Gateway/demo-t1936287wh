#!/usr/bin/env python3
"""Upload files to GitHub repo app-6287wh/ via Contents API (create or update)."""
import json, base64, os, sys, urllib.request

TOKEN = open('/ws/.secrets/github_pat').read().strip()
REPO = 'VBK-AI-Agent-Gateway/demo-t1936287wh'
BRANCH = 'main'
DIR = 'app-6287wh'
LOCAL = '/ws/demo-t1936287wh/' + DIR

def api(method, path, payload=None):
    req = urllib.request.Request(
        'https://api.github.com/repos/' + REPO + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            'Authorization': 'token ' + TOKEN,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
        }, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())

def get_sha(path):
    d = api('GET', '/contents/' + path + '?ref=' + BRANCH)
    return d.get('sha') if isinstance(d, dict) and 'sha' in d else None

ok, fail = [], []
for name in sorted(os.listdir(LOCAL)):
    p = DIR + '/' + name
    content = base64.b64encode(open(os.path.join(LOCAL, name), 'rb').read()).decode()
    sha = get_sha(p)
    payload = {'message': 'deploy %s' % p, 'content': content, 'branch': BRANCH}
    if sha:
        payload['sha'] = sha
    d = api('PUT', '/contents/' + p, payload)
    if 'content' in d:
        ok.append(name)
    else:
        fail.append((name, str(d)[:160]))

print('OK:', ok, flush=True)
print('FAIL:', fail, flush=True)
sys.exit(1 if fail else 0)