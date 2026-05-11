import type { ApiEndpoint, RequestContext, RequestParams } from "./types.js";
export declare function request<T>(endpoint: ApiEndpoint, params?: RequestParams, ctx?: RequestContext): Promise<T>;
