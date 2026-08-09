# 关键技术风险与应对

本文件覆盖六大核心技术风险，每项包含影响、应对策略、降级方案、监控指标与缓解触发点。风险验证集中在对应里程碑的技术探测阶段。

## 风险总表

| # | 风险 | 影响 | 应对策略 | 降级方案 |
|---|---|---|---|---|
| 1 | **Yjs 在 Vercel Edge/Serverless 的 Current 持久化与连接管理**：Edge Functions 短生命周期，与 Yjs 长连接、文档持久化存在张力 | Current 连接不稳定、文档状态丢失 | Hocuspocus 收敛服务跑 Node runtime（Vercel Fluid Compute），职责单一化：CRDT 更新、鉴权、持久化；Edge 只承担 API 网关与 SSE 广播；Y.Doc 二进制快照周期性落 Postgres | Fluid Compute 不可用时收敛服务独立部署，WebSocket 走独立域名，主应用仅代理 REST |
| 2 | **Drizzle 在 Serverless 的连接池与冷启动**：每请求建连损耗大，且需支撑 Realm 隔离 | 请求延迟超标、多租户边界风险 | Neon/Supabase pooler（PgBouncer 模式）短生命周期连接；prepared statement 缓存；Fluid Compute 温预留；Realm 隔离用连接级与 Schema 级双保险 | 冷启动仍超标时只读热路径走 Vercel Data Cache，写路径异步化，接受写一致性的轻微延迟 |
| 3 | **Tailwind CSS 4 Rust 引擎与 Turborepo 缓存兼容性**：本地 daemon 与 CI 缓存键不一致导致脏缓存 | 构建产物不一致、缓存失效 | cache key 显式包含 Tailwind 与 `@aether/config` 版本哈希；CI 关闭 daemon 强制单次编译；`@aether/ui` 输出产物纳入 Turborepo `outputs` 白名单 | 缓存冲突反复时回退文件级 watch，放弃增量编译部分收益 |
| 4 | **TS7 Strict 下 Yjs Schema 类型推导复杂度**：Yjs API 以 `any` 为主 | Entity / Thread 类型安全难以保证 | `@aether/types` 定义类型化 Yjs 文档接口（TypedMap/TypedArray 泛型包装）；schema 由 Drizzle 反向生成类型；业务层禁止直接触碰裸 Yjs API | 核心状态点使用 Zod 运行期校验兜底，类型断言集中在单一适配文件 |
| 5 | **Next 16 + Vite 8 混合构建的边界划分与 HMR 一致性**：两套构建系统互相干扰 | 开发体验割裂、构建产物错乱 | 以包边界为切分线：SSR/RSC 归 Next，高频模块与 UI 库归 Vite；Turborepo 编排构建产物；禁止同包内混用两套 dev server | 边界被打破时全部收敛到 Next，Vite 仅保留纯库模式构建 |
| 6 | **Entity 操作幂等性与 CRDT Converge 冲突解决**：AI 行为不可预测，重复执行与并发写入放大冲突面 | 数据漂移、操作重复、冲突不可控 | 每个 Entity 操作携带幂等键与前置状态哈希，服务端去重；操作先落审计日志再应用 Current；Converge Engine 为 Entity 字段配置字段级策略 | 极端冲突下执行"审计日志为准 + 人工裁决"，自动回滚而非静默覆盖 |

## 监控指标与缓解触发点

| # | 监控指标 | 健康阈值 | 缓解触发点 |
|---|---|---|---|
| 1 | Current 连接成功率、Y.Doc 持久化延迟 | 连接成功率 ≥ 99.9%；持久化 P95 < 300ms | 连续 1 小时低于阈值 → 切换独立收敛服务部署 |
| 2 | 冷启动 P95、连接池复用率 | 冷启动 P95 < 500ms | 超阈值 → 启用 Data Cache 与写路径异步化 |
| 3 | CI 缓存命中率、构建产物一致性 | 缓存命中率 ≥ 90% | 脏缓存事故 → 回退文件级 watch |
| 4 | 类型错误逃逸到运行期次数 | 运行期类型断言错误 = 0 | 出现逃逸 → 收紧 `@aether/types` 包装层 |
| 5 | HMR 失效上报率 | 周上报 < 3 次 | 超阈值 → 统一构建系统归属 |
| 6 | 冲突率、重复操作率 | 冲突率 < 1%；重复操作率 < 0.1% | 超阈值 → 升级 Converge 字段级策略 |

## 风险验证时间点

| 时间点 | 验证内容 | 决策出口 |
|---|---|---|
| M0 末 | Yjs Serverless 持久化与连接管理（风险 1） | 决定 M1 收敛服务部署形态 |
| M1 末 | Drizzle Serverless 连接池与冷启动（风险 2） | 决定 M3 缓存与异步化方案 |
| M2 全程 | TS7 Strict + Yjs 类型包装有效性（风险 4） | 决定类型包装层是否加 Zod 兜底 |
| M3 前 | Entity 幂等性与冲突策略压测（风险 6） | 决定公测前冲突策略版本 |

## 版本稳定性标注

以下选型处于生态活跃期，存在 API 变动风险，落地时需锁定已验证版本并纳入 cache key：

- **Tailwind CSS 4**：插件语法仍在演进，锁定版本，暂缓跟随 minor 升级。
- **Better-Auth**：组织模型与生态较新，锁定文档版本，由 `@aether/auth` 适配层隔离升级冲击。
- **Next.js 16 / Vite 8**：混合构建边界策略（风险 5）在 M0 技术探测中先行验证，避免地基阶段返工。

对应降级路径均已在本文件"降级方案"与 [tech-decisions.md](./tech-decisions.md)"弃用信号"中固化，不改变核心术语架构与数据模型。
