# 反爬基线对齐设计

> 对照参考项目 `bilibili-api/utils/network.py`,补齐 client.ts 缺失或弱化的几条关键反爬/凭据通路。
> 本 spec 覆盖 H1-H4 与 M1+M3,共 6 项修补。M6(WBI 字符 strip)放附录,需先实测再决定。

## 1. 目标

让目前所有 WBI / 写操作 / 冷启动路径与 `network.py` 行为对齐,堵住:
- 写操作的 `-111 csrf 校验失败`(H1)
- 未登录态被静默打出的匿名写请求(H2)
- WBI 接口被偶发抬升的 `-352` / `-412` 命中率(H3)
- WBI key 轮换窗口内的永久错误(H4)
- 登录态拿到匿名 ticket、冷启动 ticket fetch 被 412(M1 / M3)

## 2. 范围

### 在范围

- `core/client.ts`:csrf_token 字段、pre-flight credential 校验、opus-goback cookie、`-403` 触发 WBI 重签
- `core/ticket.ts`:`getBiliTicket` 接受 cookieHeader 参数;`fetchTicket` 携带凭据 + buvid
- `core/config.ts`:`wbiRetryTimes` 新配置,默认 3,环境变量 `BILIBILI_MCP_WBI_RETRY_TIMES`
- `core/errors.ts`:可能新增 `BILIBILI_LOGIN_REQUIRED` 错误码用于 H2
- 测试覆盖:每条修补对应至少一个单测

### 不在范围

- M2 (SESSDATA URL-quote 防护) —— CookieCloud 路径几乎不会触发,延后
- M4 (WBI nav 带 credential)、M5 (bool→params 搬移) —— 已知低风险
- L 级所有项(JSONP、APP-sign、jitter、`ac_time_value` 刷新、`OK` envelope、结构化反爬日志)
- M6 字符 strip —— 见附录,需实测

## 3. 架构

### 3.1 修改面

```
src/core/
  client.ts          ← 主要改动点:cookie 注入、pre-flight 检查、wbi 重试循环、csrf_token
  ticket.ts          ← getBiliTicket 签名扩展为 (opts: { signal, cookieHeader })
  config.ts          ← wbiRetryTimes
  errors.ts          ← BILIBILI_LOGIN_REQUIRED(可选,如复用 AUTH_REQUIRED 则不增)
  constants.ts       ← OPUS_GOBACK_COOKIE 常量
tests/core/
  client.test.ts     ← 新增 ~6 个测点
  ticket.test.ts     ← 修改既有 cookie 携带断言
```

### 3.2 调整后的请求流

```
performRequest:
  1. normalizeParams / buildUrl
  2. ★ pre-flight: endpoint.auth && !credential → throw LOGIN_REQUIRED
  3. ★ pre-flight: endpoint.csrf && !bili_jct → throw CSRF_MISSING
  4. resolveCredential → headers.Cookie
  5. buvid 注入 → headers.Cookie
  6. ★ opus-goback=1 → headers.Cookie(无条件)
  7. ticket 注入(WBI 限定):getBiliTicket({ cookieHeader: headers.Cookie })
  8. WBI 签名
  9. body 构造:csrf + ★ csrf_token 同时写
  10. throttledFetch → parseResponse
  
performWithAuthRefresh 重试逻辑:
  - WBI endpoint && (-352 或 -403) → clearWbiCache + 重试,最多 wbiRetryTimes 次
  - 非 WBI 的 -403/-101 → credential refresh,一次
```

## 4. 详细设计

### 4.1 H1 — POST body 同时写 `csrf` 与 `csrf_token`

参考 `network.py:2232-2233`:

```python
self.data["csrf"] = self.credential.bili_jct
self.data["csrf_token"] = self.credential.bili_jct
```

TS 改动 `client.ts:97-103`:

```typescript
if (endpoint.csrf) {
  const csrf = getBiliJct(credential);
  if (!csrf) throw new BilibiliAPIError(...);  // 实际已被 pre-flight 拦截,此处兜底
  bodyParams.csrf = csrf;
  bodyParams.csrf_token = csrf;   // 新增
}
```

form 与 json 两种编码都自动覆盖。

### 4.2 H2 — 写操作 pre-flight 凭据校验

参考 `network.py:2208-2213`:

```python
if self.credential is not None:
  if self.verify:
    self.credential.raise_for_no_sessdata()
  if self.method != "GET" and not self.no_csrf:
    self.credential.raise_for_no_bili_jct()
```

TS 设计:在 `performRequest` resolveCredential 之后立即检查。复用既有错误码以减少 surface:

