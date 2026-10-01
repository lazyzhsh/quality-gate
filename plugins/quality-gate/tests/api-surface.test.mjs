import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateApiSurfaceRegistry,enumerateOpenApiEndpoints,enumerateSchemaKeys,endpointMatches,loadApiSurfaces} from '../lib/api-surface.mjs';

const openApiDocument={
 openapi:'3.1.0',
 paths:{
  '/users':{get:{summary:'list'},post:{summary:'create'}},
  '/users/{id}':{get:{summary:'detail'},delete:{summary:'remove'}},
  '/health':{get:{summary:'health'}}
 }
};

const schemaDocument={
 type:'object',
 properties:{
  HOST:{type:'string'},
  PORT:{type:'number'},
  database:{
   type:'object',
   properties:{
    url:{type:'string'},
    pool:{type:'object',properties:{max:{type:'number'}}}
   }
  }
 }
};

test('api surface registry validation accepts the three surface shapes',()=>{
 validateApiSurfaceRegistry({surfaces:[
  {id:'api-main',type:'openapi',file:'docs/openapi.json',source:{file:'docs/api-design.md'}},
  {id:'api-yaml',type:'openapi-yaml',file:'docs/openapi.yaml',normalizedFile:'.quality-gate/normalized/api.json',source:{file:'docs/api-design.md',section:'2.1'}},
  {id:'config-app',type:'json-schema',file:'schemas/config.schema.json',source:{file:'docs/config.md'}}
 ]});
});

test('api surface registry validation rejects the malformation matrix',()=>{
 const valid={id:'a',type:'openapi',file:'docs/openapi.json',source:{file:'docs/x.md'}};
 const cases=[
  [null,/1..50 api surfaces/],
  [{surfaces:[]},'1..50'],
  [{surfaces:[valid, {...valid}]},'Duplicate'],
  [{surfaces:[{...valid,id:''}]},'surface id'],
  [{surfaces:[{...valid,type:'grpc'}]},'type must be'],
  [{surfaces:[{...valid,file:'../escape.json'}]},/Invalid api surface file/],
  [{surfaces:[{...valid,file:'E:\\abs.json'}]},/Invalid api surface file/],
  [{surfaces:[{...valid,source:{}}]},'provenance source'],
  [{surfaces:[{...valid,source:{file:'docs/x.md',section:''}}]},'provenance source'],
  [{surfaces:[{...valid,type:'openapi-yaml'}]},'requires a normalizedFile'],
  [{surfaces:[{...valid,type:'openapi-yaml',normalizedFile:'n.json',file:'../up.yaml'}]},/Invalid api surface file/],
  [{surfaces:[{...valid,normalizedFile:'n.json'}]},'only applies to openapi-yaml']
 ];
 for(const [registry,pattern] of cases)assert.throws(()=>validateApiSurfaceRegistry(registry),pattern);
});

test('openapi endpoint enumeration lists declared paths x methods with uppercase verbs',()=>{
 assert.deepEqual(enumerateOpenApiEndpoints(openApiDocument),[
  {method:'GET',path:'/users'},
  {method:'POST',path:'/users'},
  {method:'GET',path:'/users/{id}'},
  {method:'DELETE',path:'/users/{id}'},
  {method:'GET',path:'/health'}
 ]);
});

test('openapi endpoint enumeration fails closed on malformed or empty documents',()=>{
 assert.throws(()=>enumerateOpenApiEndpoints({}),/paths object required/);
 assert.throws(()=>enumerateOpenApiEndpoints({paths:{users:{}}}),/Invalid OpenAPI path/);
 assert.throws(()=>enumerateOpenApiEndpoints({paths:{'/users':'nope'}}),/Invalid OpenAPI path item/);
 assert.throws(()=>enumerateOpenApiEndpoints({paths:{'/users':{get:null}}}),/Invalid OpenAPI operation/);
 assert.throws(()=>enumerateOpenApiEndpoints({paths:{}}),'declares no endpoints');
});

