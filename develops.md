# 开发思路与开发日志

## 开发思路

### 1. 目标

构建一个基于思源笔记插件体系的手动同步工具，将思源原生闪卡单向同步到本地 Anki，并尽量保留 Markdown、列表、公式、图片等内容结构。

核心原则：

- 思源是唯一事实源，插件不做 Anki → 思源的反向写入。
- 同步不修改思源块内容或块属性。
- 通过本地映射文件与 Anki 标签双重身份恢复，降低重复建卡和映射丢失风险。
- 优先让用户在 UI 中完成诊断、预览、字段选择与安全删除确认。

### 2. 技术选择

- 模板：`plugin-sample-vite-vue`
- 前端：`Vue 3 + TypeScript`
- 构建：`Vite`
- 思源侧：`siyuan` 插件 API + 内核 HTTP API（kramdown、属性、SQL、hPath、Riff cards）
- Anki 侧：`AnkiConnect`

### 3. 为什么选择 Vue 模板

相对基础模板与 Svelte 模板，本项目优先选择 `plugin-sample-vite-vue`：

- **用户体验**：更容易快速搭建设置页、预览页、日志页等管理界面。
- **开发效率**：Vue 的响应式状态适合做同步预览、日志输出、表单管理。
- **可维护性**：组件划分清晰，后续加入更多配置项和同步策略时扩展更自然。
- **生态适配性**：与现有思源插件模板兼容良好，构建链路稳定。

### 4. 当前架构设计

#### UI 层

- AnkiConnect 连接检测。
- Anki 卡组、Note Type、字段列表刷新与下拉选择。
- 问答卡 / 填空卡分别配置 Note Type 与目标字段。
- 路径前缀 → Anki 卡组规则配置。
- 思源闪卡来源诊断、同步预览、删除诊断、执行同步、同步进度与日志。
- 配置导出 / 导入。

#### 配置层

保存以下信息到 `settings.json`：

- AnkiConnect 地址。
- 默认目标卡组。
- QA / Cloze Note Type 与字段映射。
- 路径分卡组规则。

#### 映射持久化层

同步映射不再写入单一 `mappings.json`，而是拆分为：

- `mappings.index.json`：分片索引与 checksum 元数据。
- `mappings.part-*.json`：按稳定哈希路由后的映射分片。
- `mappings.backup.json`：完整 `AnkiLinkerMapping[]` 恢复快照。

旧版 `mappings.json` 会在首次加载时自动迁移到新结构；分片读失败时可从备份自动恢复。

#### 同步层

当前已经接入思源原生闪卡来源，不再依赖手工输入块 ID：

- 合并运行时缓存、Riff API、到期卡、SQL `cards` 表与 IAL 块扫描。
- 按 `blockID` 去重，并优先保留真实 `cardID`；缺失 cardID 时使用 `block:<blockID>` 合成身份。
- 读取每个闪卡块的 kramdown、属性与 hPath，按超级块 / 分隔符 QA / cloze / 子块兜底顺序解析。
- 根据 hPath 路径规则决定目标 Anki 卡组。
- 用内容 hash、目标卡组与 Note Type 判断新增 / 更新 / 删除 / 不变 / 无效。
- 执行同步时先删除、再分批更新、最后新增；更新失败且 Anki note 不存在时重建。

#### 数据层

本地持久化：

- `settings.json`：配置。
- `mappings.index.json`：分片索引。
- `mappings.part-*.json`：映射分片。
- `mappings.backup.json`：完整恢复快照。
- `mappings.json`：仅保留旧版兼容导入入口，升级后会自动迁移。

Anki 笔记写入标签：

- `siyuan-anki-linker`：插件身份标签。
- `siyuan-card:<cardID>`：单卡身份标签。
- `siyuan`：通用筛选标签。

本地映射丢失时可通过 Anki 标签反查恢复。

### 5. Markdown / 渲染适配策略

