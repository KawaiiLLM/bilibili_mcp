# bili_ticket 集成设计

## 1. 目标

让所有 WBI 接口请求带 `bili_ticket` cookie，与参考项目 `bilibili-api/utils/network.py:1965-2073` 行为对齐。

`bili_ticket` 是 B 站 2024 年新增的 web 端反爬字段。WBI 签名失败（code -352）或风控敏感接口（如 `video.get_ai_conclusion`、`video.get_download_url`、写操作）会要求请求中携带有效 ticket。当前我们 `core/client.ts` 不带这个 cookie，是后续写操作和敏感读最大的风控暴露面。

## 2. 范围

### 在范围

- 新模块 `core/ticket.ts`：HMAC-SHA256 签名 + 获取 + 缓存 + 刷新
- `core/client.ts` 在 buvid 注入后追加 `bili_ticket` cookie
- `data/api/auth.json` 新增 GenWebTicket endpoint 定义
- `core/config.ts` 增加 `enableBiliTicket: boolean` 开关（默认 `true`），环境变量 `BILIBILI_MCP_ENABLE_BILI_TICKET`
- 单元测试覆盖：HMAC 输入输出、TTL 缓存命中、过期后自动刷新、获取失败不阻塞请求

### 不在范围

- `_active_buvid` 激活（独立 spec：`2026-05-11-buvid-activation-design.md`）
- bili_ticket 强制刷新工具方法（`refresh_bili_ticket()` 等价品仅作为内部 API 暴露，不上 MCP tool）
- 历史 ticket 持久化（每次进程启动重新获取，不写文件）

## 3. 架构

### 3.1 模块

```
core/
  ticket.ts          ← 新增：HMAC 签名 + getBiliTicket + cache
  client.ts          ← 修改：在 buvid 之后注入 ticket cookie
  config.ts          ← 修改：enableBiliTicket 开关
data/api/
  auth.json          ← 修改：新增 get_web_ticket endpoint
tests/core/
  ticket.test.ts     ← 新增
```

### 3.2 数据流

```
WBI 请求触发 client.ts
  ↓
performRequest:
  1. 解析 endpoint.defaults + ctx.params
  2. resolveCredential (cookie header)
  3. buvid 注入（如果 endpoint.buvid）
  4. ★ bili_ticket 注入（如果 config.enableBiliTicket）
       getBiliTicket(signal)
         ├─ 缓存内 && 未过期 → 返回缓存
         └─ 调 GenWebTicket → cache → 返回
       headers.Cookie 追加 "bili_ticket=<val>; bili_ticket_expires=<ts>"
  5. WBI 签名（如果 endpoint.wbi）
  6. fetch
```

### 3.3 缓存策略

- 模块内单例 `cachedTicket: { value: string; expireAt: number } | null`
- 命中条件：`now < expireAt`，返回 `value`
- 失效：返回 `undefined`（不抛错），并触发后台 fetch 重拉
- TTL：固定 3 天（`72 * 3600 * 1000` ms），对齐参考项目 `network.py:2067`
  - B 站接口本身不返回 ttl，参考项目 hardcode 3 天
- 进程内单例，无跨进程共享、无持久化

### 3.4 失败处理

- 网络错误 / B 站 code != 0：仅 `logger.warn`，函数返回 `undefined`
- client.ts 收到 `undefined` → 跳过 ticket 注入，请求按"未携带 ticket"继续
- **不阻塞业务请求**。这是兜底字段，缺失只是退化到 `-352` 自愈路径（已实现）

## 4. 接口设计

### 4.1 `core/ticket.ts`

```typescript
export async function getBiliTicket(signal?: AbortSignal): Promise<string | undefined>;
export function clearTicketCache(): void;
// 内部辅助
function hmacSha256(key: string, message: string): string;
async function fetchTicket(signal?: AbortSignal): Promise<{ value: string; expireAt: number } | undefined>;
```

**实现细节**：

```typescript
const TICKET_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 天
const HMAC_SECRET = "XgwSnGZ1p";

function hmacSha256(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

async function fetchTicket(signal?: AbortSignal): Promise<...> {
  const ts = Math.floor(Date.now() / 1000);
  const hexsign = hmacSha256(HMAC_SECRET, `ts${ts}`);
  const url = new URL("https://api.bilibili.com/bapis/.../GenWebTicket");
  url.searchParams.set("key_id", "ec02");
  url.searchParams.set("hexsign", hexsign);
  url.searchParams.set("context[ts]", String(ts));
  url.searchParams.set("csrf", "");
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { ...DEFAULT_HEADERS },
    signal,
  });
  // ...解析 response.json()，返回 { value, expireAt }
}
```

注意：`fetchTicket` **直接调 `fetchWithTimeout`，不走 `client.request()` 通用管线**。原因：
1. 通用管线会自动注入 buvid / bili_ticket cookie，而 GenWebTicket 本身不需要，且会形成 ticket → ticket 递归调用
2. 直接 fetch 牺牲了通用 retry / rate-limit，但 ticket 失败本身不阻塞业务请求（兜底字段），可接受
3. catalog 中的 endpoint 定义（`data/api/auth.json`）**仅作为文档存在**，不被 client.ts 调用

