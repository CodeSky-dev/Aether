# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

### User Instruction Entry
User instruction entries should follow this format:

[User Instruction Summary]
- Date: [YYYY-MM-DD]
- Context: [Mentioned scenario or time]
- Instructions:
  - [Content of user teaching or instruction, described line by line]

### Project Knowledge Entry
Entries discovered by the Agent during task execution should follow this format:

[Project Knowledge Summary]
- Date: [YYYY-MM-DD]
- Context: Discovered by Agent while performing [specific task description]
- Category: [Operations & Deployment|Build Methods|Testing Methods|Troubleshooting & Debugging|Workflow & Collaboration|Environment Configuration]
- Instructions:
  - [Specific knowledge points, described line by line]

## Deduplication Strategy
- Before adding a new entry, check for similar or identical instructions.
- If a duplicate is found, skip the new entry or merge it with the existing one.
- When merging, update the context or date information.
- This helps avoid redundant entries and keeps the memory file tidy.

## Entries

[Project Knowledge Summary]
- Date: 2026-08-13
- Context: Discovered by Agent while implementing M1 Drift Persistence（IndexedDB 持久化）in @aether/editor-host
- Category: Troubleshooting & Debugging
- Instructions:
  - yjs@13.6.27 的类型声明缺少 YText.prototype.toString；读取文本应使用 `text.toJSON()`（类型已声明、语义等价），否则 ESLint 的 no-base-to-string 会误报。
  - 不可用 `declare module 'yjs' { interface YText { toString(): string } }` 做类型增强：会覆盖整个 yjs 模块类型解析，导致 Doc/Text 等导出全部丢失（tsc 报 TS2694）。
  - fake-indexeddb 测试：`indexedDB.deleteDatabase` 会被未 `close()` 的活跃连接阻塞；所有测试 helper 必须用 finally 关闭连接，并在 afterEach 中删除测试库。
  - `import * as Y from 'yjs'` 若只用作类型（无运行时 new Y.Doc()），lint 会要求改为 `import type * as Y`。
