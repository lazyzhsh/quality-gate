// 三分类正例：项目内模块（相对说明符）、内置模块（node: 前缀）、依赖清单（bare 说明符）。
// leftpad 只出现在依赖清单里（声明面）——本门禁对账的是声明面，不是安装状态。
import fs from 'node:fs';
import leftpad from 'leftpad';
import {normalize} from './utils/normalize.mjs';

export function renderInvoice(amount){
  const text=normalize(`amount:${amount}`);
  return leftpad(text,12,fs.existsSync('.')?'0':' ');
}
