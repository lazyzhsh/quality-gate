// 迷你 API 服务:鉴权中间件语义(complete mediation + fail-secure),供行为反例演练。
export function handleRequest({token,path,authzDown=false}){
 if(!token)return {status:401};
 if(authzDown)return {status:403}; // 鉴权依赖故障必须落到拒绝分支(CWE-636 fail-secure)
 const match=/^\/orders\/(.+)$/.exec(path);
 if(!match)return {status:404};
 return token===`user-${match[1]}`?{status:200}:{status:403};
}
