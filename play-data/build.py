# 엄마표 놀이 데이터: plays.json(원본) → plays.csv(엑셀·시트용) 만들기
#  사용: python3 build.py            (plays.json 검사 + plays.csv 다시 만들기)
#        python3 build.py --from-csv (시트에서 고친 plays.csv → plays.json 으로 되돌리기)
import json, csv, sys, os
D = os.path.dirname(os.path.abspath(__file__))
J, C = os.path.join(D, 'plays.json'), os.path.join(D, 'plays.csv')
FIELDS = ['id', 'status', 'name', 'ageMin', 'ageMax', 'place', 'group', 'minutes', 'mess', 'principles', 'skills', 'materials', 'steps', 'tip', 'safety', 'keywords', 'swaps']
LISTS = {'principles', 'skills', 'materials', 'steps', 'keywords', 'swaps'}   # swaps = 없으면 이걸로 (원래 → 대체1 · 대체2)
PLACES = {'실내', '실외', '욕실', '주방'}
STATUS = {'확정', '후보', '해봄'}   # 후보 = 원리로 새로 만든 놀이 (아직 안 해 봄) · 해봄 = 직접 해 보고 다듬은 것
# 놀이 원리 (자세한 설명은 principles.md)
PRINCIPLES = {'넣고빼기', '옮기기', '숨기고찾기', '원인결과', '굴리고던지기', '감싸고풀기', '꽂고잇기', '쌓고무너뜨리기', '분류짝맞추기', '흉내역할', '변신', '몸으로도전', '소리만들기', '당기고떼기'}
SKILLS = {'오감', '소근육', '대근육', '언어', '인지', '사회성', '창의', '정서'}

def check(rows):
  ids = set(); bad = []
  for r in rows:
    w = f"[{r.get('id')}] {r.get('name')}"
    if r['id'] in ids: bad.append(w + ' id 중복')
    ids.add(r['id'])
    if not (0 <= r['ageMin'] <= r['ageMax'] <= 96): bad.append(w + ' 나이(개월) 범위 이상')
    if r['status'] not in STATUS: bad.append(w + f" status는 {STATUS} 중 하나")
    if not r['principles'] or not set(r['principles']) <= PRINCIPLES: bad.append(w + ' principles는 principles.md 목록에서 1개 이상')
    if r['place'] not in PLACES: bad.append(w + f" place는 {PLACES} 중 하나")
    if r['mess'] not in (0, 1, 2): bad.append(w + ' mess는 0·1·2')
    if not set(r['skills']) <= SKILLS: bad.append(w + f" skills는 {SKILLS} 중에서")
    if not r['materials'] or not r['steps']: bad.append(w + ' 준비물·방법 비어 있음')
  return bad

if '--from-csv' in sys.argv:
  rows = []
  with open(C, encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
      for k in LISTS: r[k] = [x.strip() for x in (r.get(k) or '').split('|') if x.strip()]
      for k in ('ageMin', 'ageMax', 'minutes', 'mess'): r[k] = int(r[k])
      r['group'] = r['group'].strip().upper() in ('TRUE', 'O', 'Y', '1', '예')
      rows.append({k: r[k] for k in FIELDS})
else:
  rows = json.load(open(J, encoding='utf-8'))
  for r in rows: r.setdefault('swaps', [])
bad = check(rows)
if bad: print('\n'.join(bad)); sys.exit(1)
rows.sort(key=lambda r: (r['ageMin'], r['ageMax'], r['id']))
import collections; print('상태:', dict(collections.Counter(r['status'] for r in rows)))
json.dump(rows, open(J, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(C, 'w', encoding='utf-8-sig', newline='') as f:   # utf-8-sig: 엑셀에서 한글 안 깨지게
  w = csv.DictWriter(f, FIELDS); w.writeheader()
  for r in rows: w.writerow({k: ' | '.join(r[k]) if k in LISTS else ('O' if r[k] is True else 'X' if r[k] is False else r[k]) for k in FIELDS})
print(f'OK {len(rows)}개 · plays.json, plays.csv')
