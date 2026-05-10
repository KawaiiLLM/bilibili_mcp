# Bilibili MCP 新架构设计

## 1. 目标

构建一个全新的 Bilibili MCP Server，定位为**个人 AI 助手 + 开源工具**。Milestone 1 聚焦视频核心能力，架构预留后续扩展空间。

核心原则：

- **根目录即项目**：`/Users/zhaoqixuan/Projects/bilibili-mcp` 是全新项目根目录；`bilibili-api/`、`biliscope-mcp/`、`bilibili-API-collect/` 仅作为只读参考资料，不作为实现目录，不沿用其包名、CLI 名、README 品牌或环境变量前缀。
- **项目身份统一**：package/bin 使用 `bilibili-mcp`，MCP server name 使用 `bilibili-mcp-server`，环境变量前缀使用 `BILIBILI_MCP_*`；可兼容 `COOKIECLOUD_*` 作为 CookieCloud 标准别名，但不使用 `BILISCOPE_*`。
- **底层全面封装**：SDK 层对照 `bilibili-API-collect` 文档 1:1 覆盖重要 API
- **上层精简聚合**：MCP 层通过 `action` 参数将多个 SDK 函数聚合为少量工具，降低 LLM 的工具选择负担
- **JSON 驱动端点**：API 端点定义与业务逻辑分离，参考 Nemo2011/bilibili-api 的 `data/api/*.json` 模式

## 2. 需求边界

### Milestone 1 范围

| 类别 | 能力 |
|---|---|
| 视频信息 | 基本信息、详情、分P列表、流地址 |
| 字幕 | 字幕列表、字幕内容、语言选择 |
| AI 摘要 | 视频 AI 总结（`/x/web-interface/view/conclusion/get`） |
| 视频快照 | 快照雪碧图获取 + 按时间戳裁剪 |
| 评论 | 评论列表、热评、回复、游标分页（`pagination_str` / `next_offset`） |
| 弹幕 | XML 弹幕 + Protobuf 分段弹幕 |
| 搜索 | 综合搜索、分类搜索、搜索建议、默认搜索词 |
| 排行/热门 | 热门视频、分区排行榜、每周必看、入站必刷 |
| 推荐 | 相关视频推荐 |
| 写操作 | 点赞、收藏、投币、关注（带确认机制） |
| 配置 | CookieCloud 配置、登录状态检查 |

### Milestone 1 不做

用户信息、收藏夹、历史记录、稍后再看、动态、专栏/图文、番剧、直播、音频、漫画。这些作为后续 Milestone 的独立模块扩展。

## 3. 架构

### 3.1 三层结构

```
┌─────────────────────────────────────────────────────┐
│                 MCP Layer (聚合层)                    │
│                                                      │
│  4 个 MCP 工具，通过 action 参数路由到 SDK 模块       │
│  职责：参数校验、action 路由、输出裁剪、错误格式化    │
│  工具：video / interaction / discovery / config       │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────┐
│                      ▼                                │
│               SDK Layer (领域模块)                     │
│                                                       │
│  每个模块对应一个业务领域，export 纯函数               │
│  函数签名：(params, ctx?) → Promise<T>                │
│  模块：video / subtitle / summary / snapshot /        │
│        comment / danmaku / search / ranking /          │
│        recommend / action                             │
└──────────────────────┬────────────────────────────────┘
                       │
┌──────────────────────┼────────────────────────────────┐
│                      ▼                                 │
│               Core Layer (基础设施)                    │
│                                                        │
│  HTTP 客户端、WBI 签名、Credential 管理、缓存、        │
│  重试、错误体系、BV/AV 转换、配置、API 定义加载器      │
└────────────────────────────────────────────────────────┘
```

### 3.2 目录结构

```
src/
├── core/                        # 基础设施
│   ├── api-loader.ts            # JSON API 定义加载器
│   ├── client.ts                # HTTP 客户端（限流、超时、重试）
│   ├── wbi.ts                   # WBI 签名（mixKey 缓存、w_rid 生成）
│   ├── buvid.ts                 # buvid3/buvid4 获取与缓存
│   ├── credential.ts            # CookieCloud 拉取/解密/刷新
│   ├── bvid.ts                  # BV↔AV 互转 + 短链解析
│   ├── cache.ts                 # LRU 缓存
│   ├── errors.ts                # 错误类型 + formatToolError
│   ├── config.ts                # 运行时配置 + 环境变量
│   ├── constants.ts             # 多 Base URL 常量
│   ├── retry.ts                 # 指数退避重试
│   └── types.ts                 # 公共类型（Credential, RequestContext）
│
├── data/
│   ├── api/                     # API 端点定义（JSON 驱动）
│   │   ├── video.json           # 视频信息 + 播放器 + 流地址 + 快照 + AI摘要
│   │   ├── comment.json         # 评论列表 + 回复
│   │   ├── danmaku.json         # XML 弹幕 + Protobuf 弹幕
│   │   ├── search.json          # 搜索 + 热搜 + 搜索建议
│   │   ├── ranking.json         # 热门 + 排行榜 + 每周必看 + 推荐
│   │   └── action.json          # 点赞 + 投币 + 收藏 + 关注
│   └── proto/                   # Protobuf 定义
│       └── dm.proto             # 弹幕消息定义（来源：bilibili-API-collect/grpc_api/bilibili/community/service/dm/v1/dm.proto）
│
├── modules/                     # SDK 领域模块
│   ├── video.ts                 # 视频信息、分P、流地址
│   ├── subtitle.ts              # 字幕列表、字幕内容
│   ├── summary.ts               # AI 摘要
│   ├── snapshot.ts              # 视频快照/截帧
│   ├── comment.ts               # 评论列表、热评、回复、分页
│   ├── danmaku.ts               # XML + Protobuf 弹幕
│   ├── search.ts                # 综合搜索、分类搜索、搜索建议
│   ├── ranking.ts               # 热门、排行榜、每周必看
│   ├── recommend.ts             # 相关推荐
│   └── action.ts                # 点赞、收藏、投币、关注
│
├── tools/                       # MCP 工具层
│   ├── video-tool.ts            # 聚合 video + subtitle + summary + snapshot
│   ├── interaction-tool.ts      # 聚合 comment + danmaku + action
│   ├── discovery-tool.ts        # 聚合 search + ranking + recommend
│   └── config-tool.ts           # CookieCloud 配置 + 状态检查
│
├── server.ts                    # MCP Server 创建 + 工具注册
├── http-server.ts               # Express HTTP 传输
├── cli.ts                       # CLI 入口
└── index.ts                     # 默认入口（HTTP 模式）
```

