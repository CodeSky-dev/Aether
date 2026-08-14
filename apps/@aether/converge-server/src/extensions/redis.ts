// @aether/converge-server · Redis Extension Seam
// 探测文档推荐：多实例部署时用 Redis extension 同步 document updates 和 awareness。
// M1 阶段预留 seam，通过 REDIS_URL 环境变量启用。
// 未设置 REDIS_URL 时返回 null（单实例模式，InMemoryBroadcastPort 已足够）。
import type { Extension } from '@hocuspocus/server'

export interface RedisExtensionOptions {
  /** Redis 连接 URL（如 redis://localhost:6379） */
  redisUrl: string
  /** 可选的 Redis 前缀，用于多租户隔离 */
  prefix?: string
}

/**
 * 创建 Redis extension（如果可用）。
 *
 * 动态导入 @hocuspocus/extension-redis 以避免硬依赖。
 * M1 阶段不安装该包；多实例部署时执行 `pnpm --filter @aether/converge-server add @hocuspocus/extension-redis`。
 */
export async function createRedisExtension(
  options: RedisExtensionOptions,
): Promise<Extension | null> {
  try {
    const mod = await import('@hocuspocus/extension-redis')
    const RedisExtension = mod.Redis ?? mod.default
    if (!RedisExtension) {
      return null
    }
    return new RedisExtension({
      host: extractHost(options.redisUrl),
      port: extractPort(options.redisUrl),
      prefix: options.prefix ?? 'aether:',
    })
  } catch {
    // @hocuspocus/extension-redis 未安装
    // eslint-disable-next-line no-console
    console.warn(
      '[converge-server] @hocuspocus/extension-redis not installed. ' +
        'Running in single-instance mode. Install it for multi-instance broadcast.',
    )
    return null
  }
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'localhost'
  }
}

function extractPort(url: string): number {
  try {
    const port = new URL(url).port
    return port ? parseInt(port, 10) : 6379
  } catch {
    return 6379
  }
}
