# buvid 激活（ExClimbWuzhi）设计

## 1. 目标

把 SPI 拿到的 `buvid3` / `buvid4` 在使用前通过 `/x/internal/gaia-gateway/ExClimbWuzhi` **激活**一次，让 B 站把它当作真实浏览器设备，与参考项目 `bilibili-api/utils/network.py:1595-1900+` 行为对齐。

当前 `core/buvid.ts:6-25` 仅调 SPI 拿 `b_3` / `b_4`，没有激活流程。未激活的 buvid 在 B 站风控视角里属于"伪造"，长时间使用会被标记，单 IP 高频访问会被限流。激活后会写入 B 站设备库，与正常浏览器流量不可区分。

## 2. 范围

### 在范围

- 新模块 `core/fingerprint.ts`：murmur3-x64-128、b_lsid、uuid_infoc、激活 payload 构造
- `core/buvid.ts` 扩展：SPI 之后立即激活
- `data/api/auth.json` 新增 ExClimbWuzhi endpoint
- `core/config.ts` 增加 `enableBuvidActivation: boolean` 开关（默认 `true`），环境变量 `BILIBILI_MCP_ENABLE_BUVID_ACTIVATION`
- 单元测试：murmur3 向量比对、payload 结构稳定性、激活失败不阻塞

### 不在范围

- `bili_ticket`（独立 spec：`2026-05-11-bili-ticket-design.md`）
- 真实浏览器指纹采集（payload 全部硬编码，与参考项目一致）
- buvid 持久化到文件（每次进程启动重新 SPI + 激活）
- 多设备 buvid 池（参考项目也是单实例）

## 3. 算法依赖

### 3.1 murmur3-x64-128

128 位 murmur3 哈希，输入 `string + seed`，输出 16 字节，按低 64 / 高 64 拼成 32 字符 hex。

**参考实现**：`network.py:1619-1700`（`murmur3_x64_128` + `fmix64` + `gen_buvid_fp`）。

**关键常量**（必须与参考一致，否则激活失败）：

```
C1 = 0x87C37B911142_53D5
C2 = 0x4CF5AD4327_45937F
C3 = 0x52DCE729
C4 = 0x38495AB5
R1 = 27, R2 = 31, R3 = 33, M = 5
fmix64 C1 = 0xFF51AFD7ED558CCD
fmix64 C2 = 0xC4CEB9FE1A85EC53
fmix64 R  = 33
```

**TypeScript 移植要点**：

- Python `int` 自然支持 64 位无溢出，TS 必须用 `BigInt`
- 所有运算后 `& 0xFFFFFFFFFFFFFFFFn`（即 `MOD = 1n << 64n`）模拟 uint64 wrap
- 输出 `h1.toString(16)` + `h2.toString(16)`，注意**不要 padStart**（参考项目用裸 hex 不补零）
- 输入 `string` 以 ASCII 字节流读取，每 16 字节为一组

```typescript
export function murmur3x64_128(input: string, seed: number): string {
  const bytes = Buffer.from(input, "ascii");
  // ... 处理逻辑，返回 hex
}
```

### 3.2 gen_uuid_infoc

```typescript
function genUuidInfoc(): string {
  // 8-4-4-4-12 分组，每位从 ["1".."9", "A".."F", "10"] 16 个候选随机
  // 末尾追加 (Date.now() % 100000) 右补 0 到 5 位 + "infoc"
}
```

参考 `network.py:1605-1610`。注意候选集是 16 个，最后一个是字符串 `"10"`（两字符）—— 这是参考项目的怪异行为，必须复刻不能简化为 hex。

### 3.3 gen_b_lsid

```typescript
function genBLsid(): string {
  // 前 8 位：8 次随机 0-15 转 hex 大写
  // 中间一个下划线
  // 后段：Date.now() 转 hex 大写
}
```

参考 `network.py:1612-1617`。

## 4. 架构

### 4.1 模块

```
core/
  buvid.ts                ← 修改：SPI 之后调用 activateBuvid
  fingerprint.ts          ← 新增：murmur3 + uuid_infoc + b_lsid + payload builder
  client.ts               ← 不变（buvid 注入逻辑已在）
  config.ts               ← 修改：enableBuvidActivation 开关
data/api/
  auth.json               ← 修改：新增 active_buvid endpoint
tests/core/
  fingerprint.test.ts     ← 新增（murmur3 向量、uuid_infoc 结构、b_lsid 结构）
  buvid.test.ts           ← 修改：激活成功路径、激活失败容错路径
```

### 4.2 数据流

