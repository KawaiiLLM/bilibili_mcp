# 工具层输出归一化设计

> 项目：bilibili-mcp · Milestone 1.x
> 起因：LLM 实跑 4 个 MCP 工具暴露的输出层问题
> 关联文档：`2026-05-10-bilibili-mcp-v2-design.md`（v2 总设计），第 6.3 节"裁剪在 MCP 工具层"

## 1. 背景

Milestone 1 完成并接入 Claude Code 后，2026-05-11 用真实凭据跑了 9 个只读 endpoint，发现以下 4 类输出层问题（按真实使用频次和 token 占用排序）：

| ID | 严重度 | endpoint | 现象 |
|---|---|---|---|
| F3 | High | `discovery search` | 返回 60.1KB raw payload（`seid` / `exp_list`（40+ 标志）/ `pageinfo`（8 个分类聚合元数据）/ ...），LLM 视角下绝大部分 token 浪费在元数据，而非视频内容 |
| F1 | Medium | `discovery hot` / `ranking` / `weekly` / `must_watch` | 每条视频 50+ 字段（`rights` / `dimension` / `up_from_v2` / `season_id` / `cover43` / ...），LLM 用得上的不到 10 个 |
| F2 | Low | `interaction danmaku` | `mode` / `color` 是裸数字（`mode: 1`、`color: 16777215`），LLM 无法理解协议含义 |
| F4 | Low | `video subtitle` | 输出含加密 v2 URL（`%13%1BP.%1D%28...`）和内部状态字段（`ai_status` / `is_lock` / `id_str`），无实际用途 |

M6 codex 修复（详见 `c61d28c`）覆盖了 `summary` / `related`，但 hot/ranking/weekly/must_watch/search/danmaku/subtitle 没纳入。本 spec 把这件事系统化：定义工具层输出归一化原则和落地步骤，并以 F1-F4 作为首批落地。

## 2. 目标与边界

### 2.1 目标

- 把 LLM 视角下的工具响应缩短到"必要信息"
- 提供共享 normalizer 模块，避免每个 tool 各自实现裁剪逻辑
- 落地 F1-F4 全部 4 项

### 2.2 范围

主要修改 `src/tools/` 层；附带回收两处 SDK 内部 helper：

- 新增 `src/tools/normalize.ts`
- 调整 `src/tools/discovery-tool.ts` / `interaction-tool.ts` / `video-tool.ts`
- 新增 `tests/tools/normalize.test.ts`，增强既有 tool 测试
- 把 `src/modules/search.ts` 内的 `stripHtml` / `normalizeSearchItem` 迁出（前者搬到 normalize.ts，后者由 `normalizeVideoCard` 取代）；`searchVideos` 改为 raw passthrough，不再返回 `{ raw, results }` 包装
- 把 `src/modules/snapshot.ts` 私有 `normalizeImageUrl` 和 `src/modules/subtitle.ts` 的 `normalizeSubtitleUrl` 统一改用 normalize.ts 导出的 `normalizeAbsoluteUrl`（同名作用：`//xxx` → `https://xxx`）

### 2.3 非目标

- SDK 模块（`src/modules/*`）核心函数语义不变（贴合 v2 设计第 6.3 节"裁剪在 MCP 工具层"原则）—— 仅修复 search.ts 历史遗留的 SDK 层归一化（属于 v2 6.3 的反向 drift 修正）
- 不动 endpoint JSON、不动 client、不改写操作流程
- 除 `searchVideos` 外，不调整 SDK 函数签名

## 3. 归一化原则

### 3.1 白名单优先

tool 层只输出已知有用字段；非白名单字段一律丢弃。新接口接入时显式声明保留哪些字段，不靠"过滤掉某些已知噪音"——后者会随着 B 站新增字段持续漏。

### 3.2 共享 shape

所有返回视频列表的 endpoint 共用 `VideoCard` shape。差异字段进 `extras: Record<string, unknown>`，留作未来扩展余地，不污染主 shape。

### 3.3 enum 显式化

协议级裸数字（弹幕 mode/color、视频 copyright、搜索 type 等）输出时附带语义标签字段，供 LLM 直接读懂。原始数字保留以便回传给 B 站接口。