- 以 Markdown 语义为主，避免把公式和正文过早转成不可维护的富文本。
- 写入 Anki 前统一重写思源 `/assets/...` 链接为绝对 URL。
- 对普通模板：将基础有序 / 无序列表转换成 `<ol>/<ul>`，同时转义普通文本，降低列表纯文本显示概率。
- 对 `KaTeX and Markdown Basic/Cloze`（Anki-KaTeX-Markdown add-on）：字段内容先 HTML 转义，再将换行替换为 `<br>`；该 add-on 的模板会在 `<pre>{{Field}}</pre>` 中把 `<br>` 还原为 `\n` 并交给 `markdown-it` 渲染。
- 渲染策略改变会进入 hash 输入，确保受影响旧卡能进入更新队列。

### 6. 已实现能力概览

- 插件基础加载、顶栏入口、Vue 主面板与 i18n。
- AnkiConnect 客户端、连接检测、卡组 / Note Type / 字段读取。
- 原生思源闪卡自动发现与多来源合并。
- QA / Cloze 两类 Anki 笔记映射。
- 分隔符问答、思源高亮转 Anki Cloze、超级块首子块问答、子块兜底。
- 路径分卡组、同步预览、同步进度、同步日志、删除诊断。
- 配置导出 / 导入。
- 安全删除保护、Anki 标签恢复、本地映射清理。
- 资源链接重写与 Anki-KaTeX-Markdown 兼容。

### 7. 当前方案的边界

- 仍是手动同步工具，不监听思源闪卡变化自动同步。
- 不维护 Anki 端模板，也不反向读取 Anki 编辑结果。
- 思源资源以绝对 URL 方式引用，不会把附件复制到 Anki collection.media。
- `siyuan://` 块跳转链接已验证在部分 Anki markdown 插件环境下不可可靠点击，除非额外维护 Anki 端 Python 插件，否则不建议恢复。

### 8. 后续方向

1. 增加更明确的 Markdown 渲染模式设置，减少对 Note Type 名称的自动推断。
2. 支持更复杂的列表 / 嵌套块 / 表格转换策略。
3. 增加失败重试和更细粒度的同步报告导出。
4. 可选支持资源复制到 Anki 媒体库。
5. 若用户接受额外 Anki 插件，再考虑可靠的 `siyuan://` 跳转方案。

## 开发日志

### 2026-06-23

- 发布 `0.2.0`：同步更新 `plugin.json` / `package.json` / `package-lock.json` 版本号，重新构建 `dist/` 与 `package.zip`。
- 完成映射持久化重构：新增 `src/utils/storage.ts`，把原来的单文件 `mappings.json` 拆分为 `mappings.index.json` + `mappings.part-*.json` 分片，并保留 `mappings.backup.json` 作为完整映射快照；设置继续单独保存到 `settings.json`。
- 新存储层支持：旧版 `mappings.json` 首次加载时自动迁移；分片缺失或 checksum 校验失败时自动从 `mappings.backup.json` 恢复并重建分片；卸载时统一清理 `settings.json`、`mappings.index.json`、`mappings.part-*.json`、`mappings.backup.json`。
- 修复思源 `v3.6.5` 的 notebook 查询兼容问题：`src/api.ts` 中 `lsNotebooks()` 请求体从空字符串改为 `{}`；`App.vue` 不再在插件启动时立即刷新路径树，而是改成仅在路径规则面板需要时才懒加载。
- 继续修复 `Refresh Paths` 报错链路：路径刷新时跳过 `closed` 笔记本，对单个笔记本 / 子路径的失败做局部隔离，并把 `notebookName`、`notebookId`、`currentPath`、`docPath` / `childPath` 写入日志，便于定位导致 `Query notebook failed v3.6.5` 的具体对象。
- 同步更新 `README.md`、`README_zh_CN.md` 与仓库根 `old view.md`，把新的存储结构、路径刷新行为和维护注意事项记录给下一次维护。

### 2026-05-18

- 复查 Linux 迁移后的本地环境：项目根已迁到 `/home/ly/Projects/SiYuanKitT/siyuan-ankiLinker`，当前机器为 `Linux x86_64`，`node v26.3.1`、`npm 11.16.0` 均可用。
- 同步更新维护文档：`old view.md`、`README.md`、`README_zh_CN.md` 改为以 Linux shell 命令为默认维护口径，并去掉旧的 Windows `npm.cmd` 路径示例。
- 项目范围内修复本地构建问题：删除并重装仓库内 `node_modules` 后，补齐了 Rollup 的 Linux 可选原生包，`npm run build` 已重新通过，成功产出 `dist/` 与 `package.zip`。
- 当前仍建议把本地 Node 版本收敛到 CI 使用的 Node 22，减少与 `.github/workflows/release.yml` 的环境偏差；但这不再是当前构建的阻塞项。