```
首次 getBuvidCookies 被调用
  ↓
SPI fetch /x/frontend/finger/spi
  ↓
得到 b_3 / b_4
  ↓
config.enableBuvidActivation && !activated
  ├─ 否：直接缓存 b_3 / b_4 → 返回 cookie string
  └─ 是：
      activateBuvid(b_3, b_4):
        1. uuid = genUuidInfoc()
        2. payload_inner = JSON.stringify(buildActivationContent(uuid))
        3. payload_outer = JSON.stringify({ payload: payload_inner })
        4. buvid_fp = murmur3x64_128(payload_outer, 31)
        5. POST /x/internal/gaia-gateway/ExClimbWuzhi
           body = payload_outer (Content-Type: application/json)
           Cookie = "buvid3=...; buvid4=...; buvid_fp=...; _uuid=..."
        6. 检查 code == 0，warn 不抛错
      activated = true（即使失败也设 true，避免重试 hammer）
      cache buvid 同时持久存 buvid_fp + _uuid（最终 cookie 注入用）
  ↓
返回扩展 cookie："buvid3=...; buvid4=...; buvid_fp=...; _uuid=..."
```

### 4.3 cookie 注入顺序

业务请求的 cookie 现在变为（自左向右）：
```
SESSDATA=...; bili_jct=...; DedeUserID=...; buvid3=...; buvid4=...; buvid_fp=...; _uuid=...; bili_ticket=...
```

`_uuid` 和 `buvid_fp` 由 `core/buvid.ts` 一起返回，client.ts 不需要单独感知。

## 5. 接口设计

### 5.1 `core/fingerprint.ts`

```typescript
export function murmur3x64_128(input: string, seed: number): string;
export function genUuidInfoc(): string;
export function genBLsid(): string;
export function buildActivationPayload(uuid: string): string;
// 返回 outer JSON 字符串 '{"payload":"<inner json>"}'
```

### 5.2 `core/buvid.ts` 修改

```typescript
interface BuvidBundle {
  cookieHeader: string; // 含 buvid3/buvid4/buvid_fp/_uuid
}

let cached: BuvidBundle | undefined;
let inFlight: Promise<BuvidBundle | undefined> | null = null;
let pendingActivation: Promise<void> | null = null;

async function fetchBuvid(signal): Promise<BuvidBundle | undefined> {
  // SPI 拿 b_3, b_4
  const uuid = genUuidInfoc();
  const payload = buildActivationPayload(uuid);
  const buvidFp = murmur3x64_128(payload, 31);
  const cookieHeader = `buvid3=${b3}; buvid4=${b4}; buvid_fp=${buvidFp}; _uuid=${uuid}`;

  if (config.enableBuvidActivation) {
    // Fire-and-forget. Cookie 已经完整，activation 仅是服务端设备库登记，
    // await 会让首个业务请求白等 ExClimbWuzhi 延迟。
    pendingActivation = activateBuvid(cookieHeader, payload, signal).finally(() => {
      pendingActivation = null;
    });
  }
  return { cookieHeader };
}

// 测试钩子：等待后台激活落地
export async function _awaitBuvidActivationForTest(): Promise<void> {
  if (pendingActivation) await pendingActivation;
}
```

**关键不变式**：
1. **激活是 fire-and-forget**：不 await，cookie 立即返回。激活失败仅 warn 日志
2. **In-flight singleton**：N 个并发首请求只发 1 次 SPI + 1 次激活（通过 `inFlight` promise 去重）
3. **激活失败不污染缓存**：仅 SPI 成功的 cookie 写入 `cached`，激活成功与否不改变 cached 内容
4. **进程级单例**：activation 每进程触发一次（缓存命中后不再激活）

### 5.3 `data/api/auth.json` 新增 endpoint

```json
{
  "buvid": {
    "spi": {
      "url": "https://api.bilibili.com/x/frontend/finger/spi",
      "method": "GET",
      "wbi": false, "auth": false, "csrf": false, "buvid": false,
      "params_type": "query", "response_type": "json",
      "comment": "Fetch buvid3/buvid4 seeds. Documentation only."
    },
    "active_buvid": {
      "url": "https://api.bilibili.com/x/internal/gaia-gateway/ExClimbWuzhi",
      "method": "POST",
      "wbi": false, "auth": false, "csrf": false, "buvid": false,
      "params_type": "body", "content_type": "json", "response_type": "json",
      "comment": "Register buvid fingerprint. Documentation only."
    }
  }
}
```

**注意**：`activateBuvid` 与 `fetchBuvid` 不能直接走 `client.request()` —— 因为 client.ts 的 buvid 注入逻辑会递归调 `getBuvidCookies`，死循环。

**解决方案**：两个函数都用 `fetchWithTimeout` 直调，绕开 `client.request` 管线，自己拼 headers + cookies。catalog 中的 endpoint 定义**仅作为文档存在**，让 endpoint 目录完整，并给 api-loader 测试一个覆盖点。

### 5.4 `core/config.ts`

```typescript
enableBuvidActivation: boolean; // 默认 true
```

## 6. 激活 payload 结构

参考 `network.py:1702-1873` 的 `get_payload` 函数。内层 content 是一个嵌套字典，约 100 个键，模拟浏览器指纹。

**实现策略**：
1. 把整个 content 字典作为**硬编码常量** `ACTIVATION_PAYLOAD_TEMPLATE` 放在 `fingerprint.ts`
2. 仅两个字段动态替换：
   - `"5062"`：当前毫秒时间戳
   - `"df35"`：传入的 uuid
