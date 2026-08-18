# Spec: M3.5 — Web UI 基础层

## 目标

为已就绪的 M0–M2 引擎层构建可访问的 Web UI 入口，让用户可以：

1. 在落地页点击进入 Realm 列表
2. 浏览/创建 Realm
3. 进入 Realm 后查看 Thread 列表
4. 打开 Thread 的 Current（协同编辑器）

这是"引擎可用"到"产品可用"的关键一步。

## 范围

### 包含

- 导航 Shell：Header + 左侧 Sidebar + 主内容区
- `/realms` 页：Realm 列表 + 新建 Realm 表单
- `/realms/[id]` 页：Thread 列表 + Current 编辑器入口
- `@aether/web` 内组件：`RealmCard`、`ThreadItem`、`CurrentEditor`

### 不包含（后续 M3 任务）

- Entity 管理 UI（需先实现 Entitlement Engine）
- Audit Vault 界面
- Resonance Gateway 文档
- SSO/SCIM 配置面板
- Marketplace 预览

## 设计约束

- 遵循 docs/design/yohaku.md：role+px 字号、三档暖灰、accent ≤ 5%
- 所有数据读取走 Server Actions 或 API，不直接调 DB
- Current 编辑器绑定 `@aether/current-sync` Yjs Provider
- 状态管理用 Zustand（已有 `@aether/state` 包）

## 架构

```
/apps/@aether/web
├── app/
│   ├── layout.tsx          ← 增加 NavShell
│   ├── page.tsx            ← Landing（保留现有）
│   ├── realms/
│   │   ├── page.tsx        ← Realm 列表
│   │   └── [id]/
│   │       └── page.tsx    ← Thread + Current
│   └── actions/
│       └── current.ts      ← 已有
├── components/
│   ├── nav-shell.tsx       ← Header + Sidebar
│   ├── realm-card.tsx      ← Realm 卡片
│   ├── thread-item.tsx     ← Thread 行
│   └── current-editor.tsx  ← Yjs Provider + Y.Doc 编辑器
└── lib/
    └── realms.ts           ← Realm fetch actions (new)
```

## 数据流

```
Server Action (listRealms)
    ↓
React state (useEffect)
    ↓
RealmCard list
    ↓
Click → /realms/[id]
    ↓
Server Action (listThreads)
    ↓
ThreadItem list
    ↓
Click Thread → CurrentEditor (Yjs Provider 挂载)
    ↓
Yjs updates → serializeUpdate → appendCurrentUpdate (Server Action)
    ↓
Broadcast → other clients
```

## 验收标准

- [x] 访问 `/` 显示现有 Landing 页
- [x] 点击「进入 Realm」跳转到 `/realms`
- [x] `/realms` 列出所有 Realm（空态友好）
- [x] 可在 `/realms` 创建新 Realm（调用 `createRealm` action）
- [x] 点击 Realm 卡片进入 `/realms/[id]`
- [x] `/realms/[id]` 展示 Thread 列表
- [x] 创建新 Thread 后可在 Current Editor 中编辑
- [x] Editor 变更经 Server Action 落库并广播
- [x] 无 TypeScript 类型错误
- [x] 现有 channel-service.test.ts 仍然通过