## 4. Core 层设计

### 4.1 JSON API 定义 (`data/api/*.json`)

参考 Nemo2011/bilibili-api，将 API 端点的 URL、HTTP 方法、签名要求、认证要求从代码中抽离到 JSON 文件。

**`ApiEndpoint` 完整字段：**

```typescript
interface ApiEndpoint {
  url: string;                           // 绝对 URL（如 "https://api.bilibili.com/x/web-interface/view"）
                                         // 或相对路径（如 "/{cid}.xml"，配合 base_url 使用）
  method: "GET" | "POST";
  // 签名与认证
  wbi: boolean;                          // 是否需要 WBI 签名（wts + w_rid）
  wbi2?: boolean;                        // 是否需要 WBI2 鼠标移动风控签名
                                         // 部分接口（如 /x/player/wbi/v2）同时需要 wbi + wbi2
                                         // wbi2 在 wbi 之前处理（参考 bilibili-api network.py:2219）
  auth: boolean;                         // 是否需要 Cookie 认证（SESSDATA）
  csrf: boolean;                         // 是否需要 CSRF Token（从 Cookie 的 bili_jct 取）
  buvid: boolean;                        // 是否需要附加 buvid Cookie
  // 请求格式
  params_type: "query" | "body";         // 参数位置：query string 或 request body
  content_type?: "form" | "json";        // body 编码（仅 params_type=body 时生效）
  // 响应格式
  response_type: "json" | "proto" | "text" | "binary";
  // 路由（仅 url 为相对路径时使用）
  base_url?: string;                     // constants.ts 中的 key（如 "comment" → comment.bilibili.com）
  referer?: string;                      // 覆盖默认 Referer
  // 默认/固定参数
  defaults?: Record<string, string | number>;  // 固定参数，SDK 调用时自动合并
                                               // 如 { "type": 2, "web_location": "333.934" }
  // 文档
  comment: string;
}
```

**URL 策略**：JSON 文件中的 `url` 字段支持两种写法：
- **绝对 URL**（推荐）：如 `"https://s.search.bilibili.com/main/hotword"` — 直接使用，无需 `base_url`。参考 bilibili-api 的做法，所有端点都用绝对 URL 可以覆盖任意子域（`s.search.bilibili.com`、`api.vc.bilibili.com` 等），不需要预注册 host 列表。
- **相对路径**：如 `"/{cid}.xml"` — 需要配合 `base_url` 字段指定 `constants.ts` 中的 key。用于路径含动态片段的特殊情况。

**参数名映射**：SDK 层使用 camelCase（如 `selectLike`），JSON defaults 和 B 站 API 使用 snake_case（如 `select_like`）。`api-loader.ts` 不做映射，各 SDK 模块在构造 params 时负责使用 API 的原始 snake_case 字段名。这样 JSON 中的 `defaults` 可以直接合并，无需转换。

**示例 `data/api/video.json`（读操作 — 注意 wbi2 和 defaults）：**

```json
{
  "info": {
    "get_info": {
      "url": "https://api.bilibili.com/x/web-interface/view",
      "method": "GET",
      "wbi": false, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "comment": "获取视频基本信息"
    },
    "get_detail": {
      "url": "https://api.bilibili.com/x/web-interface/wbi/view/detail",
      "method": "GET",
      "wbi": true, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "defaults": { "need_operation_card": 0, "need_elec": 0 },
      "comment": "获取视频详细信息（WBI 版，含 tags/staff）"
    },
    "get_player_info": {
      "url": "https://api.bilibili.com/x/player/wbi/v2",
      "method": "GET",
      "wbi": true, "wbi2": true, "auth": true, "csrf": false, "buvid": true,
      "params_type": "query", "response_type": "json",
      "comment": "获取播放器信息（含字幕列表），需要 wbi + wbi2"
    },
    "get_playurl": {
      "url": "https://api.bilibili.com/x/player/wbi/playurl",
      "method": "GET",
      "wbi": true, "auth": true, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "defaults": { "fnver": 0, "fnval": 16, "fourk": 1 },
      "comment": "获取视频流地址，默认 DASH 格式 + 4K"
    },
    "get_snapshot": {
      "url": "https://api.bilibili.com/x/player/videoshot",
      "method": "GET",
      "wbi": false, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "defaults": { "index": 1 },
      "comment": "获取视频快照雪碧图"
    },
    "get_ai_summary": {
      "url": "https://api.bilibili.com/x/web-interface/view/conclusion/get",
      "method": "GET",
      "wbi": true, "auth": true, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "comment": "获取视频 AI 摘要"
    }
  }
}
```