test('schema key enumeration walks nested properties into dotted key paths',()=>{
 assert.deepEqual(enumerateSchemaKeys(schemaDocument),['HOST','PORT','database','database.pool','database.pool.max','database.url']);
});

test('schema key enumeration fails closed on malformed or empty schemas',()=>{
 assert.throws(()=>enumerateSchemaKeys(null),/Invalid JSON Schema document/);
 assert.throws(()=>enumerateSchemaKeys({properties:{a:null}}),'Invalid property schema');
 assert.throws(()=>enumerateSchemaKeys({properties:{}}),'declares no properties');
});

test('endpoint matching treats {param} segments as segment-level wildcards',()=>{
 assert.equal(endpointMatches('/users','/users'),true);
 assert.equal(endpointMatches('/users/{id}','/users/42'),true);
 assert.equal(endpointMatches('/users/{id}','/users/42/posts'),false);
 assert.equal(endpointMatches('/users/{id}/orders/{orderId}','/users/42/orders/9'),true);
 assert.equal(endpointMatches('/users/{id}','/users/'),false);
 assert.equal(endpointMatches('/users','/admins'),false);
});

const buildRegistry=dir=>{
 fs.writeFileSync(path.join(dir,'openapi.json'),JSON.stringify(openApiDocument));
 fs.writeFileSync(path.join(dir,'config.schema.json'),JSON.stringify(schemaDocument));
 fs.writeFileSync(path.join(dir,'openapi.yaml'),'# normalized by adapter\n');
 fs.writeFileSync(path.join(dir,'openapi.normalized.json'),JSON.stringify(openApiDocument));
 const registry={surfaces:[
  {id:'api-main',type:'openapi',file:'openapi.json',source:{file:'docs/api.md'}},
  {id:'api-yaml',type:'openapi-yaml',file:'openapi.yaml',normalizedFile:'openapi.normalized.json',source:{file:'docs/api.md'}},
  {id:'config-app',type:'json-schema',file:'config.schema.json',source:{file:'docs/config.md'}}
 ]};
 fs.writeFileSync(path.join(dir,'registry.json'),JSON.stringify(registry));
};

test('loadApiSurfaces inventories every surface with a registry content hash',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qg-api-surface-'));
 buildRegistry(dir);
 const loaded=loadApiSurfaces(dir,'registry.json');
 assert.equal(loaded.surfaces.length,3);
 assert.match(loaded.contentSha256,/^[0-9a-f]{64}$/);
 assert.equal(loaded.surfaces[0].endpoints.length,5);
 assert.equal(loaded.surfaces[1].type,'openapi-yaml');
 assert.equal(loaded.surfaces[1].endpoints.length,5);
 assert.deepEqual(loaded.surfaces[2].keys,['HOST','PORT','database','database.pool','database.pool.max','database.url']);
});

test('loadApiSurfaces fails closed on missing registry, missing surface file and stale normalization',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qg-api-surface-'));
 buildRegistry(dir);
 assert.throws(()=>loadApiSurfaces(dir,'missing.json'),/registry missing/);
 const single={surfaces:[{id:'api-main',type:'openapi',file:'gone.json',source:{file:'docs/api.md'}}]};
 fs.writeFileSync(path.join(dir,'single.json'),JSON.stringify(single));
 assert.throws(()=>loadApiSurfaces(dir,'single.json'),/ENOENT/);
 const now=Date.now();
 fs.utimesSync(path.join(dir,'openapi.yaml'),new Date(now),new Date(now+5000));
 assert.throws(()=>loadApiSurfaces(dir,'registry.json'),/stale normalization/);
 fs.utimesSync(path.join(dir,'openapi.normalized.json'),new Date(now),new Date(now+9000));
 loadApiSurfaces(dir,'registry.json');
});

test('loadApiSurfaces tolerates a UTF-8 BOM in the registry file',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qg-api-surface-'));
 buildRegistry(dir);
 const raw=fs.readFileSync(path.join(dir,'registry.json'),'utf8');
 fs.writeFileSync(path.join(dir,'registry.json'),'\uFEFF'+raw);
 loadApiSurfaces(dir,'registry.json');
});