### 3.4 URL 协议补全

`//xxx` 起始的协议相对 URL 补成 `https://xxx`。含敏感 query 或加密内容（如字幕 `subtitle_url_v2`）的字段直接丢，不输出。

## 4. VideoCard shape

### 4.1 共享字段

```typescript
interface VideoCard {
  bvid: string;
  aid: number;
  title: string;                          // stripHtml 处理（去搜索高亮 <em>）
  url: string;                            // https://www.bilibili.com/video/{bvid}
  cover: string;                          // 已补 https
  duration_seconds: number;
  duration_text: string;                  // formatDuration 生成，mm:ss 或 hh:mm:ss
  owner: { mid: number; name: string; avatar: string };  // owner.face → avatar 改名
  stat: {
    view: number; like: number; coin: number; favorite: number;
    reply: number; danmaku: number; share: number;
  };
  description?: string;                   // stripHtml + 截断到 200 字
  pub_location?: string;                  // 城市级位置
  category?: string;                      // tnamev2 优先 fallback tname
  pubdate?: number;                       // unix 秒
  extras?: Record<string, unknown>;       // endpoint-specific
}
```

### 4.2 包装 shape

返回视频列表的 endpoint 统一输出：

```typescript
interface VideoListResult {
  list: VideoCard[];
  page?: number;
  has_more?: boolean;
  total?: number;
}
```

### 4.3 各 endpoint 来源字段映射

| Endpoint | 来源数组 | extras 携带 |
|---|---|---|
| `discovery hot` | `payload.list[]` | `rcmd_reason.content`, `his_rank`, `season_type` |
| `discovery ranking` | `payload.list[]` | `score`, `rank` |
| `discovery weekly` | `payload.list[]` | `episodic_index`, `rcmd_reason.content` |
| `discovery must_watch` | `payload.list[]` | `rcmd_reason.content`, `is_steins_gate` |
| `discovery related` | `payload[]`（顶层 array） | 已归一化 (M6) — 切到新 normalizer 保持一致 |
| `discovery search` | `payload.result[]`（搜索类型 video） | `tag`, `rank_score`, `is_pay`, `senddate` |

注意：`description` 的 `stripHtml` 处理（去除搜索高亮 `<em>` 标签等）M6 已有，移到 normalize.ts 复用。

## 5. F2 / F4 单独项

### 5.1 F2 弹幕枚举（`interaction danmaku`）

每条 item 加两个语义字段，原始字段保留：

```typescript
interface DanmakuItem {
  time_seconds: number;
  content: string;
  mode: number;             // 原始保留
  mode_label: string;       // 新增
  font_size: number;
  color: number;            // 原始保留
  color_hex: string;        // 新增：'#ffffff'
}
```

`mode_label` 取值：

| mode | label |
|---|---|
| 1 | 滚动 |
| 4 | 底端 |
| 5 | 顶端 |
| 6 | 逆向 |
| 7 | 高级 |
| 8 | 代码 |
| 9 | BAS |

枚举来源：`bilibili-API-collect/docs/danmaku/danmaku_proto.md`（已在 `bilibili-api-collect/` 仓库内）。

### 5.2 F4 字幕字段裁剪（`video subtitle`）

每条 subtitle 输出只保留：

```typescript
interface SubtitleEntry {
  id: number;
  lan: string;                  // ai-zh / zh-Hans / en
  lan_doc: string;              // 中文 / 英文
  type: number;                 // 1=ai 2=人工
  ai_generated: boolean;        // 由 ai_type === 1 推导
  subtitle_url: string;         // 已补 https
}
```

显式丢弃：`subtitle_url_v2`（加密路径，无法直接使用）、`is_lock`、`id_str`、`ai_type`（已被 `ai_generated` 替代）、`ai_status`。

### 5.3 顶层 subtitle 输出

`video subtitle` 顶层 shape 不变，但每条 subtitle 替换为 `SubtitleEntry`：

```typescript
{
  bvid: string;
  cid: number;
  subtitles: SubtitleEntry[];
  selected_language?: string;
  selected_language_label?: string;
  selected_url?: string;
}
```

## 6. 模块结构

