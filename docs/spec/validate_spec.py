"""Validate JP-1.0 documentation contracts (not application implementation).
Requires Python 3.9+ and jsonschema 4.x. Run from any directory.
"""
from pathlib import Path
import copy
import json
import re
import sqlite3
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
checks = []
def check(name, predicate):
    if not predicate:
        raise AssertionError(name)
    checks.append(name)

def rejected(db, sql, values=()):
    try:
        db.execute(sql, values)
    except sqlite3.IntegrityError:
        return True
    return False

def insert(db, table, **values):
    cols=','.join(values)
    marks=','.join('?' for _ in values)
    db.execute(f'INSERT INTO {table}({cols}) VALUES({marks})', tuple(values.values()))

# Executable schema and invariants. Synthetic IDs deliberately isolate SQL constraints.
db=sqlite3.connect(':memory:')
db.executescript((ROOT/'schema.sql').read_text())
check('SQL foreign keys enabled', db.execute('PRAGMA foreign_keys').fetchone()[0]==1)
insert(db,'project',id='p',name='synthetic',root_path='/tmp/jp-check',policy_json='{}',created_at='t',updated_at='t')
insert(db,'work_item',id='w',project_id='p',name='work',kind='system',goal='test',mode='checkpoint',state='draft',created_at='t',updated_at='t')
insert(db,'workflow_run',id='r',work_id='w',template_version='JP-1.0',state='running',config_json='{}',created_at='t')
check('At most one live workflow per work', rejected(db,"INSERT INTO workflow_run(id,work_id,template_version,state,config_json,created_at) VALUES('r2','w','JP-1.0','running','{}','t')"))
insert(db,'stage_run',id='s',run_id='r',stage_key='prd',state='active')
insert(db,'artifact',id='a',project_id='p',work_id='w',kind='prd',title='test',sensitivity='internal',created_at='t')
insert(db,'artifact_version',id='v',artifact_id='a',version=1,object_hash='a'*64,mime='text/markdown',size_bytes=5,author_kind='user',author_id='owner',metadata_json='{}',created_at='t')
check('Artifact versions reject mutation', rejected(db,"UPDATE artifact_version SET object_hash=? WHERE id='v'",('b'*64,)))
insert(db,'artifact_version',id='v2',artifact_id='a',version=2,parent_id='v',object_hash='a'*64,mime='text/markdown',size_bytes=5,author_kind='user',author_id='owner',metadata_json='{}',created_at='t')
check('New version may reuse immutable content object',db.execute("SELECT COUNT(*) FROM artifact_version WHERE artifact_id='a'").fetchone()[0]==2)
check('JSON fields reject malformed JSON', rejected(db,"UPDATE project SET policy_json='bad' WHERE id='p'"))
check('Foreign keys reject missing project', rejected(db,"INSERT INTO artifact(id,project_id,kind,title,sensitivity,created_at) VALUES('x','missing','prd','x','internal','t')"))
check('Work kinds reject unknown values', rejected(db,"UPDATE work_item SET kind='unknown' WHERE id='w'"))
insert(db,'baseline',id='b',stage_id='s',fingerprint='c'*64,status='draft',created_at='t')
insert(db,'baseline_member',baseline_id='b',version_id='v',purpose='output')
db.execute("UPDATE baseline SET sealed_at='t' WHERE id='b'")
check('Sealed baseline rejects added members', rejected(db,"INSERT INTO baseline_member VALUES('b','v','input')"))
check('Sealed baseline rejects changed members', rejected(db,"UPDATE baseline_member SET purpose='input' WHERE baseline_id='b'"))
check('Sealed baseline rejects deletion in live project', rejected(db,"DELETE FROM baseline_member WHERE baseline_id='b'"))
check('Agent cannot insert user approval', rejected(db,"INSERT INTO approval VALUES('ap','b',?,'agent','approve','invalid','t')",('c'*64,)))
insert(db,'approval',id='ap',baseline_id='b',fingerprint='c'*64,actor_kind='user',verdict='approve',reason='synthetic acceptance',created_at='t')
insert(db,'task',id='task',stage_id='s',role='tester',title='test',state='running',spec_json='{}',created_at='t')
insert(db,'run_attempt',id='attempt',task_id='task',attempt_no=1,state='running',lease_owner='worker',lease_until='t',model_config_json='{}',started_at='t')
check('One running attempt per task', rejected(db,"INSERT INTO run_attempt(id,task_id,attempt_no,state,lease_owner,lease_until,model_config_json,started_at) VALUES('attempt2','task',2,'running','worker','t','{}','t')"))
check('Task self dependency rejected', rejected(db,"INSERT INTO task_dependency VALUES('task','task')"))
insert(db,'tool_operation',id='op',attempt_id='attempt',project_id='p',tool='read',idempotency_key='key',request_hash='d'*64,state='intent',effect_class='read',created_at='t',updated_at='t')
check('Tool idempotency keys unique per project', rejected(db,"INSERT INTO tool_operation(id,project_id,tool,idempotency_key,request_hash,state,effect_class,created_at,updated_at) VALUES('op2','p','read','key','hash','intent','read','t','t')"))
insert(db,'test_case',id='tc',work_id='w',definition_version_id='v',category='software',requirement_key='FR-01')
insert(db,'test_run',id='tr',work_id='w',is_simulation=1,target_json='{}',state='running')
check('Pass result requires evidence reference', rejected(db,"INSERT INTO test_result(id,test_run_id,test_case_id,verdict,metrics_json) VALUES('res','tr','tc','pass','{}')"))
insert(db,'test_result',id='res',test_run_id='tr',test_case_id='tc',verdict='pass',evidence_version_id='v',metrics_json='{}')
check('No foreign key inconsistencies', not db.execute('PRAGMA foreign_key_check').fetchall())
db.execute("UPDATE project SET state='deleted' WHERE id='p'")
db.execute("DELETE FROM baseline_member WHERE baseline_id='b'")
check('Purge can remove sealed member only after project deleted',db.execute('SELECT COUNT(*) FROM baseline_member').fetchone()[0]==0)
tables=db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0]

