# Changesets
Aether 使用 [Changesets](https://github.com/changesets/changesets) 管理包版本与发布。

## 当前可发布包
| 包名 | 说明 |
|------|------|
| `@aether/ui` | 设计系统（Yohaku tokens、模板、AI 可读契约） |

其余 `@aether/*` 包均为 `private: true`，不发布到 npm。

## 工作流
1. **开发时**：在 PR 中运行 `pnpm changeset`，选择变更类型（patch/minor/major）并填写摘要。
2. **合并到 main**：Release workflow 自动检测 `.changeset/*.md`，创建「Version Packages」PR。
3. **合并 Version PR**：workflow 自动执行 `pnpm changeset publish`，将 `@aether/ui` 发布到 npm。

## 配置
- `access: "restricted"` — `@aether` scope 包需 npm org 权限；如需公开发布改为 `"public"`。
- `ignore` — 列出所有 private 包，不参与版本管理。
