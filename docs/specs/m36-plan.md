# Plan: M3.6 — Audit Vault

## 步骤

1. **新建 `lib/audit.ts`**
   - `listAuditLogs(input: ListAuditLogsInput): Promise<AuditRow[]>`
   - 使用 Drizzle `select()` + `where([eq(auditLog.realm_id, ...)])`
   - 从 `target JSONB` 中提取 `doc_ref` / `entity_id`（处理 `exactOptionalPropertyTypes`）

2. **新建 `components/audit-row.tsx`**
   - 渲染一行审计记录：Actor 类型、Action 标签（中文）、目标 ID、时间戳
   - Action 枚举映射到中文

3. **新建 `app/realms/[id]/audit/page.tsx`**
   - 渲染 NavShell（带 currentRealmId）
   - 调用 listAuditLogs，展示列表或空态

4. **更新 `components/nav-shell.tsx`**
   - 接受 `currentRealmId` prop
   - 当 `currentRealmId` 存在时，在 Sidebar 中额外显示"Thread 列表"和"审计记录"两个链接

5. **更新 `app/realms/[id]/page.tsx`**
   - 给 NavShell 传入 `currentRealmId={realm.id}`

## 文件变更清单

| 操作 | 路径 |
|------|------|
| 新建 | `apps/@aether/web/lib/audit.ts` |
| 新建 | `apps/@aether/web/components/audit-row.tsx` |
| 新建 | `apps/@aether/web/app/realms/[id]/audit/page.tsx` |
| 修改 | `apps/@aether/web/components/nav-shell.tsx` |
| 修改 | `apps/@aether/web/app/realms/[id]/page.tsx` |

## 风险与注意事项

- `auditLog.target` 是 JSONB，Drizzle 推断为 `unknown`，需要手动 cast 并提取字段
- `exactOptionalPropertyTypes: true` 要求 optional 属性不为 `undefined`，map 时需过滤掉 undefined 值
- M1 阶段 auth 仅为占位，审计日志查询无身份校验，后续接入组织体系后需加权限过滤
