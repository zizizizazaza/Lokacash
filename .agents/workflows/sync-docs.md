---
description: 编辑 docs/ 文件后自动同步到 artifact，确保 Gemini UI 渲染视图实时更新
---

# 文档同步 Workflow

## 映射关系

| 项目文件 | Artifact 文件 |
|---------|--------------| 
| `docs/TODO.md` | `loka_cash_progress.md` |
| `docs/CHAIN_ARCHITECTURE.md` | `chain_architecture.md` |

Artifact 目录：
- **当前对话**：由系统自动分配
- **固定对话**：`/Users/zzz/.gemini/antigravity/brain/bfdebbf7-9d09-4dae-9a01-3d7b8648fa7d/`（需同时更新 `.resolved` 文件）

## 规则

1. **每次编辑上述 docs/ 文件后**，必须同步到两个位置：
   - 当前对话 artifact：用 `write_to_file`（`IsArtifact=true`, `Overwrite=true`）
   - 固定对话 artifact：用 Node 脚本同时写入 `.md` 和 `.md.resolved`
2. **不要用 `cp` 命令**同步当前对话 artifact — `cp` 不会触发 artifact 系统刷新
3. 如果新增了需要在 artifact 中展示的文档，在此 workflow 中添加映射关系
4. Artifact 的 `ArtifactMetadata.Summary` 应简要描述文档内容变更
