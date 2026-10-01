#!/usr/bin/env python3
"""Refresh the official public-vehicle registry; preserve the cache on failure."""
import csv
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import time
import urllib.parse
import urllib.request

RESOURCE = 'cf29862d-ca25-4691-84f6-1be60dcb4a1e'
DIRECTORY = Path(os.environ.get('REGISTRY_DIR', 'fleet/data'))
REQUIRED = {'mispar_rechev', 'tokef_dt', 'sug_rechev_nm', 'shnat_yitzur'}


def fetch(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0', 'Accept': '*/*'})
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def validate(payload, previous_count=0):
    reader = csv.DictReader(io.StringIO(payload.decode('utf-8-sig')), delimiter='|')
    if not REQUIRED.issubset(reader.fieldnames or []):
        raise ValueError('Registry columns changed; existing data retained')
    plates = set()
    for row in reader:
        plate = str(row.get('mispar_rechev') or '').strip().lstrip('0')
        if not plate.isdigit():
            raise ValueError('Invalid vehicle number; existing data retained')
        expiry = str(row.get('tokef_dt') or '').strip()
        if expiry and expiry != 'NULL':
            datetime.date.fromisoformat(expiry)
        plates.add(plate)
    if len(plates) < max(10000, int(previous_count * .8)):
        raise ValueError('Registry unexpectedly incomplete; existing data retained')
    return len(plates)


def datastore_csv():
    """Official API fallback when the downloadable file is unavailable."""
    rows, fields, expected = [], None, None
    for offset in range(0, 500000, 5000):
        url = 'https://data.gov.il/api/3/action/datastore_search?' + urllib.parse.urlencode({
            'resource_id': RESOURCE, 'limit': 5000, 'offset': offset, 'sort': '_id asc'})
        response = json.loads(fetch(url))
        if not response.get('success'):
            raise ValueError('Official datastore request failed')
        result = response['result']
        if fields is None:
            fields = [f['id'] for f in result['fields'] if f['id'] != '_id']
            expected = result['total']
        if result['total'] != expected:
            raise ValueError('Registry changed during pagination; retry next run')
        batch = result['records']
        rows.extend(batch)
        if len(rows) >= expected:
            break
        if not batch:
            raise ValueError('Incomplete registry pagination')
    if len(rows) != expected:
        raise ValueError('Registry row count mismatch')
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, delimiter='|', extrasaction='ignore')
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode('utf-8')


def main():
    metadata_path = DIRECTORY / 'gov-registry-source.json'
    previous = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    url = 'https://data.gov.il/api/3/action/resource_show?' + urllib.parse.urlencode({'id': RESOURCE})
    result = json.loads(fetch(url))
    if not result.get('success') or result['result'].get('id') != RESOURCE:
        raise ValueError('Unexpected registry metadata')
    resource = result['result']
    source_date = resource.get('last_modified')
    if not source_date:
        raise ValueError('Missing source date; existing data retained')
    datetime.datetime.fromisoformat(source_date)
    if previous.get('last_modified', '') > source_date:
        raise ValueError('Source date regressed; existing data retained')
    download_url = resource['url']
    parsed = urllib.parse.urlparse(download_url)
    if parsed.scheme != 'https' or parsed.hostname not in {'data.gov.il', 'e.data.gov.il'}:
        raise ValueError('Unexpected official download host')
    method = 'download'
    try:
        payload = fetch(download_url)
        count = validate(payload, previous.get('rows', 0))
    except Exception as error:
        print(f'Download unavailable ({type(error).__name__}); trying official datastore')
        method = 'datastore_search'
        payload = datastore_csv()
        count = validate(payload, previous.get('rows', 0))
    digest = hashlib.sha256(payload).hexdigest()
    metadata = {'resource_id': RESOURCE, 'url': download_url,
                'last_modified': source_date, 'sha256': digest, 'rows': count,
                'method': method}
    path = DIRECTORY / (RESOURCE + '.csv')
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == digest and previous == metadata:
        print('Official registry unchanged')
        return
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    # Both files are staged only after the complete download has passed validation.
    temporary_csv = path.with_suffix('.csv.tmp')
    temporary_meta = metadata_path.with_suffix('.json.tmp')
    temporary_csv.write_bytes(payload)
    temporary_meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    os.replace(temporary_csv, path)
    os.replace(temporary_meta, metadata_path)
    print(f'Official registry refreshed: {source_date}, {count} vehicles')


if __name__ == '__main__':
    main()