# JSON Schema: validate meta-schema, all method branches and representative negative cases.
schema=json.loads((ROOT/'contracts.schema.json').read_text())
Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,format_checker=FormatChecker())
examples=json.loads((ROOT/'contract-examples.json').read_text())
validator.validate(examples['command'])
response_schema={'$schema':schema['$schema'],'$ref':'#/$defs/Response','$defs':schema['$defs']}
Draft202012Validator(response_schema,format_checker=FormatChecker()).validate(examples['response'])
check('Command and response examples validate',True)

def sample(s):
    if 'const' in s:return s['const']
    if 'enum' in s:return s['enum'][0]
    if 'anyOf' in s:return sample(s['anyOf'][0])
    t=s.get('type')
    if t=='object':return {k:sample(s['properties'][k]) for k in s.get('required',[])}
    if t=='array':return [sample(s['items']) for _ in range(s.get('minItems',0))]
    if t=='integer':return s.get('minimum',1)
    if t=='boolean':return False
    if t=='null':return None
    if t=='string':
        if s.get('format')=='uuid':return '00000000-0000-4000-8000-000000000001'
        if s.get('format')=='uri':return 'https://example.invalid'
        if s.get('pattern')=='^[a-f0-9]{64}$':return 'a'*64
        return 'sample'
    return {}

branches=schema['$defs']['Command']['allOf']
for b in branches:
    cmd=copy.deepcopy(examples['command'])
    cmd['method']=b['if']['properties']['method']['const']
    cmd['payload']=sample(b['then']['properties']['payload'])
    validator.validate(cmd)
    wrong=copy.deepcopy(cmd);wrong['payload']['unexpectedField']=True
    check('Reject unknown payload field: '+cmd['method'],not validator.is_valid(wrong))
check('All method branches accept schema-valid examples',True)
wrong=copy.deepcopy(examples['command']);wrong['payload']['kind']='other'
check('Unknown work kind rejected by API schema',not validator.is_valid(wrong))
wrong=copy.deepcopy(examples['command']);wrong['requestId']='not-a-uuid'
check('Invalid request UUID rejected',not validator.is_valid(wrong))
wrong=copy.deepcopy(examples['command']);wrong['actor']='user'
check('Caller cannot add actor to envelope',not validator.is_valid(wrong))

# Graph and traceability completeness.
workflow=json.loads((ROOT/'workflow-templates.json').read_text())
for name,stages in workflow['templates'].items():
    bykey={s['key']:s for s in stages};done=set()
    check(name+' stage keys unique',len(bykey)==len(stages))
    while len(done)<len(stages):
        eligible=[s['key'] for s in stages if s['key'] not in done and set(s['dependsOn'])<=done]
        check(name+' dependency progress '+str(len(done)),bool(eligible))
        done.update(eligible)
    check(name+' every stage has outputs and roles',all(s['requiredArtifactKinds'] and s['roles'] for s in stages))
prd=(ROOT/'03-prd.md').read_text();matrix=(ROOT/'12-development-plan.md').read_text()
frs=set(re.findall(r'^\| (FR-\d+) \|',prd,re.M))
coverage=set(re.findall(r'^\| (FR-\d+) \|',matrix,re.M))
check('All 25 FRs covered by traceability matrix',len(frs)==25 and frs==coverage)
tests=set(re.findall(r'^\| (T-\d+) P[012] \|',(ROOT/'11-test-design.md').read_text(),re.M))
check('40 distinct test cases',len(tests)==40)
check('Traceability test references exist',set(re.findall(r'T-\d+',matrix))<=tests)
uxids=set(re.findall(r'^\| (UI-\d+) \|',(ROOT/'04-ux-spec.md').read_text(),re.M))
html=(ROOT.parent/'design/screenboard.html').read_text()
check('14 UI screens represented in design board',len(uxids)==14 and all(f'id="{x}"' in html for x in uxids))
check('Traceability UI references exist',set(re.findall(r'UI-\d+',matrix))<=uxids)

# Check local Markdown links in the authoritative pack (excluding fragments/web URLs).
link_count=0
for p in ROOT.glob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
        if re.match(r'\w+://',target) or target.startswith('#'):continue
        target=target.strip('<>').split('#')[0]
        check('Link exists '+p.name+' -> '+target,(p.parent/target).exists())
        link_count+=1
print('JP-1.0 specification validation: PASS')
print(f'{len(checks)} checks; {tables} SQL tables; {len(branches)} API methods; 3 workflow DAGs; {link_count} local links')
print('Scope: document/schema validation only. No application, provider, container or production execution tests were run by this script.')
for name in checks:print('PASS '+name)
