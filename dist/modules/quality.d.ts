export declare const QN_DESCRIPTIONS: Record<number, string>;
export declare function describeQuality(qn: number): string | null;
export interface QualityRequirements {
    need_login: boolean;
    need_vip: boolean;
}
export declare function getQualityRequirements(qn: number): QualityRequirements;
