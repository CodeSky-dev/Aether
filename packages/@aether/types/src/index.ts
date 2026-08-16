// @aether/types · 统一入口
// 注：经包自引用而非相对 .js 路径 re-export——Turbopack 不做 .js→.ts 扩展名重映射，
// 而 package.json exports 已声明 ./domain 与 ./yjs 子路径，Node/TS/打包器均可解析。
export * from '@aether/types/domain'
export * from '@aether/types/yjs'