3. `JSON.stringify` 时**不能用默认行为**：参考项目用 `separators=(",", ":")` 表示**无空格**。TypeScript `JSON.stringify(obj)` 默认就是无空格，OK
4. **键顺序敏感**：B 站可能根据键顺序校验。TS 对象字面量按声明顺序遍历，复刻参考项目顺序

**风险**：payload 内嵌字符串里含大量复杂转义（webgl extensions 字符串、HTML/SVG 编码等）。port 时**逐字符比对**输出 JSON 与参考项目输出 JSON。

## 7. 测试策略

### `tests/core/fingerprint.test.ts`

1. **murmur3 向量比对**（最关键）：
   - 准备 10 个固定输入字符串（含空、ASCII、长字符串、含特殊字节），跑参考项目 Python 输出 hex
   - TypeScript `murmur3x64_128(input, 31)` 输出必须 byte-for-byte 一致
   - 这是激活成功与否的核心：错一位 hash 就被风控识别为伪造
2. **uuid_infoc 结构**：正则匹配 `^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\d{5}infoc$`，允许 "10" 双字符出现
3. **b_lsid 结构**：正则匹配 `^[0-9A-F]{8}_[0-9A-F]+$`
4. **buildActivationPayload 结构**：
   - 解析返回的 outer JSON → 必须有 `"payload"` key
   - 解析 inner JSON → 必须有 `"3064"`, `"5062"`, `"df35"` 等关键字段
   - `df35` 等于传入的 uuid
   - `5062` 是 13 位毫秒时间戳

### `tests/core/buvid.test.ts`

5. **激活成功**：mock SPI + ExClimbWuzhi 全 200，验证 `cookieHeader` 含 `buvid_fp=` 和 `_uuid=`
6. **激活失败不阻塞**：mock ExClimbWuzhi 返回 code !== 0，验证 `getBuvidCookies` 仍返回完整 cookie，仅日志 warn
7. **缓存命中**：第二次调用不发任何请求
8. **开关关闭**：`config.enableBuvidActivation = false` 时不调激活接口，但 cookie 仍含 buvid_fp + _uuid（degraded：发了"未激活"指纹）

## 8. 边界条件

- **murmur3 BigInt 性能**：每次请求都算 murmur3 大约 1ms，可接受。结果**缓存在 buvid bundle 内**，进程内一次（不重算）
- **并发激活**：用 in-flight promise 单例化，N 个并发请求只发 1 次激活
- **激活失败重试**：**不重试**（与参考项目一致）。失败即标 `activated = true`，避免 hammer
- **uuid 重复**：理论冲突概率极低（10^32 量级），不处理
- **time skew**：payload 里 `5062` 字段是 ms 时间戳，本地时钟略不准对激活无影响（B 站不强校验）
- **payload size**：约 4KB，对 POST body 无压力
- **encoding**：payload 全 ASCII，`Buffer.from(str, "ascii")` 与 Python `bytes(key, "ascii")` 等价

## 9. 实测期望

### 实现完成后验证

```typescript
// 单测向量（必须严格匹配 Python 输出）
murmur3x64_128("", 31) === "<expected hex from python>"
murmur3x64_128("hello", 31) === "<expected hex from python>"
murmur3x64_128('{"payload":"..."}', 31) === "<expected hex from python>"
```

### 集成验证

```bash
# 1. 跑 npm test，所有测试 pass
# 2. 跑一次 hot/search/info 等 read 接口
#    观察日志中 "buvid activation success" 出现一次（首次冷启动）
# 3. 第二次跑同样接口
#    观察日志中不再出现 buvid activation 相关记录（缓存命中）
# 4. 真实触发一个写操作（点赞/投币）
#    确认风控 -403/-352 概率下降
```

## 10. 不变式

- 激活失败 **绝不阻塞** SPI 返回的 cookie 注入（degrade gracefully）
- 激活 **每进程一次**（启动后 cached + activated 持续到进程退出）
- murmur3 实现 **byte-for-byte** 对齐参考项目（差一位即激活无效）
- payload 内层 JSON **键顺序与参考项目一致**（B 站可能基于 hash 校验）
- 激活的 fetch **不走 client.request()** 管线（避免递归注入死锁）

## 11. 风险与回退

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| murmur3 实现错误 | 中 | 激活无效，等同未做 | 严格用 10+ 已知向量比对 |
| payload 结构变更 | 低 | B 站升级风控算法 | 监控生产 -352 比例，必要时同步参考项目 |
| 激活接口下线 | 极低 | 整个 sub-project 报废 | enableBuvidActivation=false 一键回退 |
| ExClimbWuzhi 自身被风控 | 低 | 激活失败但不阻塞，等同未做 | 失败 warn，下次进程再试 |

## 12. 后续 milestone

- buvid 包持久化（多进程 / 重启复用同一 buvid，降低激活频次）
- payload 字段动态化（按当前时区/系统真实抓一些字段而非全 hardcode），更难识别
- 与 bili_ticket 联动：ticket 失败时强制 buvid 重激活