```typescript
const credential = await resolveCredential(endpoint, ctx, forceRefresh);

if (endpoint.auth && !credential?.cookieHeader) {
  throw new BilibiliAPIError(
    "该接口需要登录态,请先通过 bilibili_config 配置 CookieCloud。",
    "BILIBILI_COOKIE_INVALID",  // 复用,语义贴近
  );
}
if (endpoint.csrf && !getBiliJct(credential)) {
  throw new BilibiliAPIError(
    "缺少 bili_jct Cookie,无法提交需要 CSRF 的请求。",
    "BILIBILI_CSRF_MISSING",
  );
}
```

**不新增错误码**:写工具的兜底文案已能引导用户走配置流程;新错误码会扩散到 tool layer。

**位置**:必须放在 `headers.Cookie = credential.cookieHeader` 之前,这样未登录场景一次网络请求都不发。

### 4.3 H3 — `opus-goback=1` cookie 全局注入

参考 `network.py:2240`:

```python
cookies["opus-goback"] = "1"
```

新增 `constants.ts`:

```typescript
export const OPUS_GOBACK_COOKIE = "opus-goback=1";
```

`client.ts` 在 buvid 注入之后、ticket 注入之前无条件追加:

```typescript
headers.Cookie = appendCookieFragment(headers.Cookie, OPUS_GOBACK_COOKIE);
```

新 helper `appendCookieFragment(cookieHeader, fragment): string`(就是 buvid/ticket 已经在做的同款拼接,抽一个共用)。所有请求都带,无开关。

### 4.4 H4 — WBI 在 `-352` 与 `-403` 上循环重试

参考 `network.py:2357-2378`:

```python
times = request_settings.get_wbi_retry_times()  # default 3
for i in range(times):
  try:
    ...
    break
  except ResponseCodeException as e:
    if e.code == -403 and self.wbi:
      api_helper._WBI_MIXIN_KEY_TIMESTAMP = -1
      continue
    raise
```

TS 改造 `performWithAuthRefresh`:

```typescript
async function performWithAuthRefresh<T>(...): Promise<T> {
  let lastError: unknown;
  const maxAttempts = endpoint.wbi ? config.wbiRetryTimes : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await performRequest(endpoint, params, ctx, forceRefresh);
    } catch (error) {
      lastError = error;
      if (endpoint.wbi && isWbiRecoverable(error)) {
        clearWbiCache();
        continue;
      }
      if (endpoint.auth && !ctx.credential && !forceRefresh && isAuthFailure(error)) {
        await credentialManager.markAuthFailureAndRefresh();
        return performRequest(endpoint, params, ctx, false);
      }
      throw error;
    }
  }
  throw lastError;
}

function isWbiRecoverable(error: unknown): boolean {
  if (!(error instanceof BilibiliAPIError)) return false;
  // WBI_FAILED 来自 -352;AUTH_REQUIRED 在 endpoint.wbi 上下文里覆盖 -403/-412
  // 此函数只在 endpoint.wbi=true 分支调用,所以这里把 AUTH_REQUIRED 视为 wbi key 过期
  return error.code === "BILIBILI_WBI_FAILED" || error.code === "BILIBILI_AUTH_REQUIRED";
}
```

**配置项** `config.ts`:

```typescript
wbiRetryTimes: 3,  // default
// env: BILIBILI_MCP_WBI_RETRY_TIMES
```

**注意点**:
- 非 WBI endpoint 的 `-403` 仍走 credential refresh 路径(地区拦截、写操作权限)
- credential refresh 与 WBI 重试**互斥**(一次请求里两者最多发生一种)
- `forceRefresh` 语义不变,只用于 credential 路径

### 4.5 M1 + M3 — `fetchTicket` 携带凭据与 buvid

参考 `network.py:1965-1989` 在 `_get_bili_ticket` 里:

```python
cookies = credential.get_cookies()  # 包含 SESSDATA / buvid3 等
resp = await Api(...).update_cookies(cookies).request()
```

TS 改动 `ticket.ts`:

```typescript
export interface GetTicketOptions {
  signal?: AbortSignal;
  cookieHeader?: string;  // 已经包含 credential + buvid 的拼好的 Cookie
}

export async function getBiliTicket(opts?: GetTicketOptions): Promise<string | undefined> {
  // 命中缓存仍直接返回(缓存内的 ticket 不绑定 cookie)
  if (cached && now < cached.expireAt) return cached.value;
  // 单飞 dedupe + fetch,把 cookieHeader 透传
  return inflight ??= fetchTicket(opts).finally(() => { inflight = null; });
}

async function fetchTicket(opts?: GetTicketOptions) {
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  if (opts?.cookieHeader) headers.Cookie = opts.cookieHeader;
  // 其它保持不变(query 拼 hexsign + ts + csrf=)
}
```

