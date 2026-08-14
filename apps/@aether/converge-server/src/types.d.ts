// @aether/converge-server · 环境类型声明
// 声明可选依赖 @hocuspocus/extension-redis 的模块类型，
// 使动态 import 在未安装该包时也能通过 typecheck。
declare module '@hocuspocus/extension-redis' {
  export interface RedisOptions {
    host?: string
    port?: number
    prefix?: string
    [key: string]: unknown
  }
  export class Redis {
    constructor(options?: RedisOptions)
  }
  const _default: { Redis: typeof Redis }
  export default _default
}
