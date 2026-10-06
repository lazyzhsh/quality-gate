// shared 层：无外部依赖的基础工具
export const formatAmount=minor=>`${(minor/100).toFixed(2)}`;