`client.ts` 调用点更新:

```typescript
if (config.enableBiliTicket && endpoint.wbi) {
  const ticket = await getBiliTicket({ signal: ctx.signal, cookieHeader: headers.Cookie });
  ...
}
```

**关键时序**:`headers.Cookie` 在此时已含 credential + buvid + opus-goback,正是参考项目带去 GenWebTicket 的全套。

**缓存正交性**:ticket 缓存只看 TTL,不按 cookie 分桶。第一次拿到的 ticket(可能带 SESSDATA)被 3 天复用;若期间 logout / login 切换,ticket 仍是上次身份的,但 server 端容忍此种 mismatch(降级为匿名权限,不会 -352)。**这是与参考项目的可控偏差**,接受。

## 5. 测试策略

`tests/core/client.test.ts` 新增:

1. **H1**:mock 一个 csrf=true 的 POST endpoint,断言 form body 中**同时**包含 `csrf=xxx` 与 `csrf_token=xxx`
2. **H2-auth**:auth=true endpoint 在无 credential 时 `await request(...)` 抛 `BILIBILI_COOKIE_INVALID`,且 fetch 调用次数 = 0
3. **H2-csrf**:csrf=true endpoint 在 credential 无 bili_jct 时抛 `BILIBILI_CSRF_MISSING`,fetch 次数 = 0
4. **H3**:任意请求(WBI 或非 WBI)的最终 Cookie header 都包含 `opus-goback=1`
5. **H4**:mock 前 2 次响应 `code=-403`,第 3 次成功;断言整体成功且 `clearWbiCache` 被调 2 次

`tests/core/ticket.test.ts` 修改:

6. **M1+M3**:mock GenWebTicket 接口,验证收到的 Cookie 包含调用方传入的片段(SESSDATA + buvid3);不传 cookieHeader 时回退匿名

## 6. 边界条件

- **缓存 ticket 命中时 cookieHeader 被忽略**:刻意设计,3 天 TTL 内不重 fetch
- **wbiRetryTimes=1**:行为退化为现状(仅 -352 触发一次重试 + -403 退给上层)
- **wbiRetryTimes=0**:不重试,任何 -352/-403 直抛(给 debug 用)
- **同一请求 credential refresh + wbi retry 不会叠加**:见 H4 的 `else if`
- **`opus-goback` 在不带 cookie 的请求里**:cookieHeader 起始为空,helper 自然处理为 `opus-goback=1` 单条
- **pre-flight 检查触发后 cache key 不写**:因为根本没到 `cacheManager.set`

## 7. 不变式

- pre-flight 失败时**不发 fetch**,不污染 rate limit queue 与缓存
- `opus-goback` 与 buvid / ticket 注入**串行追加**,不要求顺序但不能重复
- WBI 重试上限是**硬上限**,即使 server 一直回 -403 也只重 N 次,不死循环
- ticket 缓存不绑 cookie,fetchTicket 带 cookie 只是为了**让首次 ticket 拿到登录态**

## 8. 实测期望

修完后,这些场景应该明显改善:

- **写操作链路完整性**:like/coin/fav/follow 在已登录用户上,server 响应 0(目前在某些边界情况会 -111)
- **冷启动鲁棒性**:多次 reset-then-search 不再偶发 412
- **WBI key 轮换窗口**:无人工干预下,3 次重试内自愈,日志只看到 1-2 行 warn

## 9. 后续 milestone

- M2 SESSDATA URL-quote 防护(改 credential.ts:cookies bundling)
- M4 WBI nav 带 credential(改 wbi.ts:refreshKeys)
- L3 retry jitter(改 retry.ts)
- L5 `OK` envelope 兼容(改 client.ts:parseResponse)
- 暴露 `bilibili_config action=refresh_wbi` / `refresh_ticket` 调试工具

## 附录 A:M6 — WBI 字符 strip 实测计划

**问题**:`wbi.ts:93` 在签名前调用 `.replace(/[!'()*]/g, "")`,参考 `network.py:1933` 走 `urllib.parse.urlencode` 不剥这五个字符。

**风险评估**:若 server 与参考项目一致,我们对带 `'` 的搜索词会签错 → -352。但社区两种实现都存在,B 站可能两条路都通。需实测。

**实验**:

1. 跑 `bilibili_discovery action=search keyword="it's"`,观察是否返回 `-352`
2. 若 `-352`,在 wbi.ts 删除 `.replace(...)` 后再跑一次
3. 若仍 `-352`,问题不在这条;若成功,提 PR 删除
4. 把结果记入此 spec 章节或独立 incident note

不修不发版,纯排查。
