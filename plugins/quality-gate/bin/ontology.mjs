import fs from 'node:fs';
import {createProvider} from '../lib/ontology.mjs';
import {projectFile} from '../lib/kernel.mjs';
try {const [root,iri]=process.argv.slice(2);const c=JSON.parse(fs.readFileSync(projectFile(root,'.quality-gate.json'),'utf8'));const p=createProvider(c.ontology,root);console.log(JSON.stringify(iri?p.resolve(iri):p.describe(),null,2));}catch(e){console.error(e.message);process.exitCode=2;}