**示例 `data/api/action.json`（写操作 — csrf + form + defaults）：**

```json
{
  "video": {
    "like": {
      "url": "https://api.bilibili.com/x/web-interface/archive/like",
      "method": "POST",
      "wbi": false, "auth": true, "csrf": true, "buvid": true,
      "params_type": "body", "content_type": "form", "response_type": "json",
      "comment": "点赞视频，需要 buvid3"
    },
    "coin": {
      "url": "https://api.bilibili.com/x/web-interface/coin/add",
      "method": "POST",
      "wbi": false, "auth": true, "csrf": true, "buvid": false,
      "params_type": "body", "content_type": "form", "response_type": "json",
      "defaults": { "select_like": 0 },
      "comment": "投币，select_like=1 同时点赞"
    },
    "favorite": {
      "url": "https://api.bilibili.com/x/v3/fav/resource/deal",
      "method": "POST",
      "wbi": false, "auth": true, "csrf": true, "buvid": false,
      "params_type": "body", "content_type": "form", "response_type": "json",
      "defaults": { "type": 2 },
      "comment": "收藏视频到指定收藏夹，type=2 表示视频"
    }
  },
  "user": {
    "follow": {
      "url": "https://api.bilibili.com/x/relation/modify",
      "method": "POST",
      "wbi": false, "auth": true, "csrf": true, "buvid": false,
      "params_type": "body", "content_type": "form", "response_type": "json",
      "defaults": { "re_src": 11 },
      "comment": "关注/取关用户"
    }
  }
}
```

**示例 `data/api/search.json`（注意绝对 URL 指向不同子域）：**

```json
{
  "search": {
    "web_search": {
      "url": "https://api.bilibili.com/x/web-interface/wbi/search/all/v2",
      "method": "GET",
      "wbi": true, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "comment": "综合搜索"
    },
    "web_search_by_type": {
      "url": "https://api.bilibili.com/x/web-interface/wbi/search/type",
      "method": "GET",
      "wbi": true, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "comment": "分类搜索"
    },
    "hot_search_keywords": {
      "url": "https://s.search.bilibili.com/main/hotword",
      "method": "GET",
      "wbi": false, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "comment": "获取热搜（注意：host 为 s.search.bilibili.com）"
    },
    "suggest": {
      "url": "https://s.search.bilibili.com/main/suggest",
      "method": "GET",
      "wbi": false, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "comment": "获取搜索建议"
    }
  }
}
```

**示例 `data/api/danmaku.json`（Protobuf 响应 + 相对路径）：**

```json
{
  "segment": {
    "get_seg_proto": {
      "url": "https://api.bilibili.com/x/v2/dm/web/seg.so",
      "method": "GET",
      "wbi": false, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "proto",
      "defaults": { "type": 1 },
      "comment": "获取 Protobuf 分段弹幕，type=1 视频弹幕"
    },
    "get_seg_proto_wbi": {
      "url": "https://api.bilibili.com/x/v2/dm/wbi/web/seg.so",
      "method": "GET",
      "wbi": true, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "proto",
      "defaults": { "type": 1 },
      "comment": "获取 Protobuf 分段弹幕（WBI 版）"
    }
  },
  "xml": {
    "get_xml": {
      "url": "/{cid}.xml",
      "method": "GET",
      "wbi": false, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "text",
      "base_url": "comment",
      "comment": "获取 XML 弹幕（相对路径，base_url 指向 comment.bilibili.com）"
    }
  }
}
```

**加载器 `core/api-loader.ts`：**

```typescript
type ApiGroup = Record<string, Record<string, ApiEndpoint>>;

function loadApi(domain: string): ApiGroup { ... }

// 使用方式
const API = loadApi("video");
// API.info.get_info → { url: "...", method: "GET", wbi: false, ... }
```

**`core/client.ts` 如何消费 `ApiEndpoint`：**

`request()` 函数根据端点声明自动处理所有协议细节，SDK 模块无需关心：

```typescript
async function request<T>(
  endpoint: ApiEndpoint,
  params: Record<string, string | number>,
  ctx?: RequestContext,
): Promise<T> {
  // 处理顺序（参考 bilibili-api network.py L2217-2263）：
  //  1. endpoint.defaults → 合并固定参数到 params（SDK 传入的同名参数优先）
  //  2. endpoint.wbi2    → 调用 wbi2.signParams()（必须在 wbi 之前）
  //  3. endpoint.wbi     → 调用 wbi.signParams()（追加 wts + w_rid）
  //  4. endpoint.auth    → 注入 Cookie header（SESSDATA 等）
  //  5. endpoint.csrf    → 从 Cookie 提取 bili_jct，追加为 csrf + csrf_token
  //  6. endpoint.buvid   → 注入 buvid3/buvid4 Cookie（自动获取并缓存）
  //  7. endpoint.params_type → query: URL params / body: request body
  //  8. endpoint.content_type → form: x-www-form-urlencoded / json: application/json
  //  9. endpoint.response_type → json: .json() / proto: arrayBuffer → protobuf decode / text: .text()
  // 10. endpoint.url     → 绝对 URL 直接使用；相对路径拼接 base_url
  // 11. endpoint.referer → 覆盖默认 Referer
}
```

### 4.2 HTTP 客户端 (`core/client.ts`)

