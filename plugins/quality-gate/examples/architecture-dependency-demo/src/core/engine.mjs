// core 层：只依赖 shared
import {formatAmount} from '../shared/format.mjs';
export const quote=minor=>({display:formatAmount(minor)});
