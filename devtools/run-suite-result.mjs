// A runner interrupted before it returns a numeric status has not completed the suite.
export function suiteExitCode(result){
 if(result.signal!==null&&result.signal!==undefined)return 1;
 return Number.isInteger(result.status)?result.status:1;
}
