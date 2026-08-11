# Yjs Serverless 持久化与连接管理技术探测

## 探测目标与风险条目

本探测对应 [risks.md](../risks.md) 风险 1：Yjs 在 Vercel
Edge/Serverless 环境中的 Current 持久化与连接管理。目标是为 M1 的收敛服务部署形态提供
可复现的本地量化基线，并明确哪些结论仍需要真实 Vercel 环境验证。

本地探测不包含真实 Vercel 部署、网络往返、Postgres 往返、WebSocket 服务或
Hocuspocus 服务。结果不能直接等同于 Vercel 生产性能。

## 方法与可复现命令

### 环境

- Node：`v22.13.0`
- pnpm：`11.21.0`
- 操作系统：Linux，内核 `5.15.200`
- CPU：`Intel(R) Xeon(R) Platinum 8375C CPU @ 2.90GHz`，2 vCPU
- 测量时钟：`node:perf_hooks` 的 `performance.now()`
- 延迟样本：每个 encode/apply 场景 7 次，报告中位数与线性插值 P95。

### 命令

```bash
source "$HOME/.nvm/nvm.sh" && \
nvm use 22.13.0 >/dev/null

CI=true pnpm install --config.minimum-release-age=0
pnpm --config.minimum-release-age=0 build
pnpm --config.minimum-release-age=0 lint
pnpm --config.minimum-release-age=0 typecheck
pnpm --config.minimum-release-age=0 test
pnpm --config.minimum-release-age=0 --filter @aether/editor-host probe
```

本机 pnpm 11 在 workspace 过滤脚本启动前会派生一次依赖状态检查；当既有
`@typescript-eslint@8.67.0` 条目仍落在本机 minimum-release-age 窗口内时，该派生
检查不会继承一次性 CLI flag。为验证包脚本本身，实际运行时临时设置了等价的全局
`minimum-release-age=0`，命令完成后立即删除该全局配置；仓库没有写入 `.npmrc`。
在 blueprint 已正确配置该策略或条目已过窗口的环境中，上一段带
`--config.minimum-release-age=0` 的命令即可直接运行。

探测脚本位于
`apps/@aether/editor-host/probes/serverless.ts`，默认把完整 JSON 写入
`apps/@aether/editor-host/results/yjs-serverless.json`，并同时打印到标准输出。
Vitest 断言位于 `apps/@aether/editor-host/tests/probe.test.ts`。

### 测量模型

每条客户端编辑 update 由持久的客户端 Y.Doc 生成。模拟 Serverless 请求时：

1. 从 `SnapshotStore` 读取快照与尚未压实的增量 update；
2. 将一条客户端 update 应用到新建的 Y.Doc；
3. 全量策略直接写回 `Y.encodeStateAsUpdate`；
4. 增量策略追加 update，并在每 N 条请求后写回一次全量快照。

编辑内容使用 `Y.Text` 的追加操作，而不是用普通字符串覆盖字段。这样可以观察
随编辑历史增长的快照与增量体积。`SnapshotStore` 记录读写次数、读写字节数、
增量追加次数和快照压实次数。

## 本地实测数据

以下数据来自 `yjs-serverless.json` 的一次完整运行（查阅日期：
2026-08-11）。所有字节均为二进制 `Uint8Array` 字节数，耗时单位为毫秒。

### 1. 无状态请求-响应持久化模型

场景为 1,000 条连续文本编辑；全量策略每次请求写快照，增量策略每 N 条请求压实。

| 策略 | 压实间隔 N | 读次数 | 读字节 | 写次数 | 写字节 | 压实次数 | 请求耗时中位数 | 请求耗时 P95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 每次全量快照 | — | 1,000 | 5,424,557 | 1,000 | 5,435,482 | 1,000 | 0.164 | 0.234 |
| 增量 + 压实 | 10 | 1,001 | 5,520,595 | 1,100 | 578,310 | 100 | 0.129 | 0.211 |
| 增量 + 压实 | 50 | 1,001 | 5,898,365 | 1,020 | 143,911 | 20 | 0.210 | 0.344 |
| 增量 + 压实 | 200 | 1,001 | 7,313,765 | 1,005 | 62,486 | 5 | 0.539 | 1.124 |

这里的读字节包含每次请求重建文档所需读取的快照和所有待压实 update。
因此 N 越大，写字节明显下降，但单请求重放历史的读字节与 P95 上升。
该趋势是本地内存 Store 的实测结果，不包含数据库网络延迟。

### 2. 体积与编码/应用延迟

| 编辑 update 数 | 全量快照字节 | 增量 update 累计字节 | encode 中位数 | encode P95 | apply 中位数 | apply P95 |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1,025 | 2,861 | 0.013 | 0.016 | 0.012 | 0.016 |
| 1,000 | 10,925 | 29,861 | 0.057 | 0.067 | 0.039 | 0.055 |
| 10,000 | 118,924 | 304,487 | 0.287 | 0.336 | 0.433 | 0.471 |

