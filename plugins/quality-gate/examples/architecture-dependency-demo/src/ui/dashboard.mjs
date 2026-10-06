// ui 层：依赖 core 与 shared
import {quote} from '../core/engine.mjs';
import {formatAmount} from '../shared/format.mjs';
export const render=minor=>`quote: ${quote(minor).display} (${formatAmount(minor)})`;
