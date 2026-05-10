# Changelog

## 0.1.3

- 删除 `plugin.json` 中空的 `funding` 字段。
- 删除与 `default` 完全重复的 `displayName.en_US` 与 `description.en_US`，消除冗余 locale 配置。

## 0.1.2

- 将插件实际 ID 从 `ankiLinker` 统一调整为 `siyuan-ankiLinker`，使手动安装目录名与仓库名保持一致。
- 增加旧插件 ID `ankiLinker` 到新插件 ID `siyuan-ankiLinker` 的本地数据迁移逻辑，尽量避免升级后配置与映射丢失。
- 运行时全局键、顶栏图标标识、面板根节点类名/ID 等内部命名同步切换到 `siyuan-ankiLinker` 风格。
- Anki 标签查询与写入兼容新旧标签，避免既有同步记录失联。
- 卸载时同时尝试清理新旧插件 ID 目录下的持久化数据。

## 0.1.1

- 单独更新并提交 `preview.png`，覆盖远端预览图。
- 新增 `uninstall()` 清理逻辑，完整卸载插件时会删除插件自身创建的持久化数据文件。
- `onunload()` 增加运行时状态清理，避免窗口全局对象残留。
- 更新版本号并重新打包发布产物。

## 0.1.0

- 完善插件元信息：作者、仓库、主页、关键词、描述。
- 项目仓库名更新为 `siyuan-ankiLinker`。
- 插件显示名称调整为更友好的中英文名称。
- 取消发布禁用标记，允许正式发布。
- 新增顶栏自定义同步图标并替换原内置图标。
