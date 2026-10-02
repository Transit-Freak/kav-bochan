#!/usr/bin/env python3
"""Publish verified historical data, replaying imports after concurrent writes.

Only generated line-history/data is staged. Never choose a conflict side or
force-push: after a conflict, rebuild the same source batch over current main.
"""
import json
import os
from pathlib import Path
import subprocess
import sys


def git(root, *args, check=True):
    return subprocess.run(['git', *args], cwd=root, check=check,
                          text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def publish(root, branch, replay, validate, attempts=3):
    changed = git(root, 'diff', 'HEAD', '--name-only').stdout.splitlines()
    if any(not p.startswith('line-history/data/') for p in changed):
        raise RuntimeError('Refusing to discard changes outside generated history data')
    git(root, 'add', '--', 'line-history/data')
    if not git(root, 'diff', '--cached', '--quiet', check=False).returncode:
        print('No data changes to publish', flush=True)
        return False
    for attempt in range(attempts):
        git(root, 'commit', '--quiet', '-m',
            'data: import recovered transport history with provenance')
        git(root, 'fetch', 'origin', branch)
        rebased = git(root, 'rebase', 'origin/' + branch, check=False)
        if not rebased.returncode:
            pushed = git(root, 'push', 'origin', 'HEAD:' + branch, check=False)
            if not pushed.returncode:
                print('Verified history published', flush=True)
                return True
            print(pushed.stderr, flush=True)
            # A new commit may have arrived between rebase and push.
            git(root, 'fetch', 'origin', branch)
            if git(root, 'rev-parse', 'HEAD').stdout == git(root, 'rev-parse', 'origin/' + branch).stdout:
                return True
        else:
            print('Concurrent history changes: replaying sources over latest branch', flush=True)
            git(root, 'rebase', '--abort')
        if attempt == attempts - 1:
            raise RuntimeError('Publication did not converge after bounded retries')
        # Only this ephemeral worker's committed outputs are discarded.
        # Source ZIPs are outside the worktree and remain available for replay.
        git(root, 'reset', '--hard', 'origin/' + branch)
        replay()
        validate()
        git(root, 'add', '--', 'line-history/data')
        if not git(root, 'diff', '--cached', '--quiet', check=False).returncode:
            print('Current branch already contains the verified batch', flush=True)
            return False
    raise AssertionError('unreachable')


def main():
    root = Path(__file__).resolve().parents[1]
    progress_path = 'line-history/data/early-progress.json'
    old = git(root, 'show', 'HEAD:' + progress_path, check=False)
    previous = json.loads(old.stdout).get('done', {}) if not old.returncode else {}
    current = json.loads((root / progress_path).read_text()).get('done', {})
    catalog = json.loads((root / 'line-history/data/early-sources.json').read_text())['snapshots']
    batch = [s['id'] for s in catalog if s['id'] in current and s['id'] not in previous]
    def run(script, *args, check=True):
        return subprocess.run([sys.executable, 'tools/' + script, *args], cwd=root, check=check)
    def replay():
        run('import_early_rail.py')
        for sid in batch:
            run('import_early_history.py', '--only', sid, '--max-minutes', '15', check=False)
            latest = json.loads((root / progress_path).read_text())
            if sid not in latest.get('done', {}):
                raise RuntimeError('Replay failed for ' + sid)
        for script in ('link_early_2012.py', 'mark_archive_gone.py', 'rebuild_lines_index.py',
                       'build_archive_months.py', 'schedule_diff.py'):
            run(script)
    def validate():
        run('check_early_history.py')
        subprocess.run(['node', 'tools/check_early_history_ui.mjs'], cwd=root, check=True)
    git(root, 'config', 'user.name', 'historical-data-bot')
    git(root, 'config', 'user.email', 'actions@users.noreply.github.com')
    publish(root, os.environ.get('WORK_BRANCH', 'main'), replay, validate)


if __name__ == '__main__':
    main()
