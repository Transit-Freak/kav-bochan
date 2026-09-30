"""OCR every due low-text PDF page; OCR remains unverified until visual review."""
import argparse,hashlib,json,pathlib,subprocess,tempfile,urllib.request
import fitz
from package_pipeline import CACHE, STATE, make_queue
from extract_documents import read, write
MODEL_SHA = '11f9e43ab227f786352a50f75c94c2e9906f1baba86d93276da19da7ce0904db'

def ensure_model():
    folder=pathlib.Path(tempfile.gettempdir())/'tender-ocr';folder.mkdir(exist_ok=True)
    target=folder/'heb.traineddata'
    if not target.exists():
        body=urllib.request.urlopen('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/heb.traineddata',timeout=30).read()
        if hashlib.sha256(body).hexdigest()!=MODEL_SHA:raise ValueError('Unexpected Hebrew OCR model version')
        target.write_bytes(body)
    if hashlib.sha256(target.read_bytes()).hexdigest()!=MODEL_SHA:raise ValueError('OCR model checksum mismatch')
    return folder

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=200);args=parser.parse_args()
    model=ensure_model();count=0
    for data_path in sorted(CACHE.glob('*/units.json')):
        data=json.loads(data_path.read_text());changed=False
        for unit in data['units']:
            if unit['status']!='visual_review_needed' or unit.get('ocrAttempted'):continue
            if count>=args.limit:break
            pdf=data_path.parent/'source.bin'
            if unit.get('member'):pdf=pdf.with_name(hashlib.sha256(unit['member'].encode()).hexdigest()[:20]+'.bin')
            if unit.get('imageFile'):
                pdf=data_path.parent/unit['imageFile']
            if not pdf.exists():continue
            count+=1;changed=True;unit['ocrAttempted']=True
            try:
                with fitz.open(pdf) as doc:
                    image=doc[0 if unit.get('imageFile') else unit['page']-1].get_pixmap(matrix=fitz.Matrix(2,2),alpha=False)
                    result=subprocess.run(['tesseract','stdin','stdout','-l','heb','--tessdata-dir',str(model)],input=image.tobytes('png'),capture_output=True,timeout=60,check=True)
                text=result.stdout.decode().strip()
                if len(text)>=40:unit.update(text=text,status='ocr_extracted')
            except Exception as e:unit['ocrError']=str(e)
        if changed:
            tmp=data_path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False));tmp.replace(data_path)
        if count>=args.limit:break
    state=read(STATE,{'tenders':{}})
    for tender in state['tenders'].values():
        for doc in tender['documents'].values():
            path=CACHE/doc.get('sha256','missing')/'units.json'
            if not path.exists():continue
            units=json.loads(path.read_text())['units']
            doc['textUnits']=sum(u['status'] in ('text_extracted','ocr_extracted') for u in units)
            doc['visualUnits']=sum(u['status']=='visual_review_needed' for u in units)
            doc.pop('unitIndex',None)
    write(STATE,state)
    (CACHE/'review-queue.json').write_text(json.dumps(make_queue(state,CACHE),ensure_ascii=False,indent=2))
    print('OCR pages attempted:',count)

if __name__=='__main__':main()