新增单文件 `src/tools/normalize.ts`：

```typescript
// 类型导出
export type VideoCardSource = "hot" | "ranking" | "weekly" | "must_watch" | "search" | "related";
export interface VideoCard { /* 见 4.1 */ }
export interface VideoListResult { /* 见 4.2 */ }
export interface DanmakuItem { /* 见 5.1 */ }
export interface SubtitleEntry { /* 见 5.2 */ }

// 常量
export const DANMAKU_MODE_LABELS: Record<number, string>;

// 主导出
export function normalizeVideoCard(raw: any, source: VideoCardSource): VideoCard;
export function normalizeVideoList(
  payload: any,
  source: VideoCardSource,
  opts?: { limit?: number; arrayKey?: string },
): VideoListResult;
export function normalizeDanmakuItem(raw: any): DanmakuItem;
export function normalizeSubtitleEntry(raw: any): SubtitleEntry;

// 共享 helper
export function normalizeAbsoluteUrl(url: unknown): string;       // '//xxx' → 'https://xxx'，空值返回 ''
export function colorIntToHex(value: number): string;             // 16777215 → '#ffffff'
export function truncateText(text: unknown, max: number): string;
export function stripHtml(text: unknown): string;                 // 从 search.ts 迁移过来
```

snapshot.ts 内的 `normalizeImageUrl` 和 subtitle.ts 内的 `normalizeSubtitleUrl` 都改成调 `normalizeAbsoluteUrl`（消除三处重复实现，统一一个 helper）。

### 6.1 tool 文件调整

- `discovery-tool.ts`：
  - `hot` action：`normalizeVideoList(payload, "hot", { limit })` 替代 raw 返回
  - `ranking` / `weekly` / `must_watch` action：同上
  - `search` action：调用改造后的 `searchVideos`（直接返回 raw payload），再 `normalizeVideoList(payload, "search", { arrayKey: "result", limit })`
  - `related` action：换用新 normalizer 保持一致（虽然 M6 已经裁过）

- `search.ts` 配套调整：
  - 删除 `stripHtml` 和 `normalizeSearchItem`（前者迁 normalize.ts，后者被 `normalizeVideoCard("search")` 取代）
  - `searchVideos` 改为 `return request(...)`，不再 `{ raw, results }` 包装
  - `discovery-tool.ts` 既有调用 `stripHtml(item)` 的地方改 import 自 `tools/normalize.js`

- `interaction-tool.ts`：
  - `danmaku` action：`items.map(normalizeDanmakuItem)`

- `video-tool.ts`：
  - `subtitle` action：`subtitles.map(normalizeSubtitleEntry)`

## 7. 测试

### 7.1 新增 `tests/tools/normalize.test.ts`

每个 normalizer 用真实 fixture 验证：

- fixture 来自 2026-05-11 真实 LLM 测试（见第 8 节示例），存为 `tests/fixtures/<source>.json`（hot/search/danmaku/subtitle）
- 断言点：
  - 白名单字段都在
  - 噪音字段都不在
  - URL 已补协议（不出现 `//` 起始）
  - enum label 正确
  - `extras` 包含 endpoint-specific 字段
  - `description` 已 stripHtml + 截断

### 7.2 既有测试增强

- `tests/tools/discovery-tool.test.ts`：
  - 既有 "discovery related normalizes video cards" 保留
  - 新增 "discovery hot strips raw payload noise"：断言输出不含 `rights` / `dimension` / `up_from_v2` / `season_id` / `cover43`
  - 新增 "discovery search returns VideoListResult shape"：断言输出不含 `seid` / `exp_list` / `pageinfo`，`list[]` 每条是 VideoCard

- `tests/tools/video-tool.test.ts`：
  - 新增 "subtitle entry strips internal fields"：断言不含 `subtitle_url_v2` / `is_lock` / `id_str` / `ai_type` / `ai_status`

- `tests/tools/tools.test.ts`：
  - 新增 "danmaku items expose mode_label and color_hex"

## 8. 真实测试对照（修复前 → 修复后）

> 数据来源：2026-05-11 LLM 实跑（详见 conversation 中 4 工具实测）

### 8.1 F3 — search

