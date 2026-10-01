import {isDeepStrictEqual} from 'node:util';

const text=value=>typeof value==='string'&&value.trim().length>0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const check=(condition,message)=>{if(!condition)throw new Error(message);};

// invariant 与 property 共用的断言语义：操作符集合、when 条件与求值。
export const operators=['eq','neq','le','lt','ge','gt'];
export const numericOperators=['le','lt','ge','gt'];

// 条件形态：{field, equals|notEquals|in}；数组表示 AND 组合
export function validateCondition(condition){
 check(object(condition)&&text(condition.field),'Invalid assertion condition');
 const keys=Object.keys(condition).filter(key=>key!=='field');
 check(keys.length===1&&['equals','notEquals','in'].includes(keys[0]),'Assertion condition requires exactly one of equals/notEquals/in');
 if(keys[0]==='in')check(Array.isArray(condition.in)&&condition.in.length>0,'Invalid assertion condition in-list');
}

export function conditionsMet(when,values){
 const conditions=Array.isArray(when)?when:[when];
 return conditions.every(condition=>{
  check(Object.hasOwn(values,condition.field),`Missing condition value: ${condition.field}`);
  const actual=values[condition.field];
  if('equals'in condition)return isDeepStrictEqual(actual,condition.equals);
  if('notEquals'in condition)return !isDeepStrictEqual(actual,condition.notEquals);
  return condition.in.some(candidate=>isDeepStrictEqual(actual,candidate));
 });
}

export function evaluateOperator(left,operator,right){
 if(numericOperators.includes(operator))check(Number.isFinite(left)&&Number.isFinite(right),`Non-numeric assertion operand for operator ${operator}`);
 return operator==='eq'?isDeepStrictEqual(left,right)
  :operator==='neq'?!isDeepStrictEqual(left,right)
  :operator==='le'?left<=right
  :operator==='lt'?left<right
  :operator==='ge'?left>=right
  :left>right;
}
