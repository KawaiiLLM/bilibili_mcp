// Mirrors bilibili-api/utils/network.py:1612-1617. The reference also defines this but
// does not consume it in the activation flow. Reserved for future fingerprint extensions.
export function genBLsid(): string {
  let prefix = "";
  for (let i = 0; i < 8; i += 1) {
    prefix += Math.floor(Math.random() * 16).toString(16).toUpperCase();
  }
  return `${prefix}_${Date.now().toString(16).toUpperCase()}`;
}

const INFOC_ALPHABET: string[] = (() => {
  const pool: string[] = [];
  for (let i = 1; i <= 9; i += 1) pool.push(String(i));
  for (const c of "ABCDEF") pool.push(c);
  pool.push("10"); // intentional two-char element per reference network.py:1607
  return pool;
})();

function pickInfoc(count: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    out += INFOC_ALPHABET[Math.floor(Math.random() * INFOC_ALPHABET.length)];
  }
  return out;
}

export function genUuidInfoc(): string {
  const groups = [pickInfoc(8), pickInfoc(4), pickInfoc(4), pickInfoc(4), pickInfoc(12)];
  const t = Date.now() % 100000;
  return `${groups.join("-")}${String(t).padEnd(5, "0")}infoc`;
}

const MASK64 = (1n << 64n) - 1n;
const MURMUR_C1 = 0x87c37b91114253d5n;
const MURMUR_C2 = 0x4cf5ad432745937fn;
const MURMUR_C3 = 0x52dce729n;
const MURMUR_C4 = 0x38495ab5n;

function rotl64(value: bigint, count: number): bigint {
  const c = BigInt(count);
  return ((value << c) | (value >> (64n - c))) & MASK64;
}

function fmix64(value: bigint): bigint {
  let tmp = value;
  tmp ^= tmp >> 33n;
  tmp = (tmp * 0xff51afd7ed558ccdn) & MASK64;
  tmp ^= tmp >> 33n;
  tmp = (tmp * 0xc4ceb9fe1a85ec53n) & MASK64;
  tmp ^= tmp >> 33n;
  return tmp;
}

function readLE64(buffer: Buffer, offset: number): bigint {
  // Reference uses struct.unpack("<q", ...) (signed). For murmur3 the sign doesn't matter
  // when we re-mask with MASK64 immediately after every multiply, so we read unsigned.
  return buffer.readBigUInt64LE(offset);
}

export function murmur3x64_128(input: string, seed: number): string {
  const bytes = Buffer.from(input, "ascii");
  let h1 = BigInt(seed);
  let h2 = BigInt(seed);
  let offset = 0;
  const total = bytes.length;

  while (offset + 16 <= total) {
    const k1 = readLE64(bytes, offset);
    const k2 = readLE64(bytes, offset + 8);
    h1 ^= (rotl64((k1 * MURMUR_C1) & MASK64, 31) * MURMUR_C2) & MASK64;
    h1 = (((rotl64(h1, 27) + h2) & MASK64) * 5n + MURMUR_C3) & MASK64;
    h2 ^= (rotl64((k2 * MURMUR_C2) & MASK64, 33) * MURMUR_C1) & MASK64;
    h2 = (((rotl64(h2, 31) + h1) & MASK64) * 5n + MURMUR_C4) & MASK64;
    offset += 16;
  }

  let k1 = 0n;
  let k2 = 0n;
  const remaining = total - offset;
  if (remaining >= 15) k2 ^= BigInt(bytes[offset + 14]) << 48n;
  if (remaining >= 14) k2 ^= BigInt(bytes[offset + 13]) << 40n;
  if (remaining >= 13) k2 ^= BigInt(bytes[offset + 12]) << 32n;
  if (remaining >= 12) k2 ^= BigInt(bytes[offset + 11]) << 24n;
  if (remaining >= 11) k2 ^= BigInt(bytes[offset + 10]) << 16n;
  if (remaining >= 10) k2 ^= BigInt(bytes[offset + 9]) << 8n;
  if (remaining >= 9) {
    k2 ^= BigInt(bytes[offset + 8]);
    k2 = (rotl64((k2 * MURMUR_C2) & MASK64, 33) * MURMUR_C1) & MASK64;
    h2 ^= k2;
  }
  if (remaining >= 8) k1 ^= BigInt(bytes[offset + 7]) << 56n;
  if (remaining >= 7) k1 ^= BigInt(bytes[offset + 6]) << 48n;
  if (remaining >= 6) k1 ^= BigInt(bytes[offset + 5]) << 40n;
  if (remaining >= 5) k1 ^= BigInt(bytes[offset + 4]) << 32n;
  if (remaining >= 4) k1 ^= BigInt(bytes[offset + 3]) << 24n;
  if (remaining >= 3) k1 ^= BigInt(bytes[offset + 2]) << 16n;
  if (remaining >= 2) k1 ^= BigInt(bytes[offset + 1]) << 8n;
  if (remaining >= 1) {
    k1 ^= BigInt(bytes[offset]);
    k1 = (rotl64((k1 * MURMUR_C1) & MASK64, 31) * MURMUR_C2) & MASK64;
    h1 ^= k1;
  }

  h1 ^= BigInt(total);
  h2 ^= BigInt(total);
  h1 = (h1 + h2) & MASK64;
  h2 = (h2 + h1) & MASK64;
  h1 = fmix64(h1);
  h2 = fmix64(h2);
  h1 = (h1 + h2) & MASK64;
  h2 = (h2 + h1) & MASK64;
  return `${h1.toString(16)}${h2.toString(16)}`;
}

