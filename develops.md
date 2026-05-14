# 开发思路与开发日志

## 开发思路

### 1. 目标

构建一个基于思源笔记插件体系的同步工具，将思源闪卡手动同步到 Anki，并尽量保留 Markdown 内容结构，尤其是公式内容。

### 2. 技术选择

- 模板：`plugin-sample-vite-vue`
- 前端：`Vue 3 + TypeScript`
- 构建：`Vite`
- 思源侧：`siyuan` 插件 API
- Anki 侧：`AnkiConnect`

### 3. 为什么选择 Vue 模板

相对基础模板与 Svelte 模板，本项目优先选择 `plugin-sample-vite-vue`：

- **用户体验**：更容易快速搭建设置页、预览页、日志页等管理界面。
- **开发效率**：Vue 的响应式状态适合做同步预览、日志输出、表单管理。
- **可维护性**：组件划分清晰，后续加入更多配置项和同步策略时扩展更自然。
- **生态适配性**：与现有思源插件模板兼容良好，构建链路稳定。

### 4. 当前架构设计

#### UI 层

- AnkiConnect 连接测试
- Anki 卡组选择
- Anki 笔记类型选择
- 来源块 ID 输入
- 同步预览
- 执行同步
- 同步日志展示

#### 配置层

保存以下信息：

- AnkiConnect 地址
- 默认卡组
- 默认笔记类型
- 来源块 ID 列表

#### 同步层

当前采用“显式块 ID + Markdown 分隔”的初步策略：

- 用户指定要同步的思源块 ID。
- 插件读取块的 kramdown/Markdown 内容。
- 使用 `---` 或 `***` 分隔正反面。
- 基于哈希比对判断新增、更新、删除。

#### 数据层

本地持久化：

- 配置信息
- `blockId -> anki noteId` 映射
- 每张卡的摘要哈希
- 最近同步后的卡组/模型信息

### 5. Markdown 适配策略

- 以 Markdown 为主，不以富文本 HTML 为主。
- 对公式保留原始标记，避免丢失数学表达式语义。
- 优先传输 `Front` / `Back` 原始文本字段。
- 将 Markdown 渲染能力尽量放到 Anki 端模板或插件层解决。

### 6. 当前已实现的初步开发内容

- 初始化 `ankiLinker/` 插件工程。
- 完成插件基础加载与 Vue 主界面挂载。
- 实现 AnkiConnect 客户端。
- 实现卡组与笔记类型远程拉取。
- 实现本地配置与映射存储。
- 实现同步预览逻辑。
- 实现基础增量同步逻辑：
  - 新增
  - 更新
  - 删除
- 实现基于 Markdown 分隔线的正反面解析。

### 7. 当前方案的边界

当前版本还不是“完整自动识别思源原生闪卡”的最终版，而是一个**可导入测试、可联调 Anki 的第一阶段成品**。

主要边界：

- 目前使用手工输入块 ID 的方式管理同步来源。
- 尚未深度接入思源原生闪卡数据库或属性模型。
- 尚未处理复杂资源（图片、附件）自动迁移。
- 尚未对多字段模型做更灵活映射。

### 8. 下一阶段开发方向

1. 研究思源原生闪卡来源结构与事件模型。  
2. 自动发现闪卡，而不是手填块 ID。  
3. 支持更多笔记类型字段映射。  
4. 增加资源与图片处理。  
5. 增加同步冲突恢复、失败重试与更详细报告。  
6. 增加对标签、卡片模板建议、批量选择的支持。  

## 开发日志

### 2026-05-14

- 修复超级块制卡 bug：原 `parseFlashcardCandidate` 判定链是「分隔符 → 填空 → 子块」，对超级块也会先跑 cloze 检测。当超级块包含代码块时，合并后的 kramdown 中代码块边界处的 `==`（如 `if (i == 0 && j == 0)`）在边界场景被识别为 cloze 标记，导致 Anki 卡片填空错位、关键字符（如行号 `62`、数字 `0`）随之被吞掉。
- 修复方案：在 `collectFlashcardCandidates` 拿到原始 kramdown 后立即用 `/^\s*\{\{\{[a-zA-Z]/` 检测是否为超级块（layout container 起始标记，sanitize 前判断，避免标记被剥掉），并把 `isSuperBlock` 标志透传到 `parseFlashcardCandidate`；对超级块强制只走 `buildChildBlockPreview`——首子块作为正面、剩余子块合并作为反面，**完全跳过 cloze 检测**，符合用户对超级块「首块问题、其余答案」的语义期望，也避免依赖 cloze 占位/还原的边界细节。
- 收起/展开默认值优化：`showAnkiConfig`、`showPathRules` 改为默认 `ref(false)`，让面板首屏更克制；`syncRuleSearchStates` 中已有规则的 `ruleEditStates` 默认 `?? false`，加载的路径规则直接呈现「完成」状态；`addPathRule` 仍显式 push `true` 并把 `showPathRules` 置 `true`，保证新增路径时自动展开并进入编辑态，符合「刚加就要填」的直觉。
- 发布 0.1.8：更新 `plugin.json` / `package.json` / `CHANGELOG.md` / `develops.md` / `README.md` / `README_zh_CN.md`，重新构建 `dist/` 与 `package.zip`。

### 2026-05-13

- 修复填空卡解析 bug：旧版 `==(.+?)==` 是非贪婪但不感知代码段，遇到 `` `needCnt == 0` `` 这类行内代码里的 `==` 会与后面真实高亮 `==O(m+n)==` 的起始 `==` 错配，导致两个 cloze 内容互相串入彼此区间，Anki 端表现为填空错位和 `[...] data-ordinal=` 残片。
- 修复方案：
  1. 收紧 cloze 正则为 `==(\S(?:.*?\S)?)==`，要求 `==` 两端紧邻非空白字符，对齐思源自身高亮语法。
  2. 在 cloze 替换前用 `INLINE_CODE_PATTERN`、`BLOCK_CODE_PATTERN` 把行内/围栏代码替换成内含 NUL 字节哨兵的占位符（形如 NUL+索引+NUL），替换完成后再恢复，从根本上让代码段内 `==` 不参与 cloze 切分。
  3. 抽出 `applyClozeReplace` 复用，`buildClozeText` 与 `buildClozePreview` 的 front/back 共用同一切分路径，避免三个出口语义不一致。
- 用用户提交的最小覆盖子串原文作回归：旧 regex 复现出与用户截图一致的乱码；新 regex 输出 `{{c1::O(m + n)}}` / `{{c2::O(∣Σ∣)}}`，且行内代码 `` `needCnt == 0` `` 原样保留。
- 发布 0.1.7：更新 `plugin.json` / `package.json` / `README.md` / `README_zh_CN.md` / `CHANGELOG.md`，重新构建 `dist/` 与 `package.zip`。

### 2026-05-07

- 创建 `ankiLinker/` 工程目录。
- 基于 Vue + Vite 的思源插件模板初始化插件骨架。
- 修改插件元信息为 `ankiLinker`。
- 建立主界面原型，替换模板演示内容。
- 新增 `AnkiConnect` 客户端封装。
- 增加卡组与笔记类型读取能力。
- 设计并实现本地持久化状态结构。
- 增加同步预览与同步日志界面。
- 增加基础增量同步逻辑。
- 增加 Markdown/公式优先保留策略说明。
- 更新 `README.md`，补充功能说明、测试方式与推荐 Anki 适配方案。