**重写**，不是小改。biliscope-mcp 的 `client.ts` 只支持 GET + query + JSON/text 响应，缺少 POST、form body、JSON body、Protobuf/binary 响应、endpoint-level base URL、自动 csrf 注入、wbi2 等能力。新 client 参考 bilibili-api `network.py` 的请求准备流程（L2200-2265），按 `ApiEndpoint` 声明驱动所有协议细节。复用 biliscope-mcp 的 WBI 签名算法、buvid 获取逻辑、限流/重试机制和错误码映射经验，但 HTTP 传输层本身是全新实现。

```typescript
// RequestContext 只承载运行时状态，不重复 ApiEndpoint 的声明式字段。
// wbi/buvid/csrf/referer/baseUrl 全部由 ApiEndpoint 驱动。
interface RequestContext {
  credential?: Credential;  // Cookie 注入源（未传则匿名）
  cache?: boolean;           // 是否使用缓存（默认 true）
  signal?: AbortSignal;      // 外部取消信号
}

async function request<T>(
  endpoint: ApiEndpoint,
  params: Record<string, string | number>,
  ctx?: RequestContext,
): Promise<T>;
```

核心机制（从 biliscope-mcp 复用）：
- 串行限流（`rateLimitMs` 间隔）
- 超时控制（`AbortController`）
- 指数退避重试（408/429/5xx）
- 认证失败自动刷新并重试一次
- B 站错误码映射（`-101`/`-403`/`-412` → 语义化错误）

**与 biliscope-mcp 的差异：**
- WBI 签名逻辑移到 `wbi.ts`
- buvid 逻辑移到 `buvid.ts`
- 不再硬编码 API URL，由 `ApiEndpoint` 传入
- `request()` 函数根据 `endpoint.wbi` 和 `endpoint.auth` 自动决定是否签名和注入 Cookie

### 4.3 WBI 签名 (`core/wbi.ts`)

从 biliscope-mcp `client.ts` 中拆出，独立模块。

```typescript
// salt 表、mixKey 计算、w_rid 生成
// 缓存 mixKey（TTL 1 小时）
// 对外暴露：
async function signParams(
  params: Record<string, string | number>,
): Promise<Record<string, string | number>>;
// 返回加上了 wts + w_rid 的 params
```

实现与 biliscope-mcp 完全一致（salt 表、`/x/web-interface/nav` 取 key、MD5），不做改动。

### 4.4 Credential (`core/credential.ts`)

从 biliscope-mcp `credentials.ts` 复用，保持 CookieCloud 全链路：

- 拉取：`GET {endpoint}/get/{uuid}`
- 解密：CryptoJS 兼容 AES-256-CBC（`md5(uuid-password)` 前 16 位作为 passphrase）
- 过滤：按 `cookieCloudDomains` 配置过滤 B 站相关 Cookie
- 校验：必须包含 `SESSDATA`、`bili_jct`、`DedeUserID`
- 定时刷新：默认 10 分钟
- 失败重拉：认证失败时 `markAuthFailureAndRefresh()`

与 biliscope-mcp 的差异：
- `configureCookieCloud()` 写 `.env` 并回滚的逻辑保留
- 暴露 `getCredential()` 返回 `Credential` 对象（含 cookieHeader），由 `client.ts` 在请求时注入

### 4.5 常量 (`core/constants.ts`)

参考 biligo，集中管理 B 站多个子域：

```typescript
export const BASE_URLS = {
  api: "https://api.bilibili.com",
  main: "https://www.bilibili.com",
  comment: "https://comment.bilibili.com",
  passport: "https://passport.bilibili.com",
  live: "https://api.live.bilibili.com",
  vc: "https://api.vc.bilibili.com",
} as const;
```

### 4.6 错误体系 (`core/errors.ts`)

从 biliscope-mcp 复用，保持现有的错误层次和 `formatToolError` 输出结构：

- `ValidationError`：参数校验错误，含 `fieldErrors` + `expected` + `allowed_values`
- `BilibiliAPIError`：B 站接口业务错误，含 `code` + `retryable` + `suggestion`
- `NetworkError`：HTTP 传输错误
- `TimeoutError`：请求超时
- `CommentsDisabledError`：评论关闭

## 5. SDK 层设计

每个模块是一个 `.ts` 文件，export 纯函数。函数通过 `core/api-loader.ts` 加载对应的 JSON 端点定义，通过 `core/client.ts` 发起请求。

### 5.1 `modules/video.ts`

```typescript
const API = loadApi("video");

// 获取视频基本信息
export async function getVideoInfo(
  params: { bvid?: string; aid?: number },
  ctx?: RequestContext,
): Promise<VideoInfo>;

// 获取视频详情（含 tags、staff 等）
export async function getVideoDetail(
  params: { bvid?: string; aid?: number },
  ctx?: RequestContext,
): Promise<VideoDetail>;

// 获取视频流地址
export async function getPlayUrl(
  params: { bvid: string; cid: number; qn?: number; fnval?: number },
  ctx?: RequestContext,
): Promise<PlayUrlResult>;

// 获取在线人数
export async function getOnlineCount(
  params: { bvid: string; cid: number },
  ctx?: RequestContext,
): Promise<{ total: string; count: string }>;
```

对照 `bilibili-API-collect/docs/video/info.md` 和 `videostream_url.md`。

### 5.2 `modules/subtitle.ts`

```typescript
// 获取字幕列表（从 player info 中提取）
export async function getSubtitleList(
  params: { bvid: string; cid: number },
  ctx?: RequestContext,
): Promise<SubtitleListItem[]>;

// 下载字幕内容
export async function getSubtitleContent(
  url: string,
  ctx?: RequestContext,
): Promise<SubtitleBody>;

// 聚合：获取最佳字幕（选语言 + 下载内容）
export async function getBestSubtitle(
  params: { bvid: string; cid: number; preferredLang?: string },
  ctx?: RequestContext,
): Promise<SubtitleResult | null>;
```