**修复前**（关键词 "Veritasium 真理元素"，limit=5）：

- 总大小：60.1KB
- 顶层字段：`seid` / `page` / `pagesize` / `next` / `numResults` / `numPages` / `suggest_keyword` / `rqt_type` / `exp_list`（40+ 标志）/ `is_hit_web_inf` / `egg_hit` / `pageinfo`（含 `tv` / `user` / `movie` / `bangumi` / `live_all` 等 8 个分类的聚合元数据）/ `result` / ...
- 输出内容里 LLM 真正用得上的只有 `result[]`，其余全部是 token 噪音

**修复后**（预期，命中视频取自 2026-05-11 真实 `video info` 实跑）：

```json
{
  "list": [
    {
      "bvid": "BV1WiRhBhEmQ",
      "aid": 116530582917601,
      "title": "这是一个我没有想到过的自然灾害",
      "url": "https://www.bilibili.com/video/BV1WiRhBhEmQ",
      "cover": "https://i0.hdslb.com/...",
      "owner": { "mid": 94742590, "name": "Veritasium真理元素", "avatar": "https://i1.hdslb.com/bfs/face/3e3e6ffa..." },
      "stat": { "view": 433574, "like": 22302, "coin": 6226, "favorite": 14175, "reply": 1990, "danmaku": 1800, "share": 2811 },
      "duration_seconds": 1894,
      "duration_text": "31:34",
      "description": "这些事些几乎在一夜之间作废了一种艾滋病药物的晶体...",
      "pubdate": 1778130000,
      "extras": { "rank_score": 1234.56, "tag": "..." }
    }
    // 4 more
  ],
  "page": 1,
  "has_more": true,
  "total": 1000
}
```

预期约 3KB，减少 ~95%。

### 8.2 F1 — hot

**修复前**（第一条，2026-05-11 实跑，《陛下何故谋反》）：

```json
{
  "aid": 116546085061974,
  "videos": 1,
  "tid": 138,
  "tname": "搞笑",
  "copyright": 3,
  "pic": "http://i1.hdslb.com/bfs/archive/64c779d79c36b411608934d5953f8d4a857979f3.jpg",
  "title": "《陛下何故谋反》",
  "pubdate": 1778385600,
  "ctime": 1778352315,
  "desc": "-",
  "state": 0,
  "duration": 89,
  "mission_id": 4065149,
  "rights": { "bp": 0, "elec": 0, "download": 0, "movie": 0, "pay": 0, "hd5": 0, "no_reprint": 0, "autoplay": 1, "ugc_pay": 0, "is_cooperation": 0, "ugc_pay_preview": 0, "no_background": 0, "arc_pay": 0, "pay_free_watch": 0 },
  "owner": { "mid": 3493260618106936, "name": "伤心欲茄222", "face": "..." },
  "stat": { "aid": 116546085061974, "view": 4726595, "danmaku": 1505, "reply": 4409, "favorite": 15864, "coin": 6133, "share": 6407, "now_rank": 0, "his_rank": 12, "like": 303885, "dislike": 0, "vt": 0, "vv": 4726595, "fav_g": 0, "like_g": 10 },
  "dynamic": "",
  "cid": 38223285165,
  "dimension": { "width": 1080, "height": 1920, "rotate": 0 },
  "short_link_v2": "https://b23.tv/BV1wPRZBMEft",
  "up_from_v2": 36,
  "first_frame": "...",
  "pub_location": "上海",
  "cover43": "...",
  "tidv2": 2155,
  "tnamev2": "语言类小剧场",
  "pid_v2": 1021,
  "pid_name_v2": "小剧场",
  "bvid": "BV1wPRZBMEft",
  "season_type": 0,
  "is_ogv": false,
  "ogv_info": null,
  "enable_vt": 0,
  "ai_rcmd": null,
  "rcmd_reason": { "content": "", "corner_mark": 0 }
}
```

50+ 字段，单条约 1.2KB。

**修复后**：

