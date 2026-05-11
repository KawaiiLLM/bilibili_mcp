import type { RequestContext } from "../core/types.js";
export interface LoginStatus {
    isLogin: boolean;
    mid?: number;
    uname?: string;
}
export declare function checkLoginStatus(ctx?: RequestContext): Promise<LoginStatus>;
