#!/usr/bin/env python3
"""Reapply cached website observations over current main after a concurrent write."""
import sys,subprocess,pathlib,shutil,os
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from publish_early_history import publish,git

def main():
    root=pathlib.Path(__file__).resolve().parents[1]
    cache=root/'line-history/data/website-cache'
    replay_cache=pathlib.Path('/tmp/website-replay')
    shutil.copytree(cache,replay_cache,dirs_exist_ok=True)
    def run(script,*args):
        subprocess.run([sys.executable,'tools/'+script,*args],cwd=root,check=True)
    def replay():
        run('import_website_history.py','--catalog-dir','line-history/data/website-catalogs','--cache-dir',str(replay_cache),'--cache-only')
        shutil.copytree(replay_cache,cache,dirs_exist_ok=True)
        run('rebuild_lines_index.py');run('build_archive_months.py')
    def validate():
        run('check_early_history.py','--websites-only');run('repair_noop_events.py');run('repair_legacy_diffs.py','--all','--apply');run('check_history_claims.py')
        subprocess.run(['node','tools/check_website_history_ui.mjs'],cwd=root,check=True)
    git(root,'config','user.name','historical-website-bot')
    git(root,'config','user.email','actions@users.noreply.github.com')
    published=publish(root,'main',replay,validate)
    if published and os.environ.get('GITHUB_REPOSITORY'):
        subprocess.run(['gh','api','--method','POST','repos/'+os.environ['GITHUB_REPOSITORY']+'/pages/builds'],cwd=root,check=True,stdout=subprocess.DEVNULL)
        print('Requested public Pages rebuild for verified data',flush=True)

if __name__=='__main__':main()