每个数量级先把全部客户端 update 应用到服务端文档，再对同一最终文档重复
`encodeStateAsUpdate` 7 次；`applyUpdate` 则把编码后的全量快照应用到新的空文档
并重复 7 次。这里的 apply 是全量快照应用，不是单条增量 update 应用。

### 3. 重连握手与增量对账

服务端文档包含 1,000 条 update，客户端持有前 500 条 update 的 state vector：

| 项目 | 字节 |
|---|---:|
| 回传全量快照 | 10,925 |
| 根据 state vector 回传 diffUpdate | 5,520 |
| 单次握手节省 | 5,405 |

本地断言确认应用 `diffUpdate` 后客户端文本长度为 6,890，且末尾包含最新编辑
`编辑-999;`，说明状态正确收敛。Yjs 的 state-vector/diff 计算也可以直接基于
二进制 update 完成，不要求服务端先把 update 解码成 Y.Doc；这部分 API 由
`src/yjs-adapter.ts` 统一封装。

### 4. Presence 与无状态实例

本地使用现有 loopback transport 与 `YjsProvider` 模拟客户端和服务端：

| 阶段 | 服务端看到的 actor |
|---|---|
| 初次连接并设置 Presence | `probe-client` |
| 服务端实例销毁并以空状态实例重连，客户端不重播 | 空 |
| 客户端主动重播本地 Presence 后 | `probe-client` |

这验证了 Presence awareness 状态不属于 Y.Doc 快照；在服务端实例不保留内存、
也没有共享 Presence 广播层时，客户端必须在重连时主动重播 Presence。该结论是
本地 loopback 实测，不是 Vercel 网络行为的实测。

### 5. 持久化冷启动近似

对 100 次「读取快照 → 应用一条 update → 写回全量快照」请求计时：

| 请求数 | 请求耗时中位数 | 请求耗时 P95 | 读字节 | 写字节 |
|---:|---:|---:|---:|---:|
| 100 | 0.096 | 0.110 | 52,007 | 53,032 |

这只是本机内存快照读写与 Yjs 编解码的下界参考，**不含**网络、Postgres、
连接池、函数调度、冷启动下载和 Vercel runtime 开销。不能据此宣称已经满足
风险 1 的生产指标「持久化 P95 < 300ms」。

## 外部资料结论

资料查阅日期：**2026-08-11**。

### Vercel Fluid Compute 与连接