### 2026-05-17

- 修复相邻 cloze 被错误合并的问题：`CLOZE_PATTERN` 从只要求两端非空白，进一步收紧为 `==((?=\S)(?:(?!==)[^\n])*?\S)==`，禁止内容跨行或包含下一组 `==` 分隔符。用户给出的 `局部变量存==栈==，成员变量存==堆/元空间==` 已能稳定生成两个独立 cloze。
- 保留 inline / fenced code 屏蔽机制与 U+E000 占位符还原，避免代码段中的 `==` 参与 cloze 切分。
- 新增 Anki 字段准备分层：`prepareMarkdownForAnki` 负责资源链接重写；`prepareAnkiFieldContent(markdown, noteType)` 按 Note Type 选择普通模板或 Anki-KaTeX-Markdown 策略。
- 针对 Jwrede/Anki-KaTeX-Markdown：确认其模板使用 `<pre>{{Front}}</pre>` / `<pre>{{Text}}</pre>`，脚本会把 `<br>` 还原为换行后交给 `markdown-it`。因此对 `KaTeX and Markdown Basic/Cloze` 字段采用 `escapeHtml(...).replace(/\n/g, '<br>')`，解决列表和多行 Markdown 在该 add-on 下不渲染的问题。
- 对普通 Anki 模板增加基础列表转换：连续有序列表和短横线无序列表转换为 `<ol>/<ul>`，普通文本 HTML 转义。
- 将 `anki-katex-markdown-br-v1` 与 `anki-list-html-v1` 加入 hash 输入，使渲染策略变化可以触发既有卡片更新。
- 修复 `.github/workflows/release.yml`：项目实际使用 `package-lock.json` 和 npm，旧 workflow 使用 pnpm 且无 `pnpm-lock.yaml`，容易在标签发布时失败；改为 Node 22 + `npm ci --legacy-peer-deps` + `npm run build`，并显式授予 `contents: write` 以创建 GitHub Release。
- 发布 0.1.10：更新 `plugin.json` / `package.json` / `package-lock.json` / `CHANGELOG.md` / `develops.md` / README / workflow / `old view.md`，重新构建 `dist/` 与 `package.zip`。

### 2026-05-16

- 新增「同步进度」显示：用户反馈卡片数量增多后同步耗时变长，希望有进度反馈。在 `runSync` 增加可选 `onProgress(percent)` 回调，`runInBatches` 增加 `onBatchDone(processed)` 回调，把「删除（一次性）→ 更新（按 batch）→ 新增（一次性）」三阶段的累计完成数除以 `totalItems` 上报百分比。
- App.vue 侧用 `syncStatus: 'ready' | 'syncing' | 'done'` + `syncPercent` 两个 ref 驱动一个 `syncProgressText` computed，文案走 i18n（中文「就绪 / 同步中 N% / 完成」、英文「Ready / Syncing N% / Done」）。
- UI 位置：「同步预览」面板 stats-grid 下方一行 `<p class="meta">`，复用 `flashcardStatusHint` 的样式约定，避免风格割裂。
- 状态机：插件启动初始 `ready` → 点击「生成同步预览」回到 `ready` 并把 percent 清零 → 点击「执行同步」转 `syncing`，回调期间更新 percent → 完成转 `done`，percent 锁 100 → 异常回退 `ready` 并清零。
- 此次仅恢复同步进度功能，未恢复此前回退掉的「双链解析」「末尾跳转链接」（在用户实际环境下点击 `siyuan://` 链接无反应，根因是 markdown 渲染插件接管了 click 事件 / 给链接加 `target="_blank"`，无法在思源插件侧绕过；需要在 Anki 侧装一个 Python 插件配合，超出本插件范围）。
- 发布 0.1.9：更新 `plugin.json` / `package.json` / `CHANGELOG.md` / `develops.md`，重新构建 `dist/` 与 `package.zip`。

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
