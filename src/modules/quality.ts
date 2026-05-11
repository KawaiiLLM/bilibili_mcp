export const QN_DESCRIPTIONS: Record<number, string> = {
  6: "240P 极速",
  16: "360P 流畅",
  32: "480P 清晰",
  64: "720P 高清",
  74: "720P60 高帧率",
  80: "1080P 高清",
  100: "智能修复",
  112: "1080P+ 高码率",
  116: "1080P60 高帧率",
  120: "4K 超清",
  125: "HDR 真彩色",
  126: "杜比视界",
  127: "8K 超高清",
};

export function describeQuality(qn: number): string | null {
  return QN_DESCRIPTIONS[qn] ?? null;
}

export interface QualityRequirements {
  need_login: boolean;
  need_vip: boolean;
}

export function getQualityRequirements(qn: number): QualityRequirements {
  if (qn >= 112) return { need_login: true, need_vip: true };
  if (qn >= 64) return { need_login: true, need_vip: false };
  return { need_login: false, need_vip: false };
}
