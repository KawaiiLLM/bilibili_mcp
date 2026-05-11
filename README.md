# bilibili-mcp

Bilibili MCP Server。用 CookieCloud 同步登录态,通过 endpoint JSON 声明驱动请求协议,内置 B 站新版反爬基线(WBI / bili_ticket / buvid 激活 / opus-goback),对齐 `bilibili-api` Python 参考项目。

- 协议:stdio + Streamable HTTP/SSE
- 版本要求:Node ≥ 18
- 许可:GPL-3.0-only

## 工具

四个 MCP tool,每个通过 `action` 参数选择具体操作。`input` 统一接受 BV 号、AV 号、视频链接或关键词。

### bilibili_video

视频信息、字幕、截图。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | 见下方 action 列表 |
| `input` | string | 是 | BV号/AV号/链接/关键词 |
| `page` | number | 否 | 分P序号,默认 1 |
| `preferred_lang` | string | 否 | 字幕语言偏好,如 `zh-Hans`、`en` |
| `timestamp` | number | 否 | snapshot 抽帧时间戳/秒 |
| `quality` | number | 否 | snapshot 抽帧清晰度 qn,默认 80 (1080P) |

#### action: `info`

获取视频基本信息、播放/点赞/收藏等统计、分P列表。

```json
// 请求
{ "action": "info", "input": "BV19v411r76g" }

// 返回 (新增 url + available_qualities)
{
  "title": "[中级乐理/熟肉/合集] 谁都能明白的和弦理论讲座（应用篇）",
  "bvid": "BV19v411r76g",
  "aid": 245338955,
  "url": "https://www.bilibili.com/video/BV19v411r76g",
  "owner": { "mid": 25329395, "name": "Sacrive" },
  "stat": {
    "view": 170789, "danmaku": 2195, "reply": 346,
    "favorite": 18501, "coin": 3779, "like": 7111
  },
  "duration_seconds": 9016,
  "duration_text": "150:16",
  "description": "...",
  "pages": [
    { "page": 1, "cid": 255219684, "part": "Part11_Dominant Motion_属进行", "duration_text": "13:59" },
    { "page": 2, "cid": 255219744, "part": "Part12_小调中的属和弦", "duration_text": "16:30" }
  ],
  "selected_page": 1,
  "selected_cid": 255219684,
  "available_qualities": [
    { "qn": 120, "desc": "4K 超清", "need_login": true, "need_vip": true },
    { "qn": 80,  "desc": "1080P 高清", "need_login": true, "need_vip": false },
    { "qn": 64,  "desc": "720P 高清", "need_login": true, "need_vip": false },
    { "qn": 32,  "desc": "480P 清晰", "need_login": false, "need_vip": false }
  ]
}
```

`available_qualities` 来自 playurl 接口的 `support_formats`,按 qn 降序;接口失败时该字段不返回。

#### action: `pages`

只返回分P列表(轻量)。

```json
// 请求
{ "action": "pages", "input": "BV19v411r76g" }

// 返回
{
  "bvid": "BV19v411r76g",
  "pages": [
    { "page": 1, "cid": 255219684, "part": "Part11_Dominant Motion_属进行", "duration_seconds": 839 },
    { "page": 2, "cid": 255219744, "part": "Part12_小调中的属和弦", "duration_seconds": 990 }
  ]
}
```

#### action: `detail`

视频详细信息,包含 tag、合集、推荐等扩展字段。

```json
{ "action": "detail", "input": "BV19v411r76g" }
```

#### action: `subtitle`

获取字幕列表和内容。需要登录态。

```json
// 请求
{ "action": "subtitle", "input": "BV19v411r76g", "page": 2, "preferred_lang": "zh-Hans" }

// 返回
{
  "bvid": "BV19v411r76g",
  "cid": 255219744,
  "subtitles": [
    { "id": 1115069406352192800, "lan": "ai-zh", "lan_doc": "中文", "ai_generated": true, "subtitle_url": "https://..." }
  ],
  "selected_language": "ai-zh",
  "selected_url": "https://..."
}
```

#### action: `summary`

AI 生成的视频摘要。需要登录态。

```json
{ "action": "summary", "input": "BV19v411r76g", "page": 2 }
```

#### action: `snapshot`

两种模式,按是否指定 `timestamp` 区分。

**模式 A — 不传 timestamp**:返回 B 站雪碧图元数据 (用于进度条预览)。

```json
// 请求
{ "action": "snapshot", "input": "BV19v411r76g", "page": 1 }

// 返回 (B 站原生 videoshot 响应)
{
  "image": ["https://i0.hdslb.com/bfs/videoshot/..."],
  "index": [0, 8, 14, 19, /* ... */],
  "img_x_len": 10,
  "img_y_len": 10,
  "img_x_size": 160,
  "img_y_size": 90
}
```

