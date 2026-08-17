# Aether 全面代码审查报告（2026-08-17）

## 一、审查概览

| 项目 | 内容 |
|---|---|
| 审查对象 | Aether monorepo（Turborepo + pnpm，15 个包，约 1.5 万行 TS） |
| 审查方式 | 文档比对 + 全量代码走查 + 已有 CI 日志复核 |
| 审查基线 | main @ `9094e79`，工作树干净 |
| 质量基线 | `pnpm typecheck` / `lint` / `test` / `build` 全绿（turbo 19 个任务全部成功，共 4 个测试包 264 个用例通过） |

## 二、当前开发进度基线

- M0（基础设施与脚手架）：全部完成
- M1（Core Current 引擎 MVP）：全部完成，含 IndexedDB Drift 持久化与 Reconnect Handshake
- M2（Entity 与 Context-Bound Threads）：全部完成
- M3（企业级特性与公测）：进行中
  - M3.5 Web UI 基础层：已实现（/realms、/realms/[id]、Realm/Thread 创建、Current 编辑器）
  - M3.6 Audit Vault：实现中（页面、行组件、查询 action 已落地）
  - M3.7 Manifestation Binding：包已存在，web 层未接入
  - Entitlement Engine、SSO/SCIM、Resonance Gateway、Webhook、OAuth、Marketplace、Self-host Beacon、性能优化、Converge Telemetry：未开始

`@aether/observability` 与 `@aether/resonance` 目前是空壳包（`export {}`），仅预留依赖。

## 三、问题清单

按严重度分级。P0 为功能失效或核心协同错误，P1 为明显逻辑/验收缺陷，P2 为质量与一致性问题，P3 为低优先级建议。

### P0 · 严重

**1. 多用户协同实际失效：同 actorId 的远端更新被全部跳过**

- 位置：`apps/@aether/web/components/current-editor.tsx:87`（默认 `actorId = 'web-client'`）、`:157`（`item.idempotencyKey.startsWith(`${actorId}:`)` 跳过）
- 问题：M1 阶段无登录，所有用户共享默认 actorId `'web-client'`。客户端轮询时把"actorId 前缀相同"当作"自己的更新"跳过。用户 B 会跳过用户 A 的全部更新，双客户端并发编辑互相看不到内容。`M1 退出标准"双客户端并发编辑无数据丢失"`实际未满足。
- 同类隐患：`apps/@aether/web/lib/current/channel-client.ts:139`（该文件本身未使用，见 P2-9）。
- 建议：idempotencyKey 前缀应改用"会话级唯一 ID"（如 sessionId），且由于 Yjs applyUpdate 对已包含内容幂等，客户端根本无需跳过自己的更新；server 端已有 (doc_ref, idempotency_key) 唯一约束做幂等。

**2. 创建 Thread 必然失败：project_id 硬编码占位值**

- 位置：`apps/@aether/web/components/create-thread-form.tsx:25`（`projectId: 'proj-${realmId}'`）
- 问题：`threads.project_id` 是 `uuid notNull references projects.id`（`packages/@aether/db/src/schema.ts:185`）。`proj-xxx` 不是合法 UUID 且无对应 project 记录，Postgres 插入必然报错（invalid input syntax / foreign key violation）。
- 建议：创建 Thread 前必须选定真实 project（`listProjects` 已存在于 `lib/threads.ts:79`，但表单未使用），或对 schema 放宽约束。

**3. 点击 Thread 跳转到不存在的路由**

- 位置：`apps/@aether/web/components/thread-item.tsx:31`（`href={/realms/${realm_id}/current/${thread.id}}`）
- 问题：web 应用只有 `/realms`、`/realms/[id]`、`/realms/[id]/audit` 三条路由，无 `/realms/[id]/current/[threadId]`。点击任意 Thread 行均 404。M3.5 规范要求"点击 Thread → 打开 CurrentEditor（同页内联）"，实现与规范不符。
- 建议：改为点击后在当前页内联展开 CurrentEditor（复用 `current-editor.tsx`），或补齐该路由。