语言优先级保留 biliscope-mcp 的逻辑：`zh-Hans > ai-zh > zh-CN > zh-Hant > en`。

Cookie 过期智能检测保留：字幕列表空时打 `/x/web-interface/nav` 核实登录态。

### 5.3 `modules/summary.ts`

```typescript
// 获取视频 AI 摘要
export async function getAiSummary(
  params: { bvid: string; cid: number; upMid?: number },
  ctx?: RequestContext,
): Promise<AiSummaryResult>;
```

对照 `bilibili-API-collect/docs/video/summary.md`。返回 `summary`（文本摘要）+ `outline`（分段大纲含时间戳）。

### 5.4 `modules/snapshot.ts`

```typescript
// 获取快照元数据（雪碧图 URL + 时间索引）
export async function getSnapshotMeta(
  params: { bvid?: string; aid?: number; cid?: number },
  ctx?: RequestContext,
): Promise<SnapshotMeta>;

// 获取指定时间戳最近的帧图片 URL + 裁剪坐标
export function locateFrame(
  meta: SnapshotMeta,
  targetSeconds: number,
): FrameLocation;
```

`locateFrame` 是纯计算函数（不发请求）：在 `index` 数组中二分查找最近时间戳 → 计算在第几张雪碧图的第几行第几列 → 返回图片 URL 和裁剪坐标 `{ imageUrl, x, y, width: 160, height: 90 }`。

### 5.5 `modules/comment.ts`

```typescript
// 获取评论列表（游标分页）
export async function getComments(
  params: {
    oid: number;
    type?: number;    // 默认 1（视频）
    mode?: number;    // 0/3=热度, 1=热度+时间, 2=时间
    cursor?: string;  // 上一页返回的 next_cursor，首页不传
    ps?: number;      // 1-20
  },
  ctx?: RequestContext,
): Promise<CommentListResult>;

// 获取评论回复（回复仍用传统分页）
export async function getCommentReplies(
  params: { oid: number; rpid: number; type?: number; pn?: number; ps?: number },
  ctx?: RequestContext,
): Promise<CommentReplyResult>;
```

**游标分页实现：**

`/x/v2/reply/wbi/main` 使用 `pagination_str` 参数进行游标分页，而非传统 `pn`：

- 首页请求：不传 `pagination_str`
- 续页请求：`pagination_str={"offset":"{上一页 cursor.pagination_reply.next_offset 的值}"}`
- 响应中 `data.cursor.is_end` 为 `true` 时表示最后一页

SDK 返回的 `CommentListResult` 包含：

```typescript
interface CommentListResult {
  replies: CommentItem[];
  hots: CommentItem[] | null;
  top_replies: CommentItem[] | null;
  cursor: {
    all_count: number;
    is_end: boolean;
    next_cursor: string | null;  // 从 pagination_reply.next_offset 提取，透传给下次调用
    mode: number;
  };
}
```

MCP 工具层将 `next_cursor` 透传给 LLM，LLM 下次调用时通过 `cursor` 参数传回。

与 biliscope-mcp 的差异：
- 使用游标分页替代 `pn`，可靠续取
- 返回完整字段（`rpid`, `mid`, `ctime`, `reply_count`），不做裁剪，裁剪逻辑放在 MCP 工具层
- 优先使用 `/x/v2/reply/wbi/main`（WBI 版），失败回退 `/x/v2/reply/main`

### 5.6 `modules/danmaku.ts`

```typescript
// XML 弹幕（旧版，兼容保留）
export async function getDanmakuXml(
  params: { cid: number },
  ctx?: RequestContext,
): Promise<DanmakuItem[]>;

// Protobuf 分段弹幕
export async function getDanmakuSegment(
  params: { cid: number; segmentIndex: number },
  ctx?: RequestContext,
): Promise<DanmakuItem[]>;

// 聚合：获取完整弹幕（自动计算分段数）
export async function getAllDanmaku(
  params: { cid: number; duration: number },
  ctx?: RequestContext,
): Promise<DanmakuItem[]>;
```

`DanmakuItem` 包含完整字段（biliscope-mcp 丢弃的）：

```typescript
interface DanmakuItem {
  content: string;
  time: number;        // 秒
  type: number;        // 1-3 滚动, 4 底部, 5 顶部
  fontSize: number;    // 18/25/36
  color: number;       // RGB888
  sendTime: number;    // 发送时间戳
  pool: number;        // 0 普通, 1 字幕, 2 特殊
  midHash: string;     // 发送者 mid 哈希
  dmid: string;        // 弹幕 ID
  weight?: number;     // AI 权重（仅 Protobuf）
}
```

Protobuf 解析：使用 `src/data/proto/dm.proto`（从 `bilibili-API-collect/grpc_api/bilibili/community/service/dm/v1/dm.proto` 复制）+ `protobufjs` 运行时加载。构建时 `dm.proto` 通过 `package.json` 的 `files` 字段纳入 npm 包。也可预编译为 TypeScript 接口以获得类型安全。

### 5.7 `modules/search.ts`