// Hardcoded fingerprint template mirrored from bilibili-api/utils/network.py:1703-1869.
// Two fields are populated dynamically: "5062" (ms timestamp) and "df35" (uuid).
// DO NOT reorder keys — server may hash key order.
function activationContent(uuid: string): Record<string, unknown> {
  return {
    "3064": 1,
    "5062": Date.now(),
    "03bf": "https%3A%2F%2Fwww.bilibili.com%2F",
    "39c8": "333.788.fp.risk",
    "34f1": "",
    "d402": "",
    "654a": "",
    "6e7c": "839x959",
    "3c43": {
      "2673": 0,
      "5766": 24,
      "6527": 0,
      "7003": 1,
      "807e": 1,
      "b8ce":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
      "641c": 0,
      "07a4": "en-US",
      "1c57": "not available",
      "0bd0": 8,
      "748e": [900, 1440],
      "d61f": [875, 1440],
      "fc9d": -480,
      "6aa9": "Asia/Shanghai",
      "75b8": 1,
      "3b21": 1,
      "8a1c": 0,
      "d52f": "not available",
      "adca": "MacIntel",
      "80c9": [
        ["PDF Viewer", "Portable Document Format", [["application/pdf", "pdf"], ["text/pdf", "pdf"]]],
        ["Chrome PDF Viewer", "Portable Document Format", [["application/pdf", "pdf"], ["text/pdf", "pdf"]]],
        ["Chromium PDF Viewer", "Portable Document Format", [["application/pdf", "pdf"], ["text/pdf", "pdf"]]],
        ["Microsoft Edge PDF Viewer", "Portable Document Format", [["application/pdf", "pdf"], ["text/pdf", "pdf"]]],
        ["WebKit built-in PDF", "Portable Document Format", [["application/pdf", "pdf"], ["text/pdf", "pdf"]]],
      ],
      "13ab": "0dAAAAAASUVORK5CYII=",
      "bfe9": "QgAAEIQAACEIAABCCQN4FXANGq7S8KTZayAAAAAElFTkSuQmCC",
      "a3c1": [
        "extensions:ANGLE_instanced_arrays;EXT_blend_minmax;EXT_color_buffer_half_float;EXT_float_blend;EXT_frag_depth;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBKIT_WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw",
        "webgl aliased line width range:[1, 1]",
        "webgl aliased point size range:[1, 511]",
        "webgl alpha bits:8",
        "webgl antialiasing:yes",
        "webgl blue bits:8",
        "webgl depth bits:24",
        "webgl green bits:8",
        "webgl max anisotropy:16",
        "webgl max combined texture image units:32",
        "webgl max cube map texture size:16384",
        "webgl max fragment uniform vectors:1024",
        "webgl max render buffer size:16384",
        "webgl max texture image units:16",
        "webgl max texture size:16384",
        "webgl max varying vectors:30",
        "webgl max vertex attribs:16",
        "webgl max vertex texture image units:16",
        "webgl max vertex uniform vectors:1024",
        "webgl max viewport dims:[16384, 16384]",
        "webgl red bits:8",
        "webgl renderer:WebKit WebGL",
        "webgl shading language version:WebGL GLSL ES 1.0 (1.0)",
        "webgl stencil bits:0",
        "webgl vendor:WebKit",
        "webgl version:WebGL 1.0",
        "webgl unmasked vendor:Apple Inc.",
        "webgl unmasked renderer:Apple GPU",
        "webgl vertex shader high float precision:23",
        "webgl vertex shader high float precision rangeMin:127",
        "webgl vertex shader high float precision rangeMax:127",
        "webgl vertex shader medium float precision:23",
        "webgl vertex shader medium float precision rangeMin:127",
        "webgl vertex shader medium float precision rangeMax:127",
        "webgl vertex shader low float precision:23",
        "webgl vertex shader low float precision rangeMin:127",
        "webgl vertex shader low float precision rangeMax:127",
        "webgl fragment shader high float precision:23",
        "webgl fragment shader high float precision rangeMin:127",
        "webgl fragment shader high float precision rangeMax:127",
        "webgl fragment shader medium float precision:23",
        "webgl fragment shader medium float precision rangeMin:127",
        "webgl fragment shader medium float precision rangeMax:127",
        "webgl fragment shader low float precision:23",
        "webgl fragment shader low float precision rangeMin:127",
        "webgl fragment shader low float precision rangeMax:127",
        "webgl vertex shader high int precision:0",
        "webgl vertex shader high int precision rangeMin:31",
        "webgl vertex shader high int precision rangeMax:30",
        "webgl vertex shader medium int precision:0",
        "webgl vertex shader medium int precision rangeMin:31",
        "webgl vertex shader medium int precision rangeMax:30",
        "webgl vertex shader low int precision:0",
        "webgl vertex shader low int precision rangeMin:31",
        "webgl vertex shader low int precision rangeMax:30",
        "webgl fragment shader high int precision:0",
        "webgl fragment shader high int precision rangeMin:31",
        "webgl fragment shader high int precision rangeMax:30",
        "webgl fragment shader medium int precision:0",
        "webgl fragment shader medium int precision rangeMin:31",
        "webgl fragment shader medium int precision rangeMax:30",
        "webgl fragment shader low int precision:0",
        "webgl fragment shader low int precision rangeMin:31",
        "webgl fragment shader low int precision rangeMax:30",
      ],
      "6bc5": "Apple Inc.~Apple GPU",
      "ed31": 0,
      "72bd": 0,
      "097b": 0,
      "52cd": [0, 0, 0],
      "a658": [
        "Andale Mono", "Arial", "Arial Black", "Arial Hebrew", "Arial Narrow", "Arial Rounded MT Bold",
        "Arial Unicode MS", "Comic Sans MS", "Courier", "Courier New", "Geneva", "Georgia",
        "Helvetica", "Helvetica Neue", "Impact", "LUCIDA GRANDE", "Microsoft Sans Serif", "Monaco",
        "Palatino", "Tahoma", "Times", "Times New Roman", "Trebuchet MS", "Verdana",
        "Wingdings", "Wingdings 2", "Wingdings 3",
      ],
      "d02f": "124.04345259929687",
    },
    "54ef":
      '{"in_new_ab":true,"ab_version":{"remove_back_version":"REMOVE","login_dialog_version":"V_PLAYER_PLAY_TOAST","open_recommend_blank":"SELF","storage_back_btn":"HIDE","call_pc_app":"FORBID","clean_version_old":"GO_NEW","optimize_fmp_version":"LOADED_METADATA","for_ai_home_version":"V_OTHER","bmg_fallback_version":"DEFAULT","ai_summary_version":"SHOW","weixin_popup_block":"ENABLE","rcmd_tab_version":"DISABLE","in_new_ab":true},"ab_split_num":{"remove_back_version":11,"login_dialog_version":43,"open_recommend_blank":90,"storage_back_btn":87,"call_pc_app":47,"clean_version_old":46,"optimize_fmp_version":28,"for_ai_home_version":38,"bmg_fallback_version":86,"ai_summary_version":466,"weixin_popup_block":45,"rcmd_tab_version":90,"in_new_ab":0},"pageVersion":"new_video","videoGoOldVersion":-1}',
    "8b94": "https%3A%2F%2Fwww.bilibili.com%2F",
    "df35": uuid,
    "07a4": "en-US",
    "5f45": null,
    "db46": 0,
  };
}

export function buildActivationPayload(uuid: string): string {
  const inner = JSON.stringify(activationContent(uuid));
  return JSON.stringify({ payload: inner });
}
