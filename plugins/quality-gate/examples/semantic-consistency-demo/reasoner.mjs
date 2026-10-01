// 外部 reasoner 协议示例：接收内核交付的目录事实，独立计算推断互斥对集合。
// 真实项目可把它替换为 pySHACL/owlrl 等推理器的包装；协议只是双实现一致性核对。
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
const concepts=request.facts.concepts;
const children=new Map();
const edge=(parent,child)=>{
 if(!children.has(parent))children.set(parent,[]);
 children.get(parent).push(child);
};
for(const concept of concepts){
 for(const parent of concept.subClassOf??[])edge(parent,concept.iri);
 for(const twin of concept.equivalentClass??[]){edge(concept.iri,twin);edge(twin,concept.iri);}
 for(const operand of concept.unionOf??[])edge(concept.iri,operand);
}
const descendants=iri=>{
 const seen=new Set(),queue=[...(children.get(iri)??[])];
 for(const node of queue)seen.add(node);
 while(queue.length){
  const node=queue.shift();
  for(const child of children.get(node)??[])if(!seen.has(child)){seen.add(child);queue.push(child);}
 }
 return [...seen];
};
const pairs=new Set();
const key=(a,b)=>a<b?`${a}\0${b}`:`${b}\0${a}`;
for(const concept of concepts)for(const target of concept.disjointWith??[])
 for(const left of [concept.iri,...descendants(concept.iri)])for(const right of [target,...descendants(target)])pairs.add(key(left,right));
const entailedDisjointPairs=[...pairs].map(entry=>entry.split('\0')).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:1);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'independent OWL-subset propagation over delivered facts',tool:'demo-reasoner@1',entailedDisjointPairs}));
