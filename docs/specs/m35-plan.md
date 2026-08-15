# Plan: M3.5 — Web UI 基础层

## 步骤

### Step 1：新增 Realm Actions（`lib/realms.ts`）
- 写 `listRealms(userId?)` Server Action，查询 realms 表
- 写 `createRealm(input)` Server Action，调用 `createRealm` from `@aether/db`
- 写 `listThreads(realmId)` Server Action，查询 threads 表
- 写 `createThread(input)` Server Action，创建 thread

### Step 2：NavShell 组件（`components/nav-shell.tsx`）
- 顶部 Header：Aether logo + 当前 Realm 名称（若已在 Realm 内）
- 左侧 Sidebar：链接到 `/realms`、当前 Realm 下的 Thread 列表入口
- 样式遵循 yohaku.md：neutral-10 背景，accent 仅用于 active 状态

### Step 3：更新 layout.tsx
- 引入 NavShell，包裹 `<Outlet />`（Next.js 中为 children）
- 仅在 `/realms` 和 `/realms/[id]` 下显示 Shell；Landing 页保持简洁

### Step 4：`/realms` 页
- Server Action 拉取所有 Realm
- 渲染 RealmCard 列表
- 提供"新建 Realm"表单（slug + name）
- 空态提示：引导用户创建第一个 Realm

### Step 5：`/realms/[id]` 页
- Server Action 拉取该 Realm 的 Threads
- 渲染 ThreadItem 列表
- 提供"新建 Thread"按钮（打开 modal 或 inline form）
- 点击 Thread → 打开 CurrentEditor（同页内联）

### Step 6：CurrentEditor 组件
- 接收 `realmId` + `docRef` props
- 创建 Y.Doc，挂载 `@aether/current-sync` YjsProvider
- 使用 transport: WebSocket 到 converge-server（开发时 localhost:1234）
- 渲染 content partition 的 Y.Text，绑定到 textarea/contenteditable
- 变更经 `appendCurrentUpdate` Server Action 落库

### Step 7：验证
- `pnpm --filter @aether/web typecheck`
- `pnpm --filter @aether/web test`
- 手动启动 dev server 验证路由导航

## 文件变更清单

| 操作 | 路径 |
|------|------|
| 新建 | `apps/@aether/web/lib/realms.ts` |
| 新建 | `apps/@aether/web/components/nav-shell.tsx` |
| 新建 | `apps/@aether/web/components/realm-card.tsx` |
| 新建 | `apps/@aether/web/components/thread-item.tsx` |
| 新建 | `apps/@aether/web/components/current-editor.tsx` |
| 新建 | `apps/@aether/web/app/realms/page.tsx` |
| 新建 | `apps/@aether/web/app/realms/[id]/page.tsx` |
| 修改 | `apps/@aether/web/app/layout.tsx` |

## 风险与注意事项

- **Converge Server 未启动时**：Current Editor 应优雅降级到纯本地 Yjs（不广播），通过 connectionState 监听判断
- **Server Actions 无 auth 保护**：M1 阶段已注明"仅日志"，此 UI 同理，Realm 查询不强制身份验证
- **Yjs Provider transport**：开发时用 loopback 或 WebSocket 直连，生产时切换 Hocuspocus URL
- **Drizzle schema 变化**：若 realms/threads 表字段与 schema.ts 不一致，typecheck 会报错
