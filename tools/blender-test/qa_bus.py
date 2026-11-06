"""בדיקת איכות לאוטובוס (blender-asset-qa של blender-skills, MIT): עצמים מרחפים, חפיפות, נורמלים הפוכים."""
import bpy, os, sys, json
sys.path.insert(0, os.environ['SK'] + '/blender-asset-qa/scripts')
import qa_check
objs = [o.name for o in bpy.data.objects if o.type in ('MESH', 'CURVE') and not o.name.startswith(('ENV_', 'Cut_')) and not o.hide_render]
r = qa_check.run(objects=objs, profile='render', max_tris=4000000, uv=False)
print('QA pass', r.get('pass'), 'errors', len(r.get('errors', [])), 'warnings', len(r.get('warnings', [])))
for e in r.get('errors', [])[:40]: print('QA E', str(e)[:220])
for w in r.get('warnings', [])[:40]: print('QA W', str(w)[:220])
