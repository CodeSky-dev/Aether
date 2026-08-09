# 团队协作规范

本文件定义 Aether 团队的协作流程与质量门禁，覆盖 Git 流、数据库迁移、CRDT 结构版本、预览策略、Entity 审计与术语守则。

## 1. Git 协作流

### 分支策略

- 采用 Trunk-based 开发 + 短生命周期特性分支。
- 分支命名：`converge/{scope}/{描述}`，例如 `converge/thread-bindings/code-anchor`。
- 每个特性分支自动生成 Manifestation（见第 4 节）。

### 提交规范

- 采用 Conventional Commits，类型限定 `feat / fix / refactor / perf / chore`。
- 提交信息中的组件引用使用 Aether 术语包名，例如 `feat(@aether/current-sync): add reconnect handshake`。
- 禁止将多个无关变更合入同一提交。

### 合入门禁

- 每次合入必须通过 CI（typecheck + test + build）并伴随一次成功构建。
- PR 评审检查清单见第 7 节。

## 2. Drizzle 迁移流程

固定流程，禁止跳过任一步骤：

1. 修改 `@aether/db` 中的 schema。
2. 使用 Drizzle Kit 生成迁移文件，迁移随 PR 一并提交审查。
3. 在预生产环境执行迁移并校验数据完整性。
4. 人工 review 迁移 SQL，确认索引、约束与 Realm 隔离边界。
5. 生产环境 apply，记录迁移版本。
6. 禁止手工修改已提交的迁移文件；修正必须新增迁移。

## 3. CRDT 结构版本管理

- CRDT 文档结构携带版本号，由 `@aether/types` 集中管理。
- 升级采用"先写后读兼容"策略：旧客户端可读新数据。
- 破坏性变更必须伴随迁移脚本与双版本窗口，禁止原地改写结构。
- 收敛服务（Hocuspocus）与客户端共享同一版本校验模块。

## 4. Vercel 分支 Manifestation 策略

- 每个特性分支自动生成 Manifestation，预览环境注入隔离的 Realm 测试数据。
- 合并主干即冻结该分支的 Manifestation，Gallery 归档。
- 生产与预览使用不同 Postgres 分支，杜绝数据串域。
- Manifestation 作为可协同标注对象，标注数据走 `@aether/manifestation` 持久化。

## 5. Entity 行为审计规范

- 审计事件按分类入账：读取、写入、权限变更、对话、执行。
- Entity 操作强制携带幂等键，服务端去重后再落 Current。
- 涉及删除、权限变更、跨 Realm 的操作默认触发 Handoff Gate，人类裁决留痕。
- 审计日志仅允许追加，不可变、可导出，保留期由 Audit Vault 配置。

## 6. Aether 术语使用守则

- 代码标识符、API 端点、数据库表名强制使用术语（`realms` / `threads` / `entities` / `currents` / `manifestations`）。
- 面向最终用户的 UI、错误信息与文档保留标准工程用语。
- 术语表以 [terminology.md](../terminology.md) 为唯一事实源，代码 schema 与文档双源校验。

## 7. PR 评审检查清单

- [ ] 新表名、新 API 路径使用 Aether 术语
- [ ] 错误信息与 UI 文案使用标准工程用语
- [ ] Entity 操作携带幂等键，审计埋点齐全
- [ ] 迁移文件已提交，预生产校验通过
- [ ] CRDT 结构版本号已更新，双版本兼容验证通过
- [ ] 分支已生成 Manifestation，预览数据隔离
- [ ] CI 全绿：typecheck + test + build
- [ ] 无应替换为术语的通用词残留

## 8. 评审节奏

- 代码变更与对应文档（docs/ 目录）同 PR 评审，禁止文档落后超过一个里程碑周期。
- 风险相关变更必须引用 [risks.md](./risks.md) 对应风险条目。
