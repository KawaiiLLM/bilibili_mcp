import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
export async function checkLoginStatus(ctx) {
    try {
        const data = await request(getEndpoint("video", "info", "get_nav"), {}, ctx);
        return {
            isLogin: data?.isLogin === true,
            mid: toOptionalNumber(data?.mid),
            uname: typeof data?.uname === "string" ? data.uname : undefined,
        };
    }
    catch {
        return { isLogin: false };
    }
}
function toOptionalNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
}
//# sourceMappingURL=auth.js.map