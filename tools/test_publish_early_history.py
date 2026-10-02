import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import publish_early_history as m


class PublicationTest(unittest.TestCase):
    def setup_repo(self, directory):
        root = Path(directory)
        remote, work, other = root/'remote.git', root/'work', root/'other'
        subprocess.run(['git','init','--bare','-q','-b','main',str(remote)],check=True)
        subprocess.run(['git','clone','-q',str(remote),str(work)],check=True)
        for path in (work,):
            m.git(path,'config','user.name','test')
            m.git(path,'config','user.email','test@example.invalid')
        data = 'line-history/data/lines/1.json'
        (work/data).parent.mkdir(parents=True)
        (work/data).write_text(json.dumps({'versions':['base']}))
        (work/'parks').mkdir()
        (work/'parks/index.html').write_text('unchanged')
        m.git(work,'add','.');m.git(work,'commit','-qm','base');m.git(work,'push','origin','main')
        subprocess.run(['git','clone','-q',str(remote),str(other)],check=True)
        m.git(other,'config','user.name','test');m.git(other,'config','user.email','test@example.invalid')
        return remote,work,other,data

    def test_conflict_replays_over_latest_and_preserves_both_updates(self):
        with tempfile.TemporaryDirectory() as directory:
            remote,work,other,data = self.setup_repo(directory)
            (work/data).write_text(json.dumps({'versions':['base','historical']}))
            (other/data).write_text(json.dumps({'versions':['base','modern']}))
            m.git(other,'add',data);m.git(other,'commit','-qm','concurrent');m.git(other,'push','origin','main')
            calls = []
            def replay():
                calls.append('replay')
                current = json.loads((work/data).read_text())
                current['versions'].append('historical')
                (work/data).write_text(json.dumps(current))
            def validate():
                self.assertEqual(json.loads((work/data).read_text())['versions'],
                                 ['base','modern','historical'])
            self.assertTrue(m.publish(work,'main',replay,validate))
            self.assertEqual(calls,['replay'])
            m.git(other,'pull','--ff-only')
            self.assertEqual(json.loads((other/data).read_text())['versions'],
                             ['base','modern','historical'])
            self.assertEqual((other/'parks/index.html').read_text(),'unchanged')

    def test_unrelated_update_rebases_without_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            remote,work,other,data = self.setup_repo(directory)
            (work/data).write_text(json.dumps({'versions':['base','historical']}))
            (other/'README.md').write_text('concurrent unrelated update')
            m.git(other,'add','README.md');m.git(other,'commit','-qm','unrelated');m.git(other,'push','origin','main')
            def unexpected():
                self.fail('Replay should not be needed')
            self.assertTrue(m.publish(work,'main',unexpected,unexpected))
            self.assertEqual((work/'README.md').read_text(),'concurrent unrelated update')

    def test_outside_changes_are_not_discarded(self):
        with tempfile.TemporaryDirectory() as directory:
            remote,work,other,data = self.setup_repo(directory)
            (work/'parks/index.html').write_text('new parks work')
            with self.assertRaisesRegex(RuntimeError,'outside'):
                m.publish(work,'main',lambda:None,lambda:None)
            self.assertEqual((work/'parks/index.html').read_text(),'new parks work')


if __name__ == '__main__':
    unittest.main()
