export type ConfirmationFailureReason = "not_found" | "expired" | "mismatch";
export type ConfirmationConsumeResult = {
    ok: true;
} | {
    ok: false;
    reason: ConfirmationFailureReason;
};
export interface ConfirmationStore {
    create(action: string, params: unknown): string;
    consume(token: string, action: string, params: unknown): ConfirmationConsumeResult;
    cleanup(now?: number): void;
    ttlSeconds: number;
}
export declare function createConfirmationStore(secret?: string, ttlMs?: number): ConfirmationStore;
export declare function canonicalizeParams(params: unknown): string;
export declare function timingSafeEqualHex(left: string, right: string): boolean;
