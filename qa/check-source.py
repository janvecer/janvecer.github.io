#!/usr/bin/env python3
"""Local source, JavaScript syntax, and rendered-link checks. No network used.
Run: python qa/check-source.py [render-output-directory]
"""
import json,os,re,shutil,subprocess,sys
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'docs')
errors=[];checks=[]
for directory in (ROOT,ROOT/'likelihood'):
 for p in directory.glob('*.html'):
  errors.append(f'{p.relative_to(ROOT)}: stale rendered HTML beside source; render only into docs/')
checks.append('No stale HTML in project root or likelihood source folder')
qmds=[p for p in ROOT.rglob('*.qmd') if not any(x in ('docs','_site','.quarto') for x in p.relative_to(ROOT).parts)]
for p in qmds:
 text=p.read_text(); rel=str(p.relative_to(ROOT))
 if not p.name.startswith('_') and not text.startswith('---\n'):errors.append(f'{rel}: missing YAML front matter')
 ids=re.findall(r'\{#([\w-]+)',text)
 if len(ids)!=len(set(ids)):errors.append(f'{rel}: duplicate explicit identifiers')
 for match in re.finditer(r'\]\(([^\s)]+)(?:\s+"[^"]*")?\)',text):
  href=match.group(1)
  if re.match(r'^[a-z][a-z\d+.-]*:',href,re.I) or href.startswith('#'):continue
  target=unquote(urlsplit(href).path)
  if not target:continue
  dest=ROOT/target.lstrip('/') if target.startswith('/') else p.parent/target
  if not dest.exists():errors.append(f'{rel}: missing link target {href}')
 checks.append(f'{rel}: source links and identifiers')
node=shutil.which('node')
if node:
 for p in ROOT.rglob('*.js'):
  if any(x in ('docs','_site','.quarto','node_modules') for x in p.relative_to(ROOT).parts):continue
  r=subprocess.run([node,'--check',str(p)],capture_output=True,text=True)
  if r.returncode:errors.append(str(p.relative_to(ROOT))+': '+r.stderr.strip())
  else:checks.append(str(p.relative_to(ROOT))+': JavaScript syntax')
else:errors.append('Node not available; JavaScript syntax was not checked')
try:
 import yaml
 for p in [ROOT/'_quarto.yml']+qmds:
  if not p.exists():errors.append(f'{p.name}: missing');continue
  if p.name.startswith('_') and p.suffix=='.qmd':continue
  data=p.read_text() if p.suffix=='.yml' else p.read_text().split('---',2)[1]
  try:yaml.safe_load(data)
  except yaml.YAMLError as e:errors.append(f'{p.relative_to(ROOT)}: invalid YAML: {e}')
 checks.append('YAML parsed with PyYAML')
except ImportError:
 checks.append('PyYAML unavailable: YAML parser check skipped; Quarto render is required')
class Page(HTMLParser):
 def __init__(self):super().__init__();self.ids=set();self.refs=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.add(a['id'])
  for key in ('href','src'):
   if key in a:self.refs.append((tag,key,a[key]))
if OUTPUT.exists():
 htmls={}
 for p in OUTPUT.rglob('*.html'):
  if any(x=='site_libs' or x.endswith('_files') for x in p.relative_to(OUTPUT).parts):continue
  parser=Page();parser.feed(p.read_text());htmls[p.resolve()]=parser
 for p,page in htmls.items():
  for tag,key,href in page.refs:
   parsed=urlsplit(href)
   if parsed.scheme or parsed.netloc or href.startswith('data:'):continue
   target=unquote(parsed.path)
   dest=(OUTPUT/target.lstrip('/') if target.startswith('/') else p.parent/target).resolve() if target else p
   if dest.is_dir():dest=dest/'index.html'
   if not dest.exists():errors.append(f'{p.relative_to(OUTPUT)}: missing rendered resource {href}')
   elif parsed.fragment and dest in htmls and unquote(parsed.fragment) not in htmls[dest].ids:errors.append(f'{p.relative_to(OUTPUT)}: missing anchor {href}')
 checks.append(f'{len(htmls)} rendered HTML pages: local links, anchors, scripts and styles')
else:checks.append('Rendered output absent: rendered-resource checks skipped')
report={'pages':len(qmds),'checks':checks,'errors':errors,'rendered_output_checked':OUTPUT.exists()}
(ROOT/'qa'/os.environ.get('QA_SOURCE_REPORT','source-report.json')).write_text(json.dumps(report,indent=2))
for e in errors:print('FAIL',e)
print(f'{len(qmds)} pages, {len(checks)} checks, {len(errors)} failures')
sys.exit(bool(errors))
