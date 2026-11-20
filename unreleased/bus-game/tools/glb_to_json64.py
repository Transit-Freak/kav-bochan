# יוצר X.glb64.json ליד כל X.glb (הדגם כ-base64 בתוך JSON), לתצוגה הפרטית שלא מגישה glb וחוסמת כתובות data:
import base64, json, sys
for p in sys.argv[1:]:
    out = p[:-4] + '.glb64.json'
    json.dump({'glb': base64.b64encode(open(p, 'rb').read()).decode()}, open(out, 'w'))
    print(out)