**模式 B — 传 timestamp**:取视频流并用 ffmpeg 抽出指定时间的单帧,返回临时文件路径。

```json
// 请求
{ "action": "snapshot", "input": "BV19v411r76g", "page": 2, "timestamp": 60, "quality": 80 }

// 返回
{
  "file": "/tmp/bilibili-snapshot-BV19v411r76g-p2-60s.jpg",
  "timestamp": 60,
  "width": 1920,
  "height": 1080,
  "quality": 80,
  "quality_desc": "1080P 高清"
}
```

- 内置 `ffmpeg-static`,无需额外安装
- 有 SESSDATA 时按 `quality` 取最高画质(默认 1080P);没登录态自动 `try_look=1 + platform=html5` 免登录拿 720P/1080P
- 文件写入 `os.tmpdir()`,文件名格式 `bilibili-snapshot-{bvid}-p{page}-{timestamp}s.jpg`
- ffmpeg 超时 30 秒,失败抛 `SNAPSHOT_EXTRACT_FAILED`

---

### bilibili_interaction

评论、弹幕、点赞、投币、收藏、关注。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | 见下方 action 列表 |
| `input` | string | 否 | BV号/AV号/链接(读操作) |
| `aid` | number | 否 | 视频 aid,可替代 input(写操作) |
| `limit` | number | 否 | 返回数量 |
| `mode` | number | 否 | 评论排序:0/3=热度 1=热度+时间 2=时间 |
| `cursor` | string | 否 | 评论分页游标 |
| `page` | number | 否 | 弹幕分P / 回复页码 |
| `rpid` | number | 否 | `replies` 根评论 ID |
| `like` | number | 否 | 1=点赞 2=取消 |
| `multiply` | number | 否 | 投币数量 1 或 2 |
| `select_like` | number | 否 | 投币同时点赞:0/1 |
| `mid` | number | 否 | `follow` 目标用户 mid |
| `act` | number | 否 | 1=关注 2=取消关注 |
| `add_media_ids` | number[] | 否 | 添加到的收藏夹 ID 列表 |
| `del_media_ids` | number[] | 否 | 从中移除的收藏夹 ID 列表 |
| `confirmation_token` | string | 否 | 写操作二阶段确认 token |

#### action: `comments`

获取视频评论。支持游标分页,每条评论内联 2-3 条热门子回复。

```json
// 请求
{ "action": "comments", "input": "BV19v411r76g", "mode": 0, "limit": 5 }

// 返回
{
  "comments": [
    {
      "rpid": 3701817834,
      "content": "草，为什么还有用voiceroid讲乐理的。我反手就是一个三连加关注。",
      "author": { "mid": "7970618", "name": "Endo_", "avatar": "https://..." },
      "like": 493,
      "ctime": 1605237833,
      "reply_count": 13,
      "replies": [
        {
          "rpid": 4082962449,
          "content": "！！！看你说我才发现缘兔！！！",
          "author": { "mid": "527247708", "name": "一名屑" },
          "like": 2, "reply_count": 0, "replies": []
        }
      ]
    }
  ],
  "cursor": { "next_cursor": "xxx", "is_end": false }
}
```

翻页:将 `cursor.next_cursor` 传入下一次请求的 `cursor` 参数。

#### action: `replies`

获取某条评论的完整子回复列表。传统页码分页。

```json
// 请求
{ "action": "replies", "input": "BV19v411r76g", "rpid": 3701817834, "page": 1 }

// 返回
{
  "replies": [
    {
      "rpid": 3774080588,
      "content": "kizuner集合！我是绊爱厨",
      "author": { "mid": "546643036", "name": "あっらふ" },
      "like": 2, "reply_count": 0, "replies": []
    }
  ],
  "page": { "pn": 1, "ps": 20, "count": 13 }
}
```

#### action: `danmaku`

获取指定分P的弹幕列表。

```json
// 请求
{ "action": "danmaku", "input": "BV19v411r76g", "page": 2 }

// 返回
{
  "cid": 255219744,
  "total": 238,
  "returned": 100,
  "truncated": true,
  "items": [
    {
      "time_seconds": 55.846,
      "content": "已经翻译完成了",
      "mode": 1, "mode_label": "滚动",
      "font_size": 25,
      "color": 16777215, "color_hex": "#ffffff"
    }
  ]
}
```

弹幕 `mode`:1=滚动 4=底端 5=顶端 6=逆向 7=精准定位 8=高级。

#### action: `like` / `coin` / `favorite` / `follow`

写操作走**二阶段确认**,防止误触:

```json
// 第一次调用 — 只返回 token,不执行
{ "action": "like", "input": "BV19v411r76g", "like": 1 }
// → { "pending": true, "confirmation_token": "abc123", "expires_in_seconds": 300 }

// 第二次调用 — 带上 token 才执行
{ "action": "like", "input": "BV19v411r76g", "like": 1, "confirmation_token": "abc123" }
// → { "success": true }
```

