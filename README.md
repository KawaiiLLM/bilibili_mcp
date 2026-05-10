# bilibili-mcp

全新的 Bilibili MCP Server，使用 CookieCloud 同步 B 站登录态，并通过 endpoint JSON 声明驱动请求协议。

## 功能

- `bilibili_video`：`info`、`detail`、`subtitle`、`summary`、`snapshot`、`stream`、`pages`
- `bilibili_interaction`：`comments`、`replies`、`danmaku`、`like`、`coin`、`favorite`、`follow`
- `bilibili_discovery`：`search`、`search_type`、`suggest`、`hot`、`ranking`、`weekly`、`must_watch`、`related`
- `bilibili_config`：`setup`、`status`

写操作包含点赞、投币、收藏、关注，必须走二阶段确认：

1. 第一次调用只返回 `pending: true`、`confirmation_token`、`expires_in_seconds: 300` 和确认说明，不执行写操作。
2. 第二次调用携带同一组参数和 `confirmation_token`，服务端校验 token 绑定的 action/target/params 后才执行。

## CookieCloud

服务只支持 CookieCloud，不支持手动粘贴 Cookie。推荐先在浏览器 CookieCloud 插件里同步 `bilibili.com` Cookie，再配置本服务：

```bash
cp .env.example .env
```

```env
BILIBILI_MCP_COOKIECLOUD_ENDPOINT=http://127.0.0.1:8088
BILIBILI_MCP_COOKIECLOUD_UUID=your-cookiecloud-uuid
BILIBILI_MCP_COOKIECLOUD_PASSWORD=your-cookiecloud-password
```

兼容别名：`COOKIECLOUD_ENDPOINT`、`COOKIECLOUD_UUID`、`COOKIECLOUD_PASSWORD`，以及 `CC_URL`、`CC_ID`、`CC_PASSWORD`。

也可以通过 MCP 工具配置：

```json
{
  "action": "setup",
  "endpoint": "http://127.0.0.1:8088",
  "uuid": "your-cookiecloud-uuid",
  "password": "your-cookiecloud-password"
}
```

## 本地命令

```bash
npm install
npm test
npm run build
npm run check
```

启动 stdio：

```bash
node dist/cli.js stdio
```

启动 Streamable HTTP：

```bash
BILIBILI_MCP_HTTP_PORT=3001 node dist/cli.js http
```

默认 HTTP 端点：

- Streamable HTTP：`/mcp`
- SSE：`/sse`
- SSE messages：`/messages`

## MCP 客户端示例

构建后使用本地命令：

```json
{
  "mcpServers": {
    "bilibili-mcp": {
      "command": "node",
      "args": ["/Users/zhaoqixuan/Projects/bilibili-mcp/dist/cli.js", "stdio"]
    }
  }
}
```

## 项目边界

当前仓库根目录 `/Users/zhaoqixuan/Projects/bilibili-mcp` 是实现目标。`bilibili-api/`、`biliscope-mcp/`、`bilibili-API-collect/` 只作为参考资料，不作为本项目源码的一部分。
