# bilibili-mcp

Bilibili MCP Server。用 CookieCloud 同步登录态,通过 endpoint JSON 声明驱动请求协议,内置 B 站新版反爬基线(WBI / bili_ticket / buvid 激活 / opus-goback),对齐 `bilibili-api` Python 参考项目。

- 协议:stdio + Streamable HTTP/SSE
- 版本要求:Node ≥ 18
- 许可:GPL-3.0-only

## 工具

| Tool | Actions |
|---|---|
| `bilibili_video` | `info` `pages` `detail` `subtitle` `summary` `snapshot` `stream` |
| `bilibili_interaction` | `comments` `replies` `danmaku` `like` `coin` `favorite` `follow` |
| `bilibili_discovery` | `search` `search_type` `suggest` `hot` `ranking` `weekly` `must_watch` `related` |
| `bilibili_config` | `setup` `status` |

写操作(`like`/`coin`/`favorite`/`follow`)走二阶段确认:

1. 第一次调用只返回 `pending: true` + `confirmation_token` + `expires_in_seconds: 300`,**不执行写**
2. 第二次调用携带同一组参数 + `confirmation_token`,服务端校验 token 绑定的 action/target/params 一致后才执行

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