### P1 · 较高

**4. Audit 页面侧边栏缺失，M3.6 验收未达成**

- 位置：`apps/@aether/web/app/realms/[id]/audit/page.tsx:25`（NavShell 只传 `currentRealmName`）；`apps/@aether/web/components/nav-shell.tsx:48`（`currentRealmId !== undefined` 才渲染 Sidebar）
- 问题：audit 页未传 `currentRealmId`，Sidebar 不渲染，"审计记录/Thread 列表"导航在该页缺失。`docs/specs/m36-audit-vault.md` 验收标准"NavShell 侧边栏在 /realms/[id] 下显示审计记录链接"未满足。而 `app/realms/[id]/page.tsx:27` 传了 `currentRealmId={realm.id}`，两处行为不一致。

**5. 编辑器"保存中…"状态永不消失**

- 位置：`apps/@aether/web/components/current-editor.tsx:127-131`
- 问题：append 成功分支未调用 `setSaving(false)`，仅 catch 分支重置。输入一次后"保存中…"永久显示。

**6. 远端光标列定位 transform 为非法 CSS，整条被丢弃**

- 位置：`apps/@aether/web/components/current-editor.tsx:359`
- 问题：`translateX(${Math.min(cursor.col * 0.6, 90)}ch * 0.6)` 生成形如 `5.4ch * 0.6` 的字符串，CSS calc 不支持 `*`，整个 transform 声明失效。光标只能按行定位，列偏移无效。
- 建议：改为 `translateX(calc(0.75rem + ${cursor.col * 0.6}ch))` 形式的合法计算。

**7. 审计列表缺少过滤与分页 UI**

- 位置：`apps/@aether/web/app/realms/[id]/audit/page.tsx`
- 问题：`lib/audit.ts` 支持 `actorType` / `action` 过滤与 `limit`，spec 数据流亦定义 `limit?`、`actorType?`、`action?`，但页面固定 `listAuditLogs({ realmId })` 只取默认 100 条，无过滤控件、无分页/加载更多。审计量大时数据不可达。

**8. NavShell "所有 Realm" 链接在子路由下误高亮**

- 位置：`apps/@aether/web/components/nav-shell.tsx:61`（`isActive` 用 `pathname.startsWith(href + '/')`）、`:67-75`
- 问题：进入 `/realms/[id]` 时 `/realms` 的 `startsWith('/realms/')` 为 true，"所有 Realm"与"Thread 列表"同时高亮。audit 高亮用 `pathname.includes('/audit')`，三处高亮判定规则不统一。

### P2 · 中等

**9. `channel-client.ts` 为死代码，且与 current-editor 重复实现轮询逻辑**

- 位置：`apps/@aether/web/lib/current/channel-client.ts`（全文件）
- 问题：`CurrentChannelClient` 无任何引用。其"轮询 + 幂等跳过"逻辑在 `current-editor.tsx` 被复制实现，且两份实现不一致（channel-client 有 destroyed 保护与可注入生成器，editor 内联版更简陋）。双份实现维护时必然漂移。

**10. 表单提交后以 `window.location.reload()` 刷新页面**

- 位置：`apps/@aether/web/components/create-realm-form.tsx:24`、`create-thread-form.tsx:31`
- 问题：以整页硬刷新代替服务端组件 revalidate（`router.refresh()`），体验粗糙且有 300ms 延迟技巧。创建成功后 `created` 状态也未在刷新前利用。

**11. 两套编辑器宿主使用不同的 Y.Doc 内容结构**

- 位置：`apps/@aether/editor-host/src/core/doc.ts:29-31`（`doc.getText('code:...')`）对比 `apps/@aether/web/components/current-editor.tsx:67-74`（`doc.getMap('content')` 内嵌 `Y.Text`）
- 问题：同一 Realm 文档在 editor-host 与 web 下结构不兼容，两个宿主无法互开同一 doc。当前互不连通掩盖了该问题，接入 Hocuspocus 统一通道后会暴露。

