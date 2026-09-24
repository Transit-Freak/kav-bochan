#!/usr/bin/env python3
"""Preserve all 2013/2014 railway records, deduplicating identical archive members.
Schema verified against OpenTrainCommunity src/bolts.py at pinned commit.
Raw zero time values remain zero: they are not assumed to mean midnight.
"""
import collections,csv,gzip,hashlib,io,json,os,tarfile,tempfile
from pathlib import Path
from import_early_history import download,write
ROOT=Path(__file__).resolve().parents[1]
BASE='https://raw.githubusercontent.com/hasadna/OpenTrainCommunity/8dd9ba7b3ebed022469723df6974b27bf2c5577d/data/'
SOURCES=[{'year':2013,'url':BASE+'2013.tar.gz'},{'year':2014,'url':BASE+'2014-01Jan-to-10Aug.tar.gz'}]

def main():
    out=ROOT/'line-history/data/early-rail';out.mkdir(parents=True,exist_ok=True)
    if (out/'index.json').exists():return
    byday=collections.defaultdict(list);hashes=set();skipped=[];records=0
    with tempfile.TemporaryDirectory() as tmp:
        for s in SOURCES:
            local=Path(os.environ.get('EARLY_RAIL_LOCAL',tmp))/('rail'+str(s['year'])+'.tar.gz')
            if not local.exists():download(s['url'],local)
            with tarfile.open(local) as tar:
                for member in tar:
                    if not member.isfile():continue
                    raw=tar.extractfile(member).read();sha=hashlib.sha256(raw).hexdigest()
                    if sha in hashes:skipped.append(member.name);continue
                    hashes.add(sha)
                    text = raw.decode('cp1255')
                    if s['year'] == 2014:
                        parsed = ([ln[1:9], ln[9:14].strip(), ln[14:19].strip(), ln[19:24].strip(), ln[24:29].strip(), ln[29:34].strip(), ln[34:39].strip(), ln[39:].strip()] for ln in text.splitlines() if ln.strip())
                    else:
                        parsed = csv.reader(io.StringIO(text), delimiter='\t')
                    for row in parsed:
                        if not row:continue
                        if len(row)!=8:raise ValueError(f'Unexpected row {member.name}: {len(row)}')
                        date=row[0];iso=f'{date[:4]}-{date[4:6]}-{date[6:8]}'
                        if len(date)!=8 or not date.isdigit():raise ValueError('Invalid date')
                        # Keep source values; formatting is purely presentation.
                        byday[iso].append([row[1],row[7].strip(),row[6],*row[2:6]])
                        records+=1
    for day,rows in byday.items():
        rows.sort(key=lambda r:(int(r[0]),int(r[3]),int(r[5]),r[2]))
        (out/(day+'.json.gz')).write_bytes(gzip.compress(json.dumps({'date':day,'rows':rows},ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
    write(out/'index.json',{'days':sorted(byday),'records':records,'sources':SOURCES,'identicalMembersSkipped':skipped,
          'credit':'רכבת ישראל; שימור ופרסום: רכבת פתוחה, הסדנא לידע ציבורי',
          'schema':['train','station','station_code','planned_arrival_raw','actual_arrival_raw','planned_departure_raw','actual_departure_raw']})
    print('Rail records',records,'days',len(byday),'duplicate members',skipped)
if __name__=='__main__':main()
