// 命名成员引用面：listUsers 须在 ./api.mjs 导出面；配置键引用面：HOST/PORT 须在 schema 键面
import {listUsers} from './api.mjs';

const host=process.env.HOST;
const port=process.env['PORT'];

export async function refresh(){
 return listUsers();
}