**12. `listAuditLogs` 返回接口未声明的字段**

- 位置：`apps/@aether/web/lib/audit.ts:48`
- 问题：`AuditRow` 接口无 `realm_id`，map 返回对象却带 `realm_id`，靠 tsc 的 excess property check 不触发而通过，但契约外字段存在漂移风险。应补进接口或删除。

**13. Presence 心跳并发读写丢更新**

- 位置：`apps/@aether/web/lib/presence.ts:74-96`
- 问题：`setPresence` 是 read-modify-write 整包覆写 `presence_snapshot`。多个 session 同时上报时可能互相覆盖（last-write-wins 丢 session）。注释已承认"并发下可能产生多行"。多人实时编辑时实况为多 session 并发，建议改为 JSONB 行级更新或合并写。

**14. Hocuspocus 冷加载硬上限 10000 条增量，超出静默截断丢数据**

- 位置：`apps/@aether/converge-server/src/extensions/database.ts:22`（`MAX_LOAD_LIMIT = 10_000`）、`:54-65`
- 问题：超过 10000 条增量时只加载前 10000 条，后续状态丢失且无告警。建议循环翻页或定期压实快照。

**15. Redis 广播扩展缺失依赖时静默降级单实例模式**

- 位置：`apps/@aether/converge-server/src/extensions/redis.ts:34-42`
- 问题：配置了 `REDIS_URL` 但未安装 `@hocuspocus/extension-redis` 时仅 warn 后返回 null，多实例部署会静默失去跨实例广播。建议将 warn 提升为 fail-fast 或启动时强制校验。

**16. `dialogue_messages` 不在 Realm 隔离守卫白名单**

- 位置：`packages/@aether/db/src/guards.ts:9-18`（REALM_TABLES 缺 `dialogue_messages`）
- 问题：dialogue_messages 表带 realm_id 且 schema 已定义，一旦有查询经 `realmScope` 会抛 "does not support realm isolation"。当前无查询使用，属潜在地雷。

**17. `crdt_updates.seq` 语义注释与实现不符**

- 位置：`packages/@aether/db/src/schema.ts:248-249`
- 问题：注释称"每个 doc_ref 单调递增的重放游标"，实际 `bigserial` 是表级共享序列，per-doc 存在空洞（不影响单调性与重放正确性，但语义表述有误导）。

**18. 全部 Server Actions 无身份校验，任意请求可读写任意 Realm**

- 位置：`apps/@aether/web/lib/realms.ts`、`lib/threads.ts`、`lib/audit.ts`、`lib/presence.ts`、`app/actions/current.ts` 全量
- 问题：m35/m36 plan 已声明"M1 阶段无 auth 守卫"为已知风险，但作为多租户产品这仍是安全缺口：`/realms/[id]/audit` 可直接读取任意 realm 审计日志，`appendCurrentUpdate` 可向任意 doc 写入。建议在接入 Entitlement Engine 前至少加一个可关闭的鉴权中间层。

**19. `realms.slug` 无唯一约束，重复 slug 可创建多个 Realm**

- 位置：`packages/@aether/db/src/schema.ts:92`（`index('realms_slug_idx')` 非 unique）
- 问题：创建 Realm 时无 slug 冲突校验，同一 slug 可重复创建，且 `schema_namespace: ns_${slug}` 也随重复而产生歧义。建议改为 uniqueIndex。

**20. Next.js dev server 未配置 `allowedHosts`**

- 位置：`apps/@aether/web/next.config.ts`
- 问题：未配置 `experimental.allowedHosts: ['.monkeycode-ai.online']`，在线预览经 `*.monkeycode-ai.online` 域名访问 dev server 时可能被 Next 拒绝。

**21. 双客户端/多标签页场景下的编辑体验依赖全量替换**

