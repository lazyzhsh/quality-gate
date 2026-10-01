import fs from 'node:fs';
import {projectFile} from './kernel.mjs';
import {createProvider} from './ontology.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
export function runOntologyMap(g,config,root) {
 const raw=fs.readFileSync(projectFile(root,g.file),'utf8');
 const data=JSON.parse(raw.replace(/^\uFEFF/,''));
 if(!Array.isArray(data.mappings)||data.mappings.length===0||data.mappings.length>100||data.mappings.some(x=>!text(x.id)||!text(x.iri))||new Set(data.mappings.map(x=>x.id)).size!==data.mappings.length)throw new Error('Invalid ontology mappings');
 const provider=createProvider(config.ontology,root);
 const description=provider.describe();
 if(description.status==='NOT_IMPLEMENTED')throw new Error('Ontology provider is not implemented');
 const mappings=data.mappings.map(x=>({id:x.id,iri:x.iri,...provider.resolve(x.iri)}));
 return {status:mappings.every(x=>x.status==='FOUND')?'PASS':'FAIL',details:{provider:description,mappings}};
}
