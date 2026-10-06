// cli 层：组合入口，可依赖任何下层
import {render} from '../ui/dashboard.mjs';
import {quote} from '../core/engine.mjs';
export const main=minor=>console.log(render(quote(minor).display==='0.00'?0:minor));
