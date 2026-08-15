// @aether/web · Spec: M3.7 — Manifestation Binding（表现绑定）
# 目标
让 Thread 可以绑定一个 Vercel 预览 URL（manifestation_url），在 ThreadItem 中展示为可点击链接。

## 范围
- 更新 createThread Server Action 支持 manifestation_url 参数
- 更新 /realms/[id] 页的创建 Thread 表单，增加可选的 Manifestation URL 输入框
- 更新 ThreadItem 组件，当 thread.manifestation_url 存在时显示"预览"链接
- 更新 lib/threads.ts 的 ThreadRow 类型，增加 manifestation_url 字段

## 验收标准
- [ ] 创建 Thread 时可填入 Manifestation URL
- [ ] ThreadItem 在有 manifestation_url 时显示可点击链接
- [ ] typecheck + lint + test 全部通过
