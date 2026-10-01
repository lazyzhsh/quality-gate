import json
import sqlite3
import sys

request=json.loads(sys.stdin.readline())
mode=sys.argv[1] if len(sys.argv)>1 else 'normal'
if mode not in ('normal','wrong-balance','wrong-status'):
    raise ValueError('Unknown fixture mode')
db=sqlite3.connect(':memory:')
db.executescript('CREATE TABLE payment (id TEXT PRIMARY KEY, status TEXT, captured INTEGER, refunded INTEGER); CREATE TABLE ledger (payment_id TEXT, side TEXT, amount INTEGER, status TEXT);')
db.execute('INSERT INTO payment VALUES (?, ?, ?, ?)',(request['runId'],'SUCCESS',1000,200))
db.execute('INSERT INTO ledger VALUES (?, ?, ?, ?)',(request['runId'],'debit',1000,'POSTED' if mode!='wrong-status' else 'PENDING'))
db.execute('INSERT INTO ledger VALUES (?, ?, ?, ?)',(request['runId'],'credit',1000 if mode!='wrong-balance' else 999,'POSTED'))
db.commit()
payment=db.execute('SELECT status,captured,refunded FROM payment WHERE id=?',(request['runId'],)).fetchone()
debit=db.execute("SELECT SUM(amount) FROM ledger WHERE payment_id=? AND side='debit'",(request['runId'],)).fetchone()[0]
credit=db.execute("SELECT SUM(amount) FROM ledger WHERE payment_id=? AND side='credit'",(request['runId'],)).fetchone()[0]
ledger_status=db.execute("SELECT status FROM ledger WHERE payment_id=? AND side='debit'",(request['runId'],)).fetchone()[0]
db.close()
print(json.dumps({'schemaVersion':'0.1','runId':request['runId'],'source':'sqlite:payment+ledger readback','values':{'paymentStatus':payment[0],'capturedAmount':payment[1],'refundAmount':payment[2],'debitSum':debit,'creditSum':credit,'ledgerStatus':ledger_status}}))
