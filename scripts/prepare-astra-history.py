import re,json,html,openpyxl,pathlib,unicodedata,collections
out=pathlib.Path('scripts/fixtures');out.mkdir(exist_ok=True)
key=lambda s:re.sub('[^a-z0-9]','',unicodedata.normalize('NFD',s).lower())
party=lambda p:{'LIB':'con','NDP':'ndp','GP':'green','CP':'centre'}.get(p,'other')
s=open('/tmp/results2020.txt').read().split('Table 20: Summary of results by candidate')[1].split('Table 21:')[0];actual={};candidates=[];d=None
for line in s.splitlines():
 cols=re.split(r'\s{2,}',line.strip())
 if len(cols)>=4 and re.fullmatch(r'\d[\d,]*',cols[-2]) and re.fullmatch(r'[\d.]+%',cols[-1]):
  if len(cols)==5:d=cols[0]
  name,aff,votes,share=cols[-4:];name=name.rstrip('*')
  actual.setdefault(d,[]).append({'name':name,'party':party(aff),'votes':int(votes.replace(',','')),'share':float(share[:-1])})
  candidates.append({'district':d,'name':name,'party':party(aff),'affiliation':'Independent' if aff in ['IND','UNA'] else aff})
w=openpyxl.load_workbook('/tmp/results2017.xlsx',data_only=True);baseline=[]
modern=json.loads(pathlib.Path('lib/data/astra-baseline.json').read_text())['districts']
def region(name):
 # Pre-election geographic groupings, no target election vote data.
 if re.match(r'^(Surrey|Delta|Langley)',name):return 'South of Fraser'
 if re.match(r'^(Abbotsford|Chilliwack|Fraser|Maple|Mission)',name):return 'Fraser Valley'
 if re.match(r'^(Burnaby|Coquitlam|New Westminster|North Vancouver|Port|Richmond|Vancouver|West Vancouver)',name):return 'Metro Vancouver'
 if re.match(r'^(Courtenay|Cowichan|Esquimalt|Mid Island|Nanaimo|North Island|Oak Bay|Parksville|Powell River|Saanich|Victoria)',name):return 'Vancouver Island'
 if re.match(r'^(Bulkley|Nechako|North Coast|Peace|Prince|Skeena|Stikine)',name):return 'Northern BC'
 return 'Interior'
for sh in w.worksheets[1:]:
 rows=list(sh.values);name=rows[2][0]
 if not name:continue
 matches=[d for d in actual if key(d)==key(name)]
 if not matches:print('unmatched',name);continue
 name=matches[0];header=next(i for i,r in enumerate(rows) if 'Total valid votes' in r and r[0] is None);stop=rows[header].index('Total valid votes');total=next(r for r in rows if r[0]=='Grand totals');vs=sum(total[1:stop]);results=[]
 for i in range(1,stop):results.append({'name':rows[header][i],'party':party(rows[header+1][i]),'votes':total[i],'share':100*total[i]/vs})
 baseline.append({'name':name,'region':region(name),'url':'https://elections.bc.ca/docs/rpt/2017-election-report/xlsx/2017-provincial-general-election-sov.xlsx','results':results})
assert len(baseline)==87,len(baseline)
fixture={'year':2020,'date':'2020-10-23','electionDay':'2020-10-24','baselineYear':2017,'baseline':baseline,'candidates':candidates,'actual':actual,'labels':{'con':'BC Liberals','ndp':'BC NDP','green':'BC Greens','centre':'BC Conservatives','one':'Not running','other':'Other candidates'}}
fixture['polls']=json.loads((out/'2020.json').read_text())['polls']
(out/'2020.json').write_text(json.dumps(fixture,indent=2))
plain=lambda s:html.unescape(re.sub('<[^>]*>','',s)).strip()
baseline=[]
for d in modern:
 s=pathlib.Path('/tmp/astra-districts/'+d['url'].rsplit('/',1)[1]+'.html').read_text();section=s.split('2020 result</h2>')[1].split('</ul>')[0];rows=[]
 for li in re.findall('<li>(.*?)</li>',section,re.S):
  color=re.search('background-color:([^";]+)',li)[1];p={'#1F4E9C':'con','#D81E24':'con','#F58220':'ndp','#3D9B35':'green'}.get(color,'other');spans=re.findall('<span[^>]*>(.*?)</span>',li,re.S)
  rows.append({'name':plain(spans[1]).replace('elected','').strip(),'party':p,'votes':int(plain(spans[-2]).replace(',','')),'share':float(plain(spans[-1]).replace('%',''))})
 baseline.append({'name':d['name'],'region':d['region'],'url':d['url'],'results':rows})
assert all(len(d['results'])>1 for d in baseline)
candidates=[{'district':d['name'],'name':r['name'],'party':r['party'],'affiliation':'Independent' if r['party']=='other' else r['party']}for d in modern for r in d['results']]
fixture={'year':2024,'date':'2024-10-18','electionDay':'2024-10-19','baselineYear':2020,'baseline':baseline,'candidates':candidates,'actual':{d['name']:d['results']for d in modern},'labels':{'con':'BC Conservatives','ndp':'BC NDP','green':'BC Greens','centre':'Not running','one':'Not running','other':'Other candidates'}}
fixture['polls']=json.loads((out/'2024.json').read_text())['polls']
(out/'2024.json').write_text(json.dumps(fixture,indent=2))
print('Saved both historical fixtures; target votes in scoring field only.')