```typescript
// 综合搜索
export async function search(
  params: { keyword: string; page?: number },
  ctx?: RequestContext,
): Promise<SearchResult>;

// 分类搜索（视频、番剧、用户等）
export async function searchByType(
  params: {
    keyword: string;
    searchType: SearchType;
    order?: string;
    duration?: number;
    tids?: number;
    page?: number;
    pageSize?: number;
  },
  ctx?: RequestContext,
): Promise<TypedSearchResult>;

// 搜索建议
export async function getSearchSuggestions(
  params: { keyword: string },
  ctx?: RequestContext,
): Promise<string[]>;

// 默认搜索词 + 热搜
export async function getHotSearchKeywords(
  ctx?: RequestContext,
): Promise<HotKeyword[]>;
```

与 biliscope-mcp 的差异：
- 增加 `order`（排序）、`duration`（时长筛选）、`tids`（分区筛选）参数
- 增加搜索建议和热搜
- `includeAuth: true` 带 Cookie（文档要求）

### 5.8 `modules/ranking.ts`

```typescript
// 热门视频（支持翻页）
export async function getHotVideos(
  params: { pn?: number; ps?: number },
  ctx?: RequestContext,
): Promise<VideoItem[]>;

// 分区排行榜
export async function getRanking(
  params: { rid?: number; type?: string },
  ctx?: RequestContext,
): Promise<VideoItem[]>;

// /x/web-interface/ranking/v2 的真实请求参数名是 rid
// （含义是目标分区 tid，且仅支持主分区），需要 WBI 签名
// 和固定参数 web_location=333.934。

// 每周必看列表
export async function getWeeklyList(
  ctx?: RequestContext,
): Promise<WeeklySeries[]>;

// 每周必看详情
export async function getWeeklyDetail(
  params: { week: number },
  ctx?: RequestContext,
): Promise<VideoItem[]>;

// 入站必刷
export async function getHistoryPopular(
  ctx?: RequestContext,
): Promise<VideoItem[]>;
```

### 5.9 `modules/recommend.ts`

```typescript
// 相关推荐（返回最多 40 条，不截断）
export async function getRelatedVideos(
  params: { bvid?: string; aid?: number },
  ctx?: RequestContext,
): Promise<VideoItem[]>;
```

### 5.10 `modules/action.ts`

所有写操作的 `credential` 不是可选的 — 必须已配置 CookieCloud。`csrf` 由 `client.ts` 从 Cookie 的 `bili_jct` 字段自动提取并注入（由 `ApiEndpoint.csrf: true` 声明触发），SDK 模块不需要手动传递。

```typescript
// 点赞
// 实际请求 body: aid={aid}&like={1|2}&csrf={bili_jct}
// 需要 buvid3（端点声明 buvid: true）
export async function likeVideo(
  params: { aid: number; like: 1 | 2 },
  ctx: RequestContext,
): Promise<ActionResult>;

// 投币
// 实际请求 body: aid={aid}&multiply={1|2}&select_like={0|1}&csrf={bili_jct}
export async function coinVideo(
  params: { aid: number; multiply?: 1 | 2; selectLike?: 0 | 1 },
  ctx: RequestContext,
): Promise<ActionResult>;

// 收藏到默认收藏夹
// 实际请求 body: rid={aid}&type=2&add_media_ids={fid}&csrf={bili_jct}
// 注意：收藏需要收藏夹 ID。未传 addMediaIds 时，模块内部查询默认收藏夹
// （调用 /x/v3/fav/folder/created/list-all，按 attr 位判断），无需调用方传入。
export async function favoriteVideo(
  params: { aid: number; addMediaIds?: number[]; delMediaIds?: number[] },
  ctx: RequestContext,
): Promise<ActionResult>;

// 关注/取关用户
// 实际请求 body: fid={mid}&act={1|2}&re_src=11&csrf={bili_jct}
export async function followUser(
  params: { mid: number; act: 1 | 2 },
  ctx: RequestContext,
): Promise<ActionResult>;
```

`ActionResult`：

```typescript
interface ActionResult {
  success: boolean;
  message: string;
  code: number;   // B 站原始返回码
}
```

**收藏夹策略**（解决 Milestone 1 不做收藏夹模块的矛盾）：`favoriteVideo` 在未传 `addMediaIds` 时，内部调用收藏夹列表接口查询默认收藏夹：

```
GET /x/v3/fav/folder/created/list-all?up_mid={DedeUserID}&type=2&rid={aid}
```

- `up_mid` 从 Cookie 的 `DedeUserID` 字段获取
- `type=2` 表示视频资源
- `rid` 为当前视频的 aid（用于标记该视频是否已收藏到各收藏夹）

从返回列表中按以下优先级选取默认收藏夹：

1. 优先选 `(attr & 2) === 0` 的条目（`attr` bit1 = 0 表示默认收藏夹；bit0 控制私密/公开，与默认无关）
2. 找不到则 fallback 到 `title === "默认收藏夹"` 的条目
3. 仍找不到则取列表中 `id` 最小的条目

如果明确传了 `addMediaIds` 则按传入值使用，跳过默认收藏夹查询。

## 6. MCP 工具层设计

### 6.1 工具清单

只暴露 **4 个 MCP 工具**，通过 `action` 参数路由：

