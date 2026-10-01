// 端点引用面：fetch('/users?…') 查询串剥离后对账 /users；'/users/42' 对账 {param} 模板段
export async function listUsers(){
 return fetch('/users?page=1&size=20');
}

export async function dropUser(){
 return axios.delete('/users/42');
}
