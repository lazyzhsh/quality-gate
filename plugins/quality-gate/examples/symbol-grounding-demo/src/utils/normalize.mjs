// 去除首尾空白并把内部连续空白折叠为单个空格——被 ../app.mjs 以相对说明符引用（项目内模块）
export function normalize(value){
  return String(value).trim().replaceAll(/\s+/g,' ');
}