| MCP 工具 | action 值 | 调用的 SDK 模块 |
|---|---|---|
| `bilibili_video` | `info` | video.getVideoInfo |
| | `detail` | video.getVideoDetail |
| | `subtitle` | subtitle.getBestSubtitle |
| | `summary` | summary.getAiSummary |
| | `snapshot` | snapshot.getSnapshotMeta + locateFrame |
| | `stream` | video.getPlayUrl |
| | `pages` | video.getVideoInfo → pages 字段 |
| `bilibili_interaction` | `comments` | comment.getComments |
| | `replies` | comment.getCommentReplies |
| | `danmaku` | danmaku.getDanmakuXml / getDanmakuSegment |
| | `like` | action.likeVideo |
| | `coin` | action.coinVideo |
| | `favorite` | action.favoriteVideo |
| | `follow` | action.followUser |
| `bilibili_discovery` | `search` | search.searchByType |
| | `search_type` | search.searchByType |
| | `suggest` | search.getSearchSuggestions |
| | `hot` | ranking.getHotVideos |
| | `ranking` | ranking.getRanking |
| | `weekly` | ranking.getWeeklyDetail |
| | `must_watch` | ranking.getHistoryPopular |
| | `related` | recommend.getRelatedVideos |
| `bilibili_config` | `setup` | credential.configureCookieCloud |
| | `status` | credential.getStatus + checkLoginStatus |

### 6.2 工具 Schema 示例

**`bilibili_video` 工具：**

```json
{
  "name": "bilibili_video",
  "description": "B 站视频工具。通过 action 参数选择操作：info(基本信息), detail(详情), subtitle(字幕), summary(AI摘要), snapshot(截帧), stream(流地址), pages(分P列表)。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["info", "detail", "subtitle", "summary", "snapshot", "stream", "pages"],
        "description": "操作类型"
      },
      "input": {
        "type": "string",
        "description": "BV号、AV号、视频链接或关键词"
      },
      "page": {
        "type": "number",
        "description": "分P序号，默认 1"
      },
      "preferred_lang": {
        "type": "string",
        "description": "字幕语言偏好（仅 action=subtitle 时生效），如 zh-Hans、en"
      },
      "timestamp": {
        "type": "number",
        "description": "目标时间戳/秒（仅 action=snapshot 时生效）"
      },
      "quality": {
        "type": "number",
        "description": "视频清晰度 qn（仅 action=stream 时生效），如 80=1080P"
      }
    },
    "required": ["action", "input"]
  }
}
```

### 6.3 输出裁剪

MCP 工具层对 SDK 返回的原始数据进行裁剪，只保留 LLM 有用的字段。例如：

- `bilibili_video` action=info：裁掉 `rights`、`dimension`、`argue_info` 等，保留 title/bvid/aid/owner/stat/pages/desc/tags
- `bilibili_interaction` action=comments：根据 `detail_level` 参数决定返回的评论字段和数量
- `bilibili_interaction` action=danmaku：只返回 content/time/type，过滤掉 color/fontSize 等 LLM 不需要的字段

### 6.4 写操作确认机制

`bilibili_interaction` 的写操作（like/coin/favorite/follow）采用两阶段调用，通过 `confirmation_token` 绑定防绕过。

**阶段 1 — 确认请求（`confirmation_token` 未传）：**

工具不执行操作，解析目标、生成 token 并返回确认信息：

```json
{
  "pending": true,
  "action": "like",
  "target": { "bvid": "BV1xxxxx", "title": "视频标题", "aid": 12345 },
  "description": "即将为视频「视频标题」点赞",
  "confirmation_token": "a1b2c3d4e5f6...",
  "expires_in_seconds": 300,
  "confirm_hint": "请确认后携带 confirmation_token 重新调用"
}
```

**Token 生成逻辑（服务端内存）：**

```typescript
// token = HMAC-SHA256(action + target_id + normalized_params + created_at, server_secret)
// 存入内存 Map<token, { action, params, createdAt, expiresAt }>
// TTL 5 分钟，过期或使用后立即删除
```

**阶段 2 — 执行请求（携带 `confirmation_token`）：**

服务端校验 token 存在、未过期、且绑定的 action + params 与当前请求一致，校验通过后执行：

```json
{
  "pending": false,
  "action": "like",
  "target": { "bvid": "BV1xxxxx", "title": "视频标题", "aid": 12345 },
  "result": { "success": true, "message": "0", "code": 0 }
}
```

Token 不匹配或已过期时返回 `CONFIRMATION_INVALID` 错误，要求重走阶段 1。

**写操作参数差异：**

| action | 必填参数 | 可选参数 | 说明 |
|---|---|---|---|
| `like` | `input` (视频) | — | 点赞视频 |
| `coin` | `input` (视频) | `multiply` (1\|2) | 投币 |
| `favorite` | `input` (视频) | `folder_id` | 收藏，不传 folder_id 则用默认收藏夹 |
| `follow` | `mid` (用户ID) | — | 关注用户 |

**`bilibili_interaction` 完整 Schema：**

```json
{
  "name": "bilibili_interaction",
  "description": "B 站互动工具。读操作：comments(评论), replies(回复), danmaku(弹幕)。写操作：like(点赞), coin(投币), favorite(收藏), follow(关注) — 写操作需要先不带 confirmation_token 调用获取确认信息，再携带 confirmation_token 执行。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["comments", "replies", "danmaku", "like", "coin", "favorite", "follow"],
        "description": "操作类型"
      },
      "input": {
        "type": "string",
        "description": "BV号/AV号/链接/关键词（comments/danmaku/like/coin/favorite 必填）"
      },
      "mid": {
        "type": "number",
        "description": "用户 ID（仅 action=follow 时必填）"
      },
      "rpid": {
        "type": "number",
        "description": "评论 ID（仅 action=replies 时必填，从 comments 返回中获取）"
      },
      "page": { "type": "number", "description": "分P序号（仅 danmaku）；回复页码（仅 replies，默认 1）" },
      "cursor": { "type": "string", "description": "分页游标（仅 comments 时生效，从上次返回的 next_cursor 获取）" },
      "mode": { "type": "number", "description": "评论排序模式（仅 comments）：0或3=热度（默认）, 1=热度+时间, 2=时间" },
      "limit": { "type": "number", "description": "弹幕条数限制（仅 danmaku，默认 100）" },
      "multiply": { "type": "number", "description": "投币数量 1 或 2（仅 action=coin）" },
      "folder_id": { "type": "number", "description": "收藏夹 ID（仅 action=favorite，不传则用默认收藏夹）" },
      "confirmation_token": { "type": "string", "description": "写操作确认令牌（阶段 1 返回，阶段 2 传入执行）" }
    },
    "required": ["action"]
  }
}
```

