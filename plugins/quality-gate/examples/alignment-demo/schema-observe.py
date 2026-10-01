import json
import sqlite3
import sys
from pathlib import Path

request=json.loads(sys.stdin.readline())
connection=sqlite3.connect(':memory:')
connection.executescript(Path('migration.sql').read_text(encoding='utf-8'))
columns=connection.execute('PRAGMA table_info(orders)').fetchall()
items=[{'table':'orders','columns':[{'name':name,'type':kind,'notNull':bool(not_null),'primaryKey':bool(pk)} for _,name,kind,not_null,_,pk in columns]}]
connection.close()
print(json.dumps({'schemaVersion':'0.1','runId':request['runId'],'kind':'schema','source':'sqlite:PRAGMA table_info(orders)','items':items}))
