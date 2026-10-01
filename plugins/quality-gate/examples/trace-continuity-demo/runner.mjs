import {OrderPipeline} from './service.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
const faults=new Set(process.argv.slice(2));
const propagation=new OrderPipeline().run(faults);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'OrderPipeline W3C trace-context propagation drill',propagation}));