### 6.5 错误输出格式

保持 biliscope-mcp 的结构化错误输出，LLM 可理解并修正参数：

```json
{
  "error": true,
  "code": "VALIDATION_ERROR",
  "message": "page 超出当前视频的分P范围。",
  "retryable": false,
  "tool": "bilibili_video",
  "action": "subtitle",
  "suggestion": "请按字段说明修正参数后重试。",
  "field_errors": [...],
  "expected": { "action": "...", "input": "...", ... }
}
```

## 7. 输入解析

保留 biliscope-mcp 的统一输入解析逻辑，`input` 参数支持多种格式：

1. **BV 号**：`BV1YFQPB8Ee2` → 直接使用
2. **AV 号**：`av170001` 或 `170001` → 提取数字
3. **视频链接**：`https://www.bilibili.com/video/BVxxx` → 提取 BV 号
4. **短链接**：`https://b23.tv/xxx` → redirect follow → 提取 BV 号
5. **关键词**：其他文本 → 调用搜索 API 取第一条结果

解析链路保持在 `core/bvid.ts` 中，SDK 模块的 `bvid` 参数接收的是已解析的标准 BV 号。MCP 工具层负责调用解析。

## 8. 缓存策略

| 缓存对象 | TTL | 说明 |
|---|---|---|
| WBI mixKey | 1 小时 | 签名密钥，每天轮换，1h 安全 |
| buvid3/buvid4 | 24 小时 | 设备标识 |
| 视频信息 | 1 小时 | 基本不变 |
| 字幕内容 | 1 小时 | 基本不变 |
| 评论 | 30 分钟 | 更新较快 |
| 快照元数据 | 24 小时 | 视频发布后不变 |
| AI 摘要 | 1 小时 | 基本不变 |

使用 `quick-lru`（biliscope-mcp 已使用），带 `maxAge` 和 `maxSize`。

## 9. 传输层

双模式，和 biliscope-mcp 一致：

- **stdio**：`node dist/cli.js stdio` — 用于 Claude Code 等本地 IDE
- **Streamable HTTP**：`node dist/cli.js http` — 用于远程部署

CLI 入口通过 `commander` 处理子命令：`stdio` / `http` / `check`（检查 CookieCloud 配置）。

## 10. 从 biliscope-mcp 复用的代码

| 源文件 | 目标 | 改动 |
|---|---|---|
| `client.ts` | `core/client.ts` | **重写**。复用 WBI 算法→`wbi.ts`、buvid 逻辑→`buvid.ts`、限流/重试/错误映射经验。新增 POST/form/json body、Protobuf 响应、wbi2、自动 csrf/defaults 注入、绝对 URL 路由 |
| `credentials.ts` | `core/credential.ts` | 基本不动，暴露 `Credential` 对象 |
| `errors.ts` | `core/errors.ts` | 基本不动，增加 `action` 字段到错误输出 |
| `bvid.ts` | `core/bvid.ts` | 不动 |
| `cache.ts` | `core/cache.ts` | 不动 |
| `retry.ts` | `core/retry.ts` | 不动 |
| `config.ts` | `core/config.ts` | 增加 `constants.ts` 多 URL，其余不动 |
| `validation.ts` | `tools/*.ts` 内联 | 校验逻辑移到 MCP 工具层，不再独立文件 |
| `http-server.ts` | `http-server.ts` | 不动 |
| `cli.ts` | `cli.ts` | 不动 |

## 11. 技术栈

| 依赖 | 用途 | 来源 |
|---|---|---|
| `@modelcontextprotocol/sdk` | MCP 协议 | 保留 |
| `express` | HTTP 传输 | 保留 |
| `commander` | CLI | 保留 |
| `dotenv` | 环境变量 | 保留 |
| `quick-lru` | LRU 缓存 | 保留 |
| `protobufjs` | Protobuf 弹幕解析 | **新增** |
| `sharp` (可选) | 快照雪碧图裁剪 | **新增，可选依赖** |
| `typescript` | 编译 | 保留 |

`sharp` 为可选依赖：如果安装了就可以裁剪返回具体帧图片，未安装则只返回雪碧图 URL + 裁剪坐标。

## 12. 后续 Milestone 扩展路径

Milestone 1 架构预留以下扩展点，每个扩展只需：
1. 在 `data/api/` 添加 JSON 定义文件
2. 在 `modules/` 添加领域模块
3. 在 `tools/` 添加或扩展 MCP 工具的 action

| Milestone | 新增模块 | 新增/扩展 MCP 工具 |
|---|---|---|
| M2 | user.ts, dynamic.ts | `bilibili_user` (info/dynamics/follow-list) |
| M2 | favorite.ts, history.ts, watchlater.ts | `bilibili_personal` (favorites/history/watchlater) |
| M3 | live.ts, bangumi.ts | `bilibili_live`, `bilibili_bangumi` |
| M3 | article.ts, opus.ts, audio.ts | `bilibili_content` (article/opus/audio) |
