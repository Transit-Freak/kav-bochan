#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""השדות כפי שהאתר מציג אותם — אותו מיזוג כמו ב-app.js (combinedFields): השדות המובנים (structured-tenders.json),
אחריהם שדות מאומתים מהסיכומים האוטומטיים ומהסקירות של המסמכים העדכניים, ורק אז החוקים מסעיפי המסמך
(fields-rules.json) לשדות שלא אומתו במקום אחר. משמש את הצילומים (snip_fields), הביקורת (audit_snips) והפאנל."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERIFIED = ('verified', 'verified_conditional')


def _read(name, default):
    p = ROOT / name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default


def load():
    return {
        'packages': _read('packages-state.json', {'tenders': {}}).get('tenders', {}),
        'structured': _read('structured-tenders.json', {}),
        'auto': _read('automatic-summaries.json', {'tenders': {}}).get('tenders', {}),
        'sem': _read('semantic-reviews.json', {'tenders': {}}).get('tenders', {}),
        'rules': _read('fields-rules.json', {'tenders': {}}).get('tenders', {}),
    }


def is_verified(f):
    return bool(f) and f.get('status') in VERIFIED


def _current_docs(data, tid, coll):
    docs = coll.get(tid, {}).get('documents', {})
    pkg = data['packages'].get(tid, {}).get('documents', {})
    return [d for k, d in docs.items() if pkg.get(k, {}).get('sha256') == d.get('sha256')]


def combined_fields(data, tid):
    fields = dict(data['structured'].get(tid, {}))
    docs = [{'fields': data['auto'].get(tid, {}).get('metadataFields', {})}] + _current_docs(data, tid, data['auto']) + _current_docs(data, tid, data['sem'])
    for d in docs:
        for key, f in (d.get('fields') or {}).items():
            if not is_verified(f):
                continue
            old = fields.get(key)
            if not is_verified(old):
                if (old or {}).get('status') != 'conflict':
                    fields[key] = f
                continue
            if json.dumps(old.get('value'), ensure_ascii=False) != json.dumps(f.get('value'), ensure_ascii=False) and old.get('status') == 'verified' and f.get('status') == 'verified':
                fields[key] = {**old, 'status': 'conflict', 'value': None}
    for key, f in data['rules'].get(tid, {}).items():
        if not is_verified(fields.get(key)) and (fields.get(key) or {}).get('status') != 'conflict':
            fields[key] = f
    return fields


def all_tender_ids(data):
    return sorted(set(data['rules']) | set(data['structured']) | set(data['auto']) | set(data['sem']))


def source_of(f):
    """המקור הראשון עם עמוד: של השדה, או של התנאי הראשון בשדה מותנה."""
    for s in f.get('sources') or []:
        if '#page=' in (s.get('url') or ''):
            return s
    for c in f.get('conditions') or []:
        for s in c.get('sources') or []:
            if '#page=' in (s.get('url') or ''):
                return s
    return None