### 4.2 `core/client.ts` 集成点

```typescript
// 在 buvid 注入之后、wbi 签名之前，仅对 WBI endpoint 注入
if (config.enableBiliTicket && endpoint.wbi) {
  const ticket = await getBiliTicket(ctx.signal);
  if (ticket) {
    headers.Cookie = appendBiliTicket(headers.Cookie, ticket, cachedInfo.expireAt);
  }
}
```

**作用域：仅 WBI endpoint**。非 WBI 接口不带 `bili_ticket`，避免冷启动时未触及 WBI 的请求白付 GenWebTicket 延迟。需要"所有请求都带 ticket"时单独再评估。

新增 helper `appendBiliTicket(cookieHeader, ticket, expireAt): string`，输出形如 `bili_ticket=<val>; bili_ticket_expires=<unix>`。

### 4.3 `data/api/auth.json` endpoint

```json
{
  "ticket": {
    "get_web_ticket": {
      "url": "https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket",
      "method": "POST",
      "wbi": false,
      "auth": false,
      "csrf": false,
      "buvid": false,
      "params_type": "query",
      "response_type": "json",
      "comment": "Fetch bili_ticket... Catalog entry is documentation only."
    }
  }
}
```

参数走 query string（与参考项目 `params=` 行为一致），body 为空。

**注意**：此条目仅作为 catalog 文档存在。`core/ticket.ts:fetchTicket` 直接调用 `fetchWithTimeout`，不通过 `getEndpoint("auth", "ticket", "get_web_ticket")` 加载这个 endpoint。这样做的目的是：(a) 让 endpoint 目录完整，(b) 给 api-loader 测试一个覆盖点，(c) 标记 URL 与其它端点同源管理。

### 4.4 `core/config.ts`

```typescript
enableBiliTicket: boolean;
```

默认：`true`。环境变量 `BILIBILI_MCP_ENABLE_BILI_TICKET=false` 显式关闭。

## 5. 测试策略

`tests/core/ticket.test.ts`：

1. **HMAC 向量**：固定 `ts=1700000000`，验证 `hmacSha256("XgwSnGZ1p", "ts1700000000")` 输出已知 hash（用参考项目 Python 跑出参考向量预先填入）
2. **缓存命中**：连续两次 `getBiliTicket()`，fetch 只被调用一次
3. **TTL 过期**：mock `Date.now()` 模拟 3 天后调用，fetch 被重新触发
4. **失败容错**：mock fetch 返回 503，`getBiliTicket()` 返回 `undefined`，不抛错
5. **开关关闭**：`config.enableBiliTicket = false` 时 client.ts 不调用 `getBiliTicket`

`tests/core/client.test.ts` 新增 1 个集成测：

6. **client 注入 ticket**：mock 一个 wbi endpoint，验证最终 fetch 的 Cookie header 包含 `bili_ticket=<val>; bili_ticket_expires=<ts>`

## 6. 边界条件

- **首次冷启动**：第一次 WBI 请求触发 ticket fetch，rate limit queue 串行化（无并发问题）
- **并发请求**：相同进程内 N 个 WBI 请求同时来，应只发 1 次 GenWebTicket（用类似 wbi.ts 的"in-flight promise"模式）
- **time skew**：本地时钟不准导致 expireAt 提前过期，触发提前刷新，无副作用
- **GenWebTicket 自身被 -352**：理论不会（这个接口本身不签 WBI），但如果发生，进入通用 retry → 兜底返回 undefined
- **cookie size**：bili_ticket 大约 60 字符，bili_ticket_expires 10 位时间戳，对 Cookie header 无压力

## 7. 实测期望

实现完成后，对照参考项目跑：

```bash
# 测点 1：HMAC 向量比对
python -c "import hmac, hashlib; print(hmac.new(b'XgwSnGZ1p', b'ts1700000000', hashlib.sha256).hexdigest())"
# 对照 TypeScript 输出，必须完全一致

# 测点 2：真实 GenWebTicket 请求成功
# response.data.ticket 是 ~60 字符的 token
```

集成完成后，先前因风控被拒的接口（如 `bilibili_video action=summary` 涉及 AI 总结）应该能稳定返回 200。

## 8. 不变式

- bili_ticket 失败时 **绝不阻塞**业务请求（degrade gracefully）
- ticket 模块**不持久化**到文件（避免 multi-process 复杂度）
- TTL 误差不影响功能（B 站会自己校验，过期就 -352，触发自愈）
- 与 buvid / wbi 注入**串行**而非并发（client.ts 内部顺序）

## 9. 后续 milestone

- bili_ticket 失败时把 expireAt 设为 `now + 5min`（短退避）避免重复 hammer GenWebTicket
- 暴露 `bilibili_config action=refresh_ticket` 工具方便人工排错
- 与 buvid_fp 联动，把 ticket 失败上报到 buvid 激活重做
