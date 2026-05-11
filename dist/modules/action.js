import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { credentialManager, getDedeUserId } from "../core/credential.js";
export async function likeVideo(input, ctx) {
    return request(getEndpoint("action", "video", "like"), {
        aid: input.aid,
        like: input.like ?? 1,
    }, ctx);
}
export async function coinVideo(input, ctx) {
    const params = { aid: input.aid, multiply: input.multiply ?? 1 };
    if (input.selectLike !== undefined)
        params.select_like = input.selectLike;
    return request(getEndpoint("action", "video", "coin"), params, ctx);
}
export async function favoriteVideo(input, ctx = {}) {
    const credential = await resolveCredentialForDefaultFolder(input, ctx);
    const addMediaIds = await resolveAddMediaIds(input, credential);
    return request(getEndpoint("action", "video", "favorite"), {
        rid: input.aid,
        type: 2,
        add_media_ids: joinIds(addMediaIds),
        del_media_ids: joinIds(input.delMediaIds),
    }, { ...ctx, credential });
}
export async function followUser(input, ctx) {
    return request(getEndpoint("action", "user", "follow"), {
        fid: input.mid,
        act: input.act ?? 1,
    }, ctx);
}
export function chooseDefaultFavoriteFolder(folders) {
    if (!Array.isArray(folders) || folders.length === 0)
        return null;
    return [...folders].sort(compareFavoriteFolders)[0] ?? null;
}
async function resolveCredentialForDefaultFolder(input, ctx) {
    if (input.folderId !== undefined || input.addMediaIds !== undefined || input.delMediaIds !== undefined) {
        return ctx.credential;
    }
    return ctx.credential ?? credentialManager.refreshCredentials(false);
}
async function resolveAddMediaIds(input, credential) {
    if (input.addMediaIds !== undefined)
        return input.addMediaIds;
    if (input.folderId !== undefined)
        return [input.folderId];
    if (input.delMediaIds !== undefined)
        return undefined;
    return [await getDefaultFavoriteFolderId(input.aid, credential)];
}
async function getDefaultFavoriteFolderId(aid, credential) {
    const upMid = getDedeUserId(credential);
    if (!upMid)
        throw new Error("缺少 DedeUserID Cookie，无法查询默认收藏夹。");
    const result = await request(getEndpoint("action", "video", "favorite_folders"), {
        up_mid: upMid,
        type: 2,
        rid: aid,
    }, { credential });
    const folder = chooseDefaultFavoriteFolder(extractFavoriteFolders(result));
    if (!folder?.id)
        throw new Error("未找到可用的默认收藏夹。");
    return Number(folder.id);
}
function compareFavoriteFolders(left, right) {
    return rankFavoriteFolder(left).defaultRank - rankFavoriteFolder(right).defaultRank ||
        rankFavoriteFolder(left).titleRank - rankFavoriteFolder(right).titleRank ||
        rankFavoriteFolder(left).idRank - rankFavoriteFolder(right).idRank;
}
function rankFavoriteFolder(folder) {
    const attr = Number(folder?.attr ?? 0);
    const id = Number(folder?.id);
    return {
        defaultRank: (attr & 2) === 0 ? 0 : 1,
        titleRank: folder?.title === "默认收藏夹" ? 0 : 1,
        idRank: Number.isFinite(id) ? id : Number.POSITIVE_INFINITY,
    };
}
function extractFavoriteFolders(result) {
    if (Array.isArray(result))
        return result;
    if (Array.isArray(result?.list))
        return result.list;
    if (Array.isArray(result?.data?.list))
        return result.data.list;
    return [];
}
function joinIds(ids) {
    return ids === undefined ? undefined : ids.join(",");
}
//# sourceMappingURL=action.js.map