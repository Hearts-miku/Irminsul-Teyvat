# 剧情内容自动化入库

v0.6 已增加分类批量源码采集、断点续传与程序内原文资料库，见 [批量采集说明](CORPUS-IMPORT.md) 和 [实际覆盖报告](CORPUS-COVERAGE.md)。下文保留 v0.5 的逐页 HTML 与精选摘要核对流程；两者并行使用，原文不会自动转成已核对摘要。

2026-09-30 已完成实测。推荐以 BWIKI 的公开 MediaWiki API 作为主采集入口，已有页面检索作为辅助。自动化负责采集、去重、变更检测、场景定位和校验；剧情解释、互斥分支和人物观点仍需核对。

## 方案比较

| 方式 | 本项目结论 |
| --- | --- |
| MediaWiki 只读 API | 已接通，能取正文、章节、链接和修订号；本批 10 页全部成功，适合明确清单的批量采集 |
| 浏览器自动化 | 已用于离线解析 API 返回的 HTML，禁用脚本并拦截全部网络；保留折叠区域里的文本，避免只拿到可见部分 |
| 搜索结果摘录 | 仍可辅助查找页面，但不适合当作完整对白来源；本批已不依赖搜索摘录构建正文 |
| 在线模型生成初稿 | 可作为下一步提效点；本批未实现无人值守生成，也未读取用户密钥。必须经过证据、人物立场和剧透范围核对才能入库 |

API 结构参考 [MediaWiki Revisions](https://www.mediawiki.org/wiki/API:Revisions) 与 [API 使用建议](https://www.mediawiki.org/wiki/API:Etiquette)。本机实测访问 `https://wiki.biligame.com/ys/api.php` 返回有效 JSON；采集前检查 [站点 robots.txt](https://wiki.biligame.com/robots.txt)。程序不使用 robots 禁止的 `index.php?oldid=` 地址采集，固定版本链接仅用于出处展示。

## 可重复执行的流程

```powershell
# 读取明确清单；单个清单最多 50 页，顺序获取正文并间隔至少 1 秒
npm run content:collect -- journey-bridge

# 无网络校验已缓存快照
npm run content:collect -- journey-bridge --offline

# 强制重新读取正文，以发现模板变更等修订号未必能反映的变化
npm run content:collect -- journey-bridge --refresh

# 按缓存生成待核对来源和场景清单；不填剧情、不自动发布、不覆盖已有草稿
npm run content:prepare -- journey-bridge

# 核对并整理章节文件之后，生成程序内容并检查来源变化及剩余主线入口
npm run content:audit
npm test
```

环境沿用项目 Node.js 24 与 Playwright；需本机 Edge/Chrome 或已安装的 Playwright Chromium。联网采集只需访问公开站点，无须模型密钥和账号。

1. 在 `data/collection-plans/<id>.json` 中列出准确页面标题和唯一 key。先确认是任务页面，避免“归终”等同名人物页。
2. 采集输出到 `.cache/story-sources/<id>/`：HTML 快照、SHA-256、修订号、场景文字及定位。版本快照另存，不直接写程序内容；读取失败保留上次成功数据并在报告中标记失败。429、503 和 maxlag 最多尝试三次。
3. `content:prepare` 输出 `.cache/story-drafts/<id>.json`，包括场景待办、来源元数据和空白摘要字段。自动拆分不能解决嵌套选项的全部语义；`requiresBranchReview` 只是筛查提示。
4. 开发整理时逐场检查台词，填写自行归纳的摘要、关键词、证据 anchor、题目建议和剧透限制。按章节组织 `scopes`，为主题分配不重复 ID，保留人物观点、计划未完成和未知信息。
5. 将核对后的章节文件放入 `data/`，将其已核对快照的精简凭据放入 `data/source-receipts/<prefix>.json`，并加入 `data/content-manifest.json`。新章节须有 `reviewStatus: reviewed`；这是内容整理标记，不会自动弹出用户审批。旧蒙德、璃月批次明确标为历史人工核对格式，不伪造快照凭据。
6. 构建器校验来源、快照关联、场景 anchor、重复 ID 和正则表达式。审计报告将本地新快照与已入库版本比较，变化项返回非零状态，保留旧的已核对正文。联网采集本身不会更新审核状态。

原始缓存和草稿位于 `.cache`，不进入桌面运行包。程序携带摘要及精简来源凭据。无需缓存和网络，也能重建已有的已核对内容包。

## 本批结果与边界

- 10 / 10 页面首次采集成功，拆出 126 个非空章节片段，含任务条件、流程和剧情场景，**不是 126 条已完成剧情**。
- 增量复跑：10 / 10 正文复用缓存。离线复跑：10 / 10 快照通过内容哈希校验。
- 核对后入库：戴因前置 8 条、我们终将重逢 13 条、稻妻序幕 12 条，合计 33 条摘要。
- 单元测试覆盖限流模拟、API 错误、robots 路径判断、草稿拒绝、快照不一致和场景丢失。未对真实站点主动制造限流或网络故障。
- 摘要与原文之间的事实一致性仍需内容核对，哈希和 anchor 校验只能证明来源关联完整。
- Wiki 页面修订号不能冻结所有被引用模板，因此保存渲染正文哈希，并提供 `--refresh`；无变更增量模式只依据页面修订号跳过正文。
- 未做定时后台采集，也未爬取全站。后续按主线入口和缺口报告增加批次；支线、NPC 状态与对白分支仍需各自的清单和整理规则。

证据：`test-results/source-collection-report.json`、`source-incremental-report.json`、`source-offline-report.json`、`content-audit.json`。报告中的 `published: false` 表示采集动作没有发布内容，并非本批摘要未入库。