- 位置：`apps/@aether/web/components/current-editor.tsx:298-305`
- 问题：每次 input 事件执行 `yText.delete(0, len) + insert(0, newText)` 全量替换，产生巨大 Yjs update、破坏细粒度合并与 undo 语义。功能可收敛但质量低，建议接入 ProseMirror/Lexical 或至少做差量同步。

### P3 · 低优先级

**22. `AuditRowItem` 未展示 actor_id 与 payload_hash**：与 m36 spec 数据流定义字段（actor_id、payload_hash）不符，审计可追溯性打了折扣。

**23. `listManifestationsByThread` 注释与实现不符**：`packages/@aether/manifestation/src/manifestation.ts:101-103` 注释称"从 audit 日志回溯历史绑定"，实现仅返回当前 URL。

**24. `m36-plan.md` 步骤描述与实现漂移**：plan 步骤 4 描述 NavShell 接受 `currentRealmId`，实际组件同时接受 `currentRealmName`/`currentRealmId`，且 audit 页使用前者（见 P1-4）。文档需同步更新。

**25. `docs/specs/m36-audit-vault.md` 验收清单未勾选**：验收标准六项全为 `[ ]`，按规范应随实现逐项确认。

**26. `current-editor.tsx` 首次连接失败不重试**：`getCurrentCursor().catch(() => setConnected(false))`（:191-193）失败后无重试，页面永久显示"连接中…"。

**27. `README.md` 几乎为空**（仅一行标题），新成员无法从根 README 快速了解项目，与 M0"新成员 clone 后一条命令启动"体验不符。

**28. git 历史仅有 2 个提交**：开发轨迹整体 squash，无法按里程碑/PR 追溯变更责任，建议恢复按任务粒度提交并保留 MR 记录。

**29. `@aether/auth` 的 `sendInvitationEmail` 为 no-op**：`packages/@aether/auth/src/instance.ts:36` 静默丢弃邀请邮件，SSO/SCIM 落地前应至少打日志或提供占位实现。

**30. 文档与代码脱节风险**：`docs/roadmap/milestones.md` 中 M1/M2 全部打勾、M3 未完成，但 `observability`、`resonance` 空壳包已声明依赖（`@aether/observability` 依赖 `@aether/types`，`@aether/resonance` 依赖 auth/db/types），空包空跑，建议要么尽快填充实现要么暂缓建包。

## 四、确认良好的部分

- **构建与质量管线**：typecheck / lint / test / build 全部通过，测试覆盖 6 个包 264 个用例；`@aether/ui check` 校验 tokens.css ↔ yohaku.md ↔ 模板一致性，CI 分 build/check 两 job。
- **数据层设计**：`realmScope` 强制 Realm 隔离的守卫模式清晰，crdt_updates 幂等键 + 单调 seq 重放设计合理（风险 6 的应对落地）。
- **Yjs 封装**：`@aether/current-sync` 将裸 Yjs API 收敛到单一适配层（yjs-adapter.ts），符合 risks.md 风险 4 的"类型断言集中在单一适配文件"策略。
- **模块边界**：包导出遵循 monorepo-structure，`@aether/auth` 隔离 Better-Auth、`@aether/types` 作为术语唯一事实源，职责划分清晰。
- **审计设计**：`@aether/entity-core` 的 audit append-only + sha256 payload_hash + 幂等键策略，与 risks.md 风险 6 一致。

## 五、后续建议

1. 优先修复 P0 三项（协同跳过、projectId 硬编码、Thread 路由），P0-1 是"双客户端并发编辑"这一核心卖点的直接破坏项。
2. 按 m36 验收标准逐项确认并勾选，修复 P1-4 的 NavShell 传参问题。
3. 审计查询补齐过滤与分页 UI（P1-7），并与 Entitlement Engine（M3 未开始任务）联动补上权限过滤（P2-18）。
4. 统一编辑器宿主文档结构（P2-11）与轮询实现（P2-9），为 Hocuspocus 权威通道接入扫清障碍。
5. 文档维护：按 docs/README.md 的维护约定，本次修复 PR 应同步更新 m36-plan、m36-audit-vault 验收勾选。
