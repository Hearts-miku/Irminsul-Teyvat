# 验证内容包的来源

v0.3 新增蒙德三幕 45 条摘要。逐条来源、核对层次和缺口见 [蒙德内容说明](MONDSTADT-CONTENT.md) 与 `data/mondstadt-story.json`。未取得全文的来源只用于概况，不提升为全文对白证据。

v0.2 于 2026-09-30 新增以下自行归纳的摘要，未复制完整台词。来源定位同时写入 `data/story-expansion.json`；仅取得明确修订号的页面使用固定链接，其余如实标为未固定。

| 来源 | 整理范围 |
| --- | --- |
| [一个男孩的去信](https://wiki.biligame.com/ys/一个男孩的去信) | 杜拉夫送信、葛瑞丝的讲述、提米写信时的认知 |
| [三十人团的招募](https://wiki.biligame.com/ys/index.php?title=「三十人团」的招募&oldid=537350) | 联络员身份、招募缘由、工作分工 |
| [森林书](https://wiki.biligame.com/ys/森林书) | 林中奇遇、维摩庄的孩子、远足；不含后续结局 |
| [愿风带走思念](https://wiki.biligame.com/ys/index.php?title=愿风带走思念&oldid=506540) | 葛罗丽的担忧与蒲公英心愿 |
| [茶博士刘苏](https://wiki.biligame.com/ys/茶博士刘苏) | NPC 身份、关于行秋及岩王帝君的说书视角 |
| [卡嘉](https://wiki.biligame.com/ys/卡嘉) | 餐馆、店员和消息相关日常谈话；不含任务后一次性对话 |

三份提纲的导览材料与上述剧情摘要分开，标为 `outline`。目录来源、修订和缺口见 [覆盖报告](story-outline/COVERAGE.md)。本次新增摘要沿用下文说明的 BWIKI 材料许可与游戏权利归属。

人工核对日期：2026-09-29。来源页面在本次调研中通过网页读取核对。页面当前入口报告的固定修订号如下；本项目保存的是资料整理与短摘，不是原网页完整快照。

| 任务 | 固定版本 | 核对的重点 |
| --- | --- | --- |
| [随风而来的骑士](https://wiki.biligame.com/ys/index.php?title=随风而来的骑士&oldid=674009) | 674009 | 盘问和护送的顺序；派蒙介绍的两个分支；道歉；寻找失散家人的说明 |
| [与轻风同行](https://wiki.biligame.com/ys/index.php?title=与轻风同行&oldid=652499) | 652499 | 城外任务目的；战斗后的认可；安柏对城市周边局势的说明 |
| [自由之都](https://wiki.biligame.com/ys/index.php?title=自由之都&oldid=652504) | 652504 | 进入蒙德后的对话；琴的身份；礼物与协助清理营地的关联 |

原神 BWIKI 由旅行者酒馆及页面贡献者维护。这些页面页脚标注 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)；贡献者与编辑历史可通过上述页面查阅。本包基于这些材料编写的资料整理沿用该许可。游戏原文及名称相关权利属于原权利人。

数据中的 `text` 是资料整理，`quote` 才是逐字短摘，`interpretation` 是分析推断。每条记录的 `section` 指向相应任务内的位置；`branch` 标识选项，不能按数组顺序理解为同一条对话路径。

本版本未复制 Wiki 图片、配音或游戏角色模型；桌宠及风景为项目内原创 SVG。

`verifiedAt` 是本项目核对日期，`revision` 是 Wiki 页面修订号；`gameVersion` 表示任务首次出现版本，不能当作内容包完整覆盖的游戏版本。内容包自身使用 `version` 和导入时计算的 SHA-256 标识。

技术实现参考：[Electron 窗口](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)、[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)、[Chat Completions API](https://developers.openai.com/api/reference/resources/chat)、[SQLite for Node.js](https://nodejs.org/api/sqlite.html)。


## v0.4 璃月摘要

新增 36 条自行归纳摘要，来源、修订号和核对层次逐条存于 `data/liyue-story.json`；见 [璃月内容说明](LIYUE-CONTENT.md)。不将 NPC 片段或任务索引标记为完整对白。


## v0.5 公开 API 采集后的摘要

新增 33 条摘要，任务原文在本地缓存核对后归纳。程序仅携带摘要与来源快照凭据，原始 HTML 缓存不随运行包发布。详见 [自动化说明](CONTENT-AUTOMATION.md) 及 [后续剧情说明](JOURNEY-BRIDGE-CONTENT.md)。

## v0.6 原文资料库

公开 MediaWiki 分类与修订 API；来源页面为原神 BWIKI 社区。已取得 1,661 页，保留页面 ID、修订号、采集时间与源码 SHA-256，自动解析为 89,466 个片段。内容仍属原权利人；社区页面标注 CC BY-NC-SA 4.0。未逐条人工核对，不代表游戏完整对白。完整类别覆盖、缺口及解析限制见 [CORPUS-COVERAGE.md](CORPUS-COVERAGE.md) 和 [CORPUS-IMPORT.md](CORPUS-IMPORT.md)。

## v0.7 增量来源

本轮额外取得 400 页公开任务与 NPC 源码，累计 2,061 页、105,031 个解析片段；尚未逐条核对。右侧主线入口来自现有 51 条主线目录，子任务关系只取自源页面的系列任务字段。详见 PROGRESS-V07.md 与 CORPUS-COVERAGE.md。
