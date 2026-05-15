---
description: 安全推送代码到 GitHub 远程仓库，避免合并冲突导致代码丢失
---

# 安全推送代码 Workflow

## 前置检查
// turbo
1. 查看当前状态和远程分支
```bash
git status --short
git log --oneline -3
```

## 拉取远程最新代码
2. 先拉取远程，用 merge（不用 rebase）避免 ours/theirs 混淆
```bash
git pull lokacash main --no-rebase
```
- 如果没有冲突 → 继续步骤 3
- **如果有冲突** → 进入「冲突处理流程」

## 提交本地改动
3. 提交代码
```bash
git add -A && git commit -m "描述信息"
```

## 推送前检查
// turbo
4. 检查即将推送的变更文件列表，确认没有意外文件
```bash
git diff lokacash/main --stat
```
**⚠️ 必须把变更文件列表告知用户，让用户确认后再推送**

## 推送
5. 推送到远程
```bash
git push lokacash main
```

## 推送后验证
6. 在浏览器中快速验证关键功能：导航、页面结构、核心交互

---

## 冲突处理流程（当步骤 2 出现冲突时）

### ❌ 绝对禁止
- `git checkout --ours` 或 `git checkout --theirs` 批量解决冲突
- 不看 diff 就盲目选择一方

### ✅ 正确做法
1. 列出所有冲突文件
```bash
grep -rn "<<<<<<" src/
```

2. **逐个文件**打开，查看冲突标记 `<<<<<<<` 和 `>>>>>>>`，手动选择保留哪些代码

3. 解决后标记为已解决
```bash
git add <文件路径>
```

4. 完成合并
```bash
git commit
```

5. **⚠️ 必须告知用户**：哪些文件有冲突、每个冲突如何解决的、是否有代码被远程覆盖的风险
