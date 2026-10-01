import fs from 'node:fs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input),findings=[];
if(/\beval\s*\(/.test(fs.readFileSync('app.mjs','utf8')))findings.push({id:`${request.category}-1`,rule:'no-eval',severity:'high',location:'app.mjs',description:'Dynamic code execution detected'});
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,tool:'demo-rule-scanner',version:'0.1',category:request.category,target:'project-files',findings}));
