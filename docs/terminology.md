# Aether 术语体系与命名守则

本文件是 Aether 品牌术语体系的唯一事实源。所有架构设计、功能描述、数据模型命名、API 端点与代码标识符均须遵守本文约定。

## 术语对照表

| Aether 术语 | 通用术语 | 技术映射 | 使用位置 |
|---|---|---|---|
| Realm | Workspace / Project | Better-Auth Organization + Drizzle Schema 隔离边界 | 数据库 `realms` 表、API 路径 `/realms`、组织模型 |
| Current | Real-time Session | Yjs Provider 连接实例 + Presence 状态流 | `currents` 表、`@aether/current-sync` 包、连接生命周期 |
| Entity | AI Agent | Better-Auth Identity + Yjs Cursor + Drizzle Audit Log | `entities` 表、`@aether/entity-core` 包、AI 运行时 |
| Thread | Issue / Ticket | 绑定文件范围 / 代码片段 / Manifestation URL / 对话历史的叙事单元 | `threads` 表、`@aether/thread-bindings` 包 |
| Converge | Sync / Merge | Yjs CRDT 无冲突合并操作 | 收敛服务、重连对账、合并策略 |
| Drift | Offline Mode | Yjs IndexedDB 持久化 + Drizzle 本地缓存状态 | `@aether/editor-host` 离线层、本地缓存表 |
| Manifestation | Deploy Preview | Vercel Preview Deployment 作为可协同标注的对象 | `@aether/manifestation` 包、标注数据模型 |
| Resonance | Plugin / Extension | 通过公开 API 实现的扩展 | `@aether/resonance` 包、公开 API 市场 |

## 命名守则

### 1. 代码与数据层（强制使用术语）

以下场景中的技术标识符必须使用 Aether 术语，禁止使用通用术语：

| 场景 | 强制术语 | 示例 |
|---|---|---|
| 数据库表名 | `realms`、`threads`、`entities`、`currents`、`manifestations` | 禁止 `workspaces`、`issues`、`agents`、`sessions` |
| API 路径 | `/realms`、`/threads`、`/entities`、`/currents` | 禁止 `/workspaces`、`/issues` |
| 环境变量前缀 | `AETHER_` | `AETHER_DATABASE_URL` |
| 包名 | `@aether/*` | `@aether/current-sync` |
| 类型与常量命名 | 术语对应的英文标识符 | `RealmTree`、`EntityIdentity` |

### 2. 用户可见层（保留标准工程用语）

对外文档、错误信息、设置页面、帮助中心保留标准工程用语，确保可读性与可用性：

| 场景 | 推荐用语 |
|---|---|
| 错误提示 | "您当前处于离线模式，改动将在重连后自动合并" |
| 设置页 | "组织 / 项目 / 成员" |
| 帮助文档 | "团队空间"、"AI 成员"、"缺陷 / 任务" |

术语守则的边界判断：**机器可读的位置用术语，人直接读的位置用标准用语**。

## 应替换为术语的通用词

以下通用词在架构文档与代码中应被替换，替换表与对照表保持一致：

| 通用词 | 替换为 |
|---|---|
| 工作区 / 项目空间 | Realm |
| 实时会话 / 连接会话 | Current |
| AI 代理 / 智能体 | Entity |
| 缺陷 / 工单 | Thread |
| 合并 / 同步 | Converge |
| 离线模式 | Drift |
| 部署预览 | Manifestation |
| 扩展 / 插件 | Resonance |

## 术语使用检查清单

- [ ] PR 中的新表名、新 API 路径是否使用术语？
- [ ] 错误信息与 UI 文案是否使用标准工程用语？
- [ ] 环境变量是否带 `AETHER_` 前缀？
- [ ] 对外公开 API 文档的术语解释是否指向本文件？
- [ ] 是否出现应替换为术语的通用词（见上方替换表）？