各写操作的特有参数:

| Action | 参数 | 说明 |
|---|---|---|
| `like` | `like`: 1 点赞 / 2 取消 | |
| `coin` | `multiply`: 1 或 2;`select_like`: 0/1 | 投币数量 + 是否同时点赞 |
| `favorite` | `add_media_ids` / `del_media_ids` | 收藏夹 ID 数组 |
| `follow` | `mid`(必填), `act`: 1 关注 / 2 取消 | 目标用户 mid |

---

### bilibili_discovery

搜索、热门、排行榜、推荐。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | 见下方 action 列表 |
| `keyword` | string | 否 | 搜索关键词 |
| `input` | string | 否 | `related` 使用的视频 BV/AV/链接 |
| `search_type` | string | 否 | 分类搜索类型,默认 `video` |
| `page` | number | 否 | 页码,默认 1 |
| `limit` | number | 否 | 返回数量,默认 10-20 |
| `rid` | number | 否 | 排行榜分区 ID |
| `type` | string | 否 | 排行榜类型,默认 `all` |

#### action: `search`

综合搜索。

```json
{ "action": "search", "keyword": "和弦理论", "page": 1, "limit": 5 }
```

#### action: `search_type`

按类型搜索(video/bangumi/media_ft/live/article/topic/user)。

```json
{ "action": "search_type", "keyword": "OzaShin", "search_type": "video", "page": 1 }
```

#### action: `suggest`

搜索建议/自动补全。

```json
{ "action": "suggest", "keyword": "乐理" }
```

#### action: `hot`

当前热门视频。

```json
{ "action": "hot", "limit": 10 }
```

#### action: `ranking`

分区排行榜。`rid` 为分区 ID(0=全站, 1=动画, 3=音乐, ...)。

```json
{ "action": "ranking", "rid": 3, "type": "all" }
```

#### action: `weekly`

每周必看。

```json
{ "action": "weekly" }
```

#### action: `must_watch`

入站必刷。

```json
{ "action": "must_watch" }
```

#### action: `related`

获取相关推荐视频。

```json
{ "action": "related", "input": "BV19v411r76g" }
```

---

### bilibili_config

CookieCloud 配置管理。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | `setup` 或 `status` |
| `endpoint` | string | 否 | CookieCloud 地址,如 `http://127.0.0.1:8088` |
| `uuid` | string | 否 | CookieCloud UUID |
| `password` | string | 否 | CookieCloud 端到端加密密码 |

#### action: `status`

查看当前配置和登录状态。

```json
// 请求
{ "action": "status" }

// 返回
{
  "configured": true,
  "cookie_source": "cookiecloud",
  "endpoint": "http://127.0.0.1:8088",
  "uuid_present": true,
  "password_present": true,
  "refresh_interval_minutes": 10,
  "has_credentials": true,
  "login": { "checked": true, "is_login": true, "mid": 8210306, "uname": "用户名" },
  "transport": "http",
  "http": { "host": "0.0.0.0", "port": 3000, "mcp_path": "/mcp" }
}
```

#### action: `setup`

配置 CookieCloud 连接信息,写入 `.env` 并立即同步 cookie。

```json
// 请求
{ "action": "setup", "endpoint": "http://127.0.0.1:8088", "uuid": "your-uuid", "password": "your-password" }

// 返回(同 status,多一个 saved_to 字段)
{ "configured": true, "saved_to": ".env", "status": { "login": { "is_login": true } } }
```

## 反爬基线

每个出站请求都自动注入:

- **CookieCloud 同步的 cookies**:SESSDATA / bili_jct / DedeUserID 必备,buvid3/4 等附带
- **`opus-goback=1`** cookie:B 站新风控的"web 来源"信号,全局无条件注入
- **buvid 激活**:首次请求若 CookieCloud 没带 buvid3,走 SPI → murmur3-x64-128 指纹 → ExClimbWuzhi POST(fire-and-forget,不阻塞业务)
- **bili_ticket**:HMAC-SHA256 生成 + 3 天内存缓存。仅对 WBI endpoint 注入,GenWebTicket 调用会带上当前 credential + buvid 取高权 ticket
- **WBI 签名**:mixin_key + w_rid + `web_location=1550101` 默认;v2 抗指纹 endpoint 自动加 `dm_img_*` 随机参数
- **WBI 重试预算**:wbi endpoint 在 `-352`(签名失败)或 `-403`(key 轮换)上自愈,默认 3 次;`-412`(IP 限流)不重试
- **Pre-flight 校验**:auth=true 无 SESSDATA / csrf=true 无 bili_jct → 不发请求,直接报错
- **POST body**:同时写 `csrf` 和 `csrf_token`(对齐参考项目)
- **限流串行**:进程级 promise queue,默认间隔 500ms

