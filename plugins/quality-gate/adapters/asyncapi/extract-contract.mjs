#!/usr/bin/env node
import fs from 'node:fs';
import {extractEventContract} from '../../lib/asyncapi.mjs';

let raw='';
for await(const chunk of process.stdin)raw+=chunk;
let request;
try{request=JSON.parse(raw);if(typeof request?.runId!=='string'||!request.runId.trim()||typeof request?.file!=='string'||!request.file.trim())throw new Error('stdin requires runId and file');}
catch(error){console.error(error.message);process.exit(2);}
try{
 const bytes=fs.readFileSync(request.file);
 if(bytes.length>65536)throw new Error('AsyncAPI document exceeds 65536 bytes');
 const contract=extractEventContract(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')));
 console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'asyncapi 3.0 JSON subset extraction',...contract}));
}catch(error){console.error(error.message);process.exit(3);}