```json
{
  "bvid": "BV1wPRZBMEft",
  "aid": 116546085061974,
  "title": "《陛下何故谋反》",
  "url": "https://www.bilibili.com/video/BV1wPRZBMEft",
  "cover": "https://i1.hdslb.com/bfs/archive/64c779d79c36b411608934d5953f8d4a857979f3.jpg",
  "owner": { "mid": 3493260618106936, "name": "伤心欲茄222", "avatar": "..." },
  "stat": { "view": 4726595, "like": 303885, "coin": 6133, "favorite": 15864, "reply": 4409, "danmaku": 1505, "share": 6407 },
  "duration_seconds": 89,
  "duration_text": "01:29",
  "description": "-",
  "pub_location": "上海",
  "category": "语言类小剧场",
  "pubdate": 1778385600,
  "extras": { "his_rank": 12, "rcmd_reason": "" }
}
```

12 个白名单字段 + 2 个 extras，单条约 350B，减少 ~70%。

### 8.3 F2 — danmaku

**修复前**（第一条）：

```json
{ "time_seconds": 1258.586, "mode": 1, "font_size": 25, "color": 16777215, "content": "2型结晶自己就是自己的催化剂..." }
```

**修复后**：

```json
{
  "time_seconds": 1258.586,
  "content": "2型结晶自己就是自己的催化剂...",
  "mode": 1,
  "mode_label": "滚动",
  "font_size": 25,
  "color": 16777215,
  "color_hex": "#ffffff"
}
```

LLM 不再需要查表理解 `1=滚动` / `16777215=白`。

### 8.4 F4 — subtitle

**修复前**（BV1WiRhBhEmQ，AI 中文字幕）：

```json
{
  "id": 2013306452378246100,
  "lan": "ai-zh",
  "lan_doc": "中文",
  "is_lock": false,
  "subtitle_url": "//aisubtitle.hdslb.com/bfs/ai_subtitle/prod/116530582917601381473943556ff7a6844c77334f4a2a7a46a2c0c358?auth_key=1778433492-...",
  "subtitle_url_v2": "//subtitle.bilibili.com/S%13%1BP.%1D%28%29X%2CR%5Ej%1F%25w%0E%02H%5E...",
  "type": 1,
  "id_str": "2013306452378246144",
  "ai_type": 1,
  "ai_status": 2
}
```

**修复后**：

```json
{
  "id": 2013306452378246100,
  "lan": "ai-zh",
  "lan_doc": "中文",
  "type": 1,
  "ai_generated": true,
  "subtitle_url": "https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/...?auth_key=..."
}
```

剥掉加密路径和无用状态，URL 已补 `https`。

## 9. 实施顺序

按下面顺序逐步落地，每一步独立可测、可 commit：

1. 创建 `src/tools/normalize.ts`（类型 + 4 个核心函数 + helper）
2. 把 `stripHtml` 从 `src/modules/search.ts` 迁移到 normalize.ts；更新 `discovery-tool.ts` 的 import
3. `searchVideos` 改为 raw passthrough（删 `{ raw, results }` 包装、删 `normalizeSearchItem`）
4. 把 snapshot.ts / subtitle.ts 的 URL helper 改用 `normalizeAbsoluteUrl`
5. 新增 `tests/tools/normalize.test.ts`（先写测试，然后补实现 / 调整 — TDD）
6. 调整 `src/tools/discovery-tool.ts` 的 hot / ranking / weekly / must_watch / related / search action
7. 调整 `src/tools/interaction-tool.ts` 的 danmaku action
8. 调整 `src/tools/video-tool.ts` 的 subtitle action
9. 增强既有 tool 测试（discovery / video / tools.test.ts）
10. `npm test` 全绿、`npm run build` 通过、commit

## 10. 验收标准

- 新增 / 修改的 6 个 tool action 输出全部符合本 spec 定义的 shape
- 单元测试全部通过（新增 normalize.test.ts + 增强既有 tool 测试），不引入回归
- `npm test` 全部 pass
- LLM 实跑 1 次复测：
  - `discovery search` 输出 < 5KB
  - `discovery hot` 每条字段数 ≤ 12（不含 extras）
  - `interaction danmaku` 含 `mode_label` / `color_hex`
  - `video subtitle` 不含 `subtitle_url_v2` / `is_lock` / `id_str` / `ai_type` / `ai_status`