- [Fluid Compute](https://vercel.com/docs/fluid-compute)：Fluid Compute 支持一个
  函数实例处理多个并发调用，并会复用已有实例以减少冷启动；Node.js runtime
  支持 optimized concurrency。实例内存可以被并发请求共享，但这不构成跨实例或
  跨部署的持久化保证。
- [Vercel Functions WebSockets](https://vercel.com/docs/functions/websockets)：
  WebSocket 需要启用 Fluid Compute；单个连接会固定到一个 Function 实例，但新连接
  或重连不保证进入同一个实例。新部署也可能让新连接进入新部署，而旧连接继续留在
  旧部署直到关闭。因此连接级内存不能作为唯一的 Current 状态来源。
- [Function duration](https://vercel.com/docs/functions/configuring-functions/duration)
  与 [Function limitations](https://vercel.com/docs/functions/limitations)：
  函数存在计划相关的最大执行时长；当前文档列出的 Fluid Compute 限制为 Hobby
  300 秒，Pro/Enterprise 默认/最大值与 extended duration 取决于计划和配置，
  extended 上限可到 1,800 秒。长连接会在函数达到最大时长时被终止，客户端必须
  具备重连与增量对账逻辑。
- [Edge Runtime](https://vercel.com/docs/functions/runtimes/edge)：
  Edge 提供受限 Web API 集合和 `ReadableStream`/`WritableStream` 等流 API，
  不提供完整 Node.js API。官方 Edge API 列表没有给出可用于 Yjs WebSocket
  服务端的 WebSocket upgrade/持久连接接口；因此本探测没有把 Edge WebSocket
  支持当作已确认事实。
- [Vercel WebSocket vs SSE](https://vercel.com/i/websocket-vs-server-sent-events)：
  Vercel Functions 支持基于 Web Streams 的 SSE 响应；Edge 的流 API 也为 SSE
  提供了基础能力。但 SSE 的断线、最大持续时长、代理空闲超时和生产广播行为
  仍需真实项目验证，不能仅凭流 API 证明其适合作为 Current 收敛层。

### Hocuspocus 部署与持久化

- [Hocuspocus usage](https://tiptap.dev/docs/hocuspocus/server/usage)：
  官方内置 `Server` 会启动 Web server 和 WebSocket server，典型形态是持续运行
  的 Node.js 服务。也支持把 Hocuspocus 挂载到已有 WebSocket server。
- [Database extension](https://tiptap.dev/docs/hocuspocus/server/extensions/database)：
  Database extension 通过 `fetch`/`store` 保存 Yjs 兼容的 `Uint8Array`，可以接入
  PostgreSQL、MySQL、MongoDB、S3 等外部存储；文档特别要求返回已保存的同一二进制
  状态，避免新建 Y.Doc 导致历史重复。
- [Redis extension](https://tiptap.dev/docs/hocuspocus/server/extensions/redis)：
  Redis extension 用于多实例之间同步 document updates 和 awareness states，
  只负责实例间同步，不负责持久化；持久化仍需 Database extension。因而当同一文档
  的客户端可能落到不同 Hocuspocus 实例时，需要 Redis 或等价 pub/sub/路由机制。
- [Hocuspocus scalability](https://tiptap.dev/docs/hocuspocus/guides/scalability)：
  官方将 Redis extension 作为 HA/多实例扩展；如果按 document identifier 做独立实例
  分片，也可以减少广播压力，但这要求稳定的路由或一致性哈希。

### Yjs 快照与增量 update

- [Yjs document updates](https://docs.yjs.dev/api/document-updates)：
  `Y.encodeStateAsUpdate(doc)` 生成可持久化的全量 update；传入目标 state vector
  时只编码目标缺失的差异。`Y.encodeStateVector` 描述本地状态，远端可以据此请求
  缺失内容；`Y.diffUpdate(update, stateVector)` 可以直接在二进制 update 上计算差异，
  无需把服务端 update 载入 Y.Doc。
- [Yjs offline persistence](https://docs.yjs.dev/getting-started/allowing-offline-editing)：
  数据库 provider 可以把 update 持久化到本地数据库，重新进入时加载并继续同步；
  这支持客户端在服务端暂时丢失状态后把本地最新状态重新同步回去。

上述资料没有给出「Vercel Fluid Compute + Hocuspocus + Postgres」组合的端到端
P95、连接保活成功率或实例回收时 Presence 恢复率。该组合指标标记为待真实环境验证。

## 对 M1 收敛服务部署形态的建议

### 推荐形态

M1 推荐采用**有状态 Node.js Hocuspocus 收敛服务 + 外部二进制持久化 + Redis
广播/Presence 层**：

1. Node.js runtime 负责 WebSocket、Y.Doc 生命周期、鉴权和 update 收敛；
2. Database extension 风格的 Postgres 持久化保存 Yjs 二进制快照，并可配合增量
   update 追加与周期压实；
3. Redis extension 或等价 pub/sub 负责多实例间 update 与 awareness 广播；
4. Edge/Next 只负责鉴权网关、短请求和 SSE/API 辅助，不承担 Yjs 长连接的权威状态；
5. 客户端保留 state vector，重连时优先请求 `diffUpdate`，并在连接建立后重播
   Presence。

本地数据支持这一取舍：1,000 条编辑下，N=50 的追加+压实写入 143,911 字节，
显著低于每次全量的 5,435,482 字节；但 N=200 的请求 P95 已升至 1.124ms，
且读字节升至 7,313,765。实际 N 应由 Postgres 往返、文档热度和压实预算共同决定，
本地结果不能直接给出生产 N。

### 触发降级的条件

- 如果真实 Vercel 环境中 WebSocket 连接无法稳定维持、重连不能可靠进入可用实例，
  或连接成功率持续低于风险 1 的 99.9% 阈值：将 Hocuspocus 移到独立 Node/容器
  收敛服务，WebSocket 使用独立域名，主应用只保留 REST/SSE 代理。
- 如果真实 Postgres 往返使持久化 P95 连续超过 300ms：降低单次快照频率，采用
  增量追加 + 异步压实；必要时把热文档路由到独立收敛服务。
- 如果多实例广播或 awareness 恢复无法达到业务要求：先固定 document sharding，
  再启用 Redis/兼容 pub/sub；不能依赖 Fluid Compute 的偶然实例复用。
- 如果 Edge SSE 的代理/平台超时导致广播丢失：SSE 只作为非权威通知通道，权威
  收敛仍走 Node WebSocket 或独立收敛服务。

## 仍需真实 Vercel 环境验证

- Node runtime + Fluid Compute 下 WebSocket upgrade、连接保活和最大持续时长。
- Hobby、Pro、Enterprise 实际计划配置下的 `maxDuration`、连接终止和重连表现。
- 新连接、重连、扩缩容和新部署时的实例分布；不能假设 sticky routing。
- 多实例 Hocuspocus + Redis 的 update、awareness 广播延迟与丢失率。
- Postgres/Pooler 实际快照读取、增量追加、周期压实的 P50/P95/P99。
- 单文档不同 update 数量、文本长度和并发客户端数下的内存峰值与 CPU。
- 客户端 state vector 重连握手在网络抖动、重复请求和服务端重启下的幂等性。
- 服务端实例回收后 Presence 是否按产品要求恢复；当前本地结果只证明需要客户端
  重播，未测 Vercel 的连接与代理行为。
- Edge SSE 的首字节时间、空闲超时、代理缓存、断线续传和跨区域广播。
- Postgres 失败、Redis 失败、部署切换和区域故障时的降级与数据恢复路径。
