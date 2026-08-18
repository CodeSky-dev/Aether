# Spec: M3.6 — Audit Vault
## 目标
为已实现的 Entity Audit Trail（M2 阶段）提供用户界面，让用户可以在 `@aether/web` 中查看 Realm 的所有操作审计记录。
## 范围
- 新增 Server Action `listAuditLogs(realmId, ...)`
- 新增页面 `/realms/[id]/audit`
- 新增组件 `AuditRowItem`
- 在 NavShell 侧边栏增加"审计记录"入口（仅在 Realm 详情页下显示）
## 架构
```
Realms/[id]/audit/page.tsx
  └── NavShell (currentRealmId → Sidebar 显示审计导航)
       └── listAuditLogs(realmId) → AuditRowItem[]
```
## 数据流
```
Server Action: listAuditLogs(realmId, limit?, actorType?, action?)
  ↓
drizzle ORM: auditLog table WHERE realm_id = ? ORDER BY created_at DESC LIMIT ?
  ↓
AuditRow { id, realm_id, actor_type, actor_id, action, doc_ref?, entity_id?, payload_hash, created_at }
  ↓
AuditRowItem × N
```
## 验收标准
- [x] 访问 `/realms/[id]/audit` 显示审计记录列表（或空态）
- [x] NavShell 侧边栏在 `/realms/[id]` 下显示"审计记录"链接
- [x] 点击"审计记录"跳转到 `/realms/[id]/audit`
- [x] 无 TypeScript 类型错误
- [x] ESLint 无报错
- [x] 现有 test 仍然通过
