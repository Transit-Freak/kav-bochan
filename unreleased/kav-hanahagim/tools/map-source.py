"""Resolve an available, style-compatible archive from Protomaps' build catalog."""
import json
import os
import re
import subprocess
from pathlib import Path

CATALOG = 'https://build-metadata.protomaps.dev/builds.json'
BASE = 'https://build.protomaps.com/'
# Official app/src/utils.ts: tile schema 4 supports styles 4 and 5 (ours: 5.7.2).
def select_build(rows, available):
    candidates = sorted((r for r in rows if isinstance(r, dict)
        and re.fullmatch(r'\d{8}\.pmtiles', str(r.get('key', '')))
        and re.fullmatch(r'4\.\d+\.\d+', str(r.get('version', '')))),
        key=lambda r: r['key'], reverse=True)
    for row in candidates:
        if available(BASE + row['key']):
            return {**row, 'url': BASE + row['key'], 'catalog': CATALOG}
    raise RuntimeError('No available schema-4 Protomaps archive; refusing an incompatible map')

def available(url):
    status = subprocess.check_output(['curl', '-sSLI', '--retry', '3', '--max-time', '30',
        '-o', os.devnull, '-w', '%{http_code}', url], text=True).strip()
    if status in ('404', '410'):
        return False
    if status != '200':
        raise RuntimeError('Archive availability check returned HTTP ' + status)
    return True

def main():
    rows = json.loads(subprocess.check_output(['curl', '-fsSL', '--retry', '3',
        '--max-time', '30', CATALOG], text=True))
    build = select_build(rows, available)
    Path('maps').mkdir(exist_ok=True)
    Path('maps/source.json').write_text(json.dumps(build, indent=2) + '\n')
    print('Selected map:', build['key'], 'schema', build['version'])
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('key=' + build['key'] + '\nurl=' + build['url'] + '\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('Map archive: `' + build['key'] + '`; tile schema `' + build['version'] + '`.\n')

if __name__ == '__main__':
    main()
