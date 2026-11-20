"""Прокладка для запросов к Keitaro: сама читает креды из корневого .env, наружу их не выводит.

    python kproxy.py login                              # вход в админку, cookie -> tools/.session/ (в git не попадает)
    python kproxy.py admin "campaigns.list"             # внутренний API админки: /admin/?object=...
    python kproxy.py admin "campaigns.list" -d '{"x":1}'
    python kproxy.py api GET /campaigns                 # Admin API v1 (нужен KEITARO_API_KEY в .env)
    python kproxy.py api GET /campaigns -o samples/campaigns.json

Пишущие запросы (не-GET в Admin API, не-читающие методы админки) блокируются без --write.
"""

import argparse
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = ROOT / '.env'
COOKIES_PATH = Path(__file__).resolve().parent / '.session' / 'cookies.txt'
SECRET_KEYS = ('KEITARO_LOGIN', 'KEITARO_PASSWORD', 'KEITARO_API_KEY')
# Поля ответов, которые не должны попасть в samples/ (токены Click API, ключи)
REDACT_FIELDS = {'token', 'api_key', 'password', 'secret'}
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
READ_PREFIXES = ('get', 'list', 'show', 'find', 'search', 'load', 'count', 'info', 'all', 'index', 'deleted',
                 'filters', 'costtypes', 'definition', 'statsfor', 'build', 'currentaccess', 'griddefinition',
                 'withstats', 'parameteraliases')


def load_env():
    env = {}
    for line in ENV_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip().removeprefix('export ').strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        env[key] = value
    return env


ENV = load_env()


def mask(text):
    for key in SECRET_KEYS:
        value = ENV.get(key)
        if value:
            text = text.replace(value, '***')
    return text


def base_url():
    url = ENV['KEITARO_URL'].rstrip('/')
    if '://' not in url:
        url = 'https://' + url
    parts = urllib.parse.urlsplit(url)
    return f'{parts.scheme}://{parts.netloc}'


def opener():
    jar = http.cookiejar.MozillaCookieJar(COOKIES_PATH)
    if COOKIES_PATH.exists():
        jar.load(ignore_discard=True, ignore_expires=True)
    return jar, urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(method, url, body=None, headers=None):
    jar, op = opener()
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    # Cloudflare перед инстансом банит дефолтный Python-urllib User-Agent (error 1010)
    req.add_header('User-Agent', USER_AGENT)
    req.add_header('Accept', 'application/json')
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with op.open(req, timeout=30) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    COOKIES_PATH.parent.mkdir(exist_ok=True)
    jar.save(ignore_discard=True, ignore_expires=True)
    return status, raw.decode('utf-8', errors='replace')


def login():
    request('GET', base_url() + '/admin/')
    creds = {'login': ENV['KEITARO_LOGIN'], 'password': ENV['KEITARO_PASSWORD']}
    return request('POST', base_url() + '/admin/?object=auth.login', creds)


def is_read_method(obj):
    method = obj.split('.', 1)[-1].lower()
    return method.startswith(READ_PREFIXES)


def redact(node):
    if isinstance(node, dict):
        return {k: '***' if k in REDACT_FIELDS and node[k] else redact(v) for k, v in node.items()}
    if isinstance(node, list):
        return [redact(v) for v in node]
    return node


def output(status, text, out):
    try:
        text = json.dumps(redact(json.loads(text)), ensure_ascii=False, indent=2)
    except ValueError:
        pass
    text = mask(text)
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(text, encoding='utf-8')
        print(f'HTTP {status}, {len(text)} chars -> {out}')
    else:
        print(f'HTTP {status}')
        print(text)
    return 0 if status < 400 else 1


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('login')
    a = sub.add_parser('admin')
    a.add_argument('object', help='например campaigns.list')
    a.add_argument('-q', '--query', default='', help='доп. query-параметры: a=1&b=2')
    api = sub.add_parser('api')
    api.add_argument('method')
    api.add_argument('path', help='например /campaigns или /groups?type=campaigns')
    for s in (a, api):
        s.add_argument('-d', '--data', help='JSON-тело')
        s.add_argument('-o', '--out', help='сохранить ответ в файл')
        s.add_argument('--write', action='store_true', help='разрешить пишущий запрос')
    args = p.parse_args()

    if args.cmd == 'login':
        status, text = login()
        return output(status, text, None)

    body = json.loads(args.data) if args.data else None
    if args.cmd == 'admin':
        if not args.write and not is_read_method(args.object):
            sys.exit(f'Blocked: {args.object} looks like a write method, add --write')
        query = urllib.parse.urlencode({'object': args.object}) + (f'&{args.query}' if args.query else '')
        status, text = request('POST' if body is not None else 'GET', f'{base_url()}/admin/?{query}', body)
        return output(status, text, args.out)

    method = args.method.upper()
    if method != 'GET' and not args.write:
        sys.exit(f'Blocked: {method} is a write request, add --write')
    key = ENV.get('KEITARO_API_KEY')
    if not key:
        sys.exit('KEITARO_API_KEY is not set in .env')
    url = base_url() + '/admin_api/v1/' + args.path.lstrip('/')
    status, text = request(method, url, body, {'Api-Key': key})
    return output(status, text, args.out)


if __name__ == '__main__':
    sys.exit(main())