参考实测:已通过含撇号搜索词、登录态读写、WBI 接口轮换三类场景。

## CookieCloud 配置

只支持 CookieCloud,不接受手动粘贴 Cookie。先在浏览器 CookieCloud 插件同步 `bilibili.com`,再配置本服务。

```bash
cp .env.example .env
```

```env
BILIBILI_MCP_COOKIECLOUD_ENDPOINT=http://127.0.0.1:8088
BILIBILI_MCP_COOKIECLOUD_UUID=your-cookiecloud-uuid
BILIBILI_MCP_COOKIECLOUD_PASSWORD=your-cookiecloud-password
```

兼容别名:`COOKIECLOUD_ENDPOINT/UUID/PASSWORD` 与 `CC_URL/CC_ID/CC_PASSWORD`。

也可以通过 MCP 工具配置:

```json
{ "action": "setup", "endpoint": "http://127.0.0.1:8088", "uuid": "uuid", "password": "pass" }
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `BILIBILI_MCP_COOKIECLOUD_ENDPOINT` | (必填) | CookieCloud 服务地址 |
| `BILIBILI_MCP_COOKIECLOUD_UUID` | (必填) | CookieCloud UUID |
| `BILIBILI_MCP_COOKIECLOUD_PASSWORD` | (必填) | CookieCloud 端到端加密密码 |
| `BILIBILI_MCP_COOKIECLOUD_DOMAINS` | `bilibili.com,.bilibili.com,www.bilibili.com` | 逗号分隔,用于从同步的 cookies 中筛选 |
| `BILIBILI_MCP_COOKIE_REFRESH_INTERVAL_MINUTES` | `10` | 凭据刷新间隔 |
| `BILIBILI_MCP_RATE_LIMIT_MS` | `500` | 出站请求间隔(0 = 关闭) |
| `BILIBILI_MCP_REQUEST_TIMEOUT_MS` | `10000` | 单请求超时 |
| `BILIBILI_MCP_CACHE_SIZE` | `100` | GET 响应 LRU 缓存条目数 |
| `BILIBILI_MCP_USER_AGENT` | Chrome/147 macOS | 出站 User-Agent |
| `BILIBILI_MCP_ENABLE_BILI_TICKET` | `true` | 关闭 bili_ticket 注入 |
| `BILIBILI_MCP_ENABLE_BUVID_ACTIVATION` | `true` | 关闭 buvid 激活流 |
| `BILIBILI_MCP_WBI_RETRY_TIMES` | `3` | WBI endpoint 在 -352/-403 上重试上限 |
| `BILIBILI_MCP_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` / `silent` |
| `BILIBILI_MCP_TRANSPORT` | `http` | `stdio` / `http` |
| `BILIBILI_MCP_HTTP_HOST` | `0.0.0.0` | HTTP bind host |
| `BILIBILI_MCP_HTTP_PORT` | `3000` | HTTP bind port |
| `BILIBILI_MCP_HTTP_MCP_PATH` | `/mcp` | Streamable HTTP 路径 |
| `BILIBILI_MCP_HTTP_SSE_PATH` | `/sse` | SSE 路径 |
| `BILIBILI_MCP_HTTP_MESSAGES_PATH` | `/messages` | SSE messages 路径 |

## 本地命令

```bash
npm install
npm test          # 105 tests
npm run build     # tsc → dist/
npm run check     # 启动前自检
```

启动 stdio:

```bash
node dist/cli.js stdio
```

启动 Streamable HTTP:

```bash
BILIBILI_MCP_HTTP_PORT=3001 node dist/cli.js http
```

默认 HTTP 端点:

- Streamable HTTP:`/mcp`
- SSE:`/sse`
- SSE messages:`/messages`

## MCP 客户端示例

构建后:

```json
{
  "mcpServers": {
    "bilibili-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/bilibili-mcp/dist/cli.js", "stdio"]
    }
  }
}
```

HTTP 模式直接配 `http://127.0.0.1:3000/mcp` 即可。

## 项目结构

```
src/
  core/       请求管线、WBI、buvid、ticket、credential、retry、rate-limit
  data/api/   endpoint JSON catalog
  modules/    按领域的业务函数(video / comment / search / ...)
  tools/      MCP tool schema + 入口
  server/     stdio + HTTP transport
tests/        node:test 全套(core + tools + modules)
docs/
  superpowers/specs/  设计文档
  superpowers/plans/  实施计划
```

## 项目边界

仓库根目录 `bilibili-api/` / `biliscope-mcp/` / `bilibili-API-collect/` 是参考资料,**不**作为本项目源码的一部分。

## License

GPL-3.0-only。完整文本见 [LICENSE](./LICENSE)。
