import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
export async function getSpaceVideos(input, ctx) {
    const ps = clampSpaceLimit(input.limit);
    const pn = Math.max(1, Math.floor(input.page ?? 1));
    const params = {
        mid: input.mid,
        order: input.order ?? "pubdate",
        pn,
        ps,
    };
    if (input.keyword && input.keyword.trim().length > 0) {
        params.keyword = input.keyword.trim();
    }
    const payload = await request(getEndpoint("space", "wbi", "arc_search"), params, ctx);
    const tlist = payload?.list?.tlist ?? {};
    const tlistEntries = Object.values(tlist);
    const tidToName = new Map(tlistEntries.map((entry) => [Number(entry?.tid ?? 0), String(entry?.name ?? "")]));
    const rawItems = Array.isArray(payload?.list?.vlist) ? payload.list.vlist : [];
    const items = rawItems.map((raw) => mapSpaceVideo(raw, tidToName));
    const categories = tlistEntries
        .map((entry) => ({ tid: Number(entry?.tid ?? 0), name: String(entry?.name ?? ""), count: Number(entry?.count ?? 0) }))
        .filter((entry) => entry.tid > 0);
    const page = payload?.page ?? {};
    return {
        mid: Number(input.mid),
        items,
        page: { current: Number(page.pn ?? pn), size: Number(page.ps ?? ps), total: Number(page.count ?? items.length) },
        categories,
    };
}
function clampSpaceLimit(limit) {
    const value = Math.floor(limit ?? 30);
    if (!Number.isFinite(value) || value <= 0)
        return 30;
    return Math.min(50, value);
}
function mapSpaceVideo(raw, tidToName) {
    const tid = Number(raw?.typeid ?? 0);
    const bvid = String(raw?.bvid ?? "");
    const seasonId = Number(raw?.season_id ?? 0);
    const metaRaw = raw?.meta;
    return {
        bvid,
        url: bvid ? `https://www.bilibili.com/video/${bvid}` : "",
        aid: Number(raw?.aid ?? 0),
        title: String(raw?.title ?? ""),
        cover: normalizeAbsoluteUrl(raw?.pic),
        duration_text: String(raw?.length ?? ""),
        description: String(raw?.description ?? ""),
        publish_time: Number(raw?.created ?? 0),
        stat: {
            view: Number(raw?.play ?? 0),
            danmaku: Number(raw?.video_review ?? 0),
            comment: Number(raw?.comment ?? 0),
        },
        category: { tid, name: tidToName.get(tid) ?? "" },
        is_union_video: Boolean(raw?.is_union_video),
        is_live_playback: Boolean(raw?.is_live_playback),
        season_id: seasonId > 0 ? seasonId : null,
        meta: metaRaw
            ? { id: Number(metaRaw.id ?? 0), title: String(metaRaw.title ?? ""), intro: String(metaRaw.intro ?? "") }
            : null,
    };
}
export async function getSpaceInfo(input, ctx) {
    const raw = await request(getEndpoint("space", "wbi", "acc_info"), { mid: input.mid }, ctx);
    return {
        mid: Number(raw?.mid ?? input.mid),
        name: String(raw?.name ?? ""),
        sex: String(raw?.sex ?? "保密"),
        avatar: normalizeAbsoluteUrl(raw?.face),
        banner: normalizeAbsoluteUrl(raw?.top_photo),
        sign: String(raw?.sign ?? ""),
        level: Number(raw?.level ?? 0),
        is_senior_member: Boolean(raw?.is_senior_member),
        birthday: String(raw?.birthday ?? ""),
        school: raw?.school?.name ? String(raw.school.name) : null,
        tags: mapTags(raw?.tags),
        pendant: raw?.pendant?.name ? String(raw.pendant.name) : null,
        fans_medal: mapFansMedal(raw?.fans_medal),
        official: mapOfficial(raw?.official),
        profession: mapProfession(raw?.profession),
        vip: mapVip(raw?.vip),
        live_room: mapLiveRoom(raw?.live_room),
        sys_notice: raw?.sys_notice?.content ? String(raw.sys_notice.content) : null,
        is_followed: Boolean(raw?.is_followed),
        space_url: `https://space.bilibili.com/${Number(raw?.mid ?? input.mid)}`,
    };
}
function mapOfficial(official) {
    const type = Number(official?.type ?? -1);
    return {
        verified: type === 0 || type === 1,
        type: type === 1 ? "organization" : type === 0 ? "personal" : null,
        title: official?.title ? String(official.title) : null,
        desc: official?.desc ? String(official.desc) : null,
    };
}
function mapProfession(profession) {
    if (!profession || profession.is_show !== 1)
        return null;
    return {
        name: profession.name ? String(profession.name) : null,
        department: profession.department ? String(profession.department) : null,
        title: profession.title ? String(profession.title) : null,
    };
}
function mapVip(vip) {
    return {
        active: vip?.status === 1,
        label: vip?.label?.text ? String(vip.label.text) : null,
        due_date: Number(vip?.due_date) > 0 ? Number(vip.due_date) : null,
    };
}
function mapLiveRoom(live) {
    if (!live || live.roomStatus !== 1)
        return null;
    return {
        roomid: Number(live.roomid ?? 0),
        is_live: live.liveStatus === 1,
        title: String(live.title ?? ""),
        cover: normalizeAbsoluteUrl(live.cover),
        url: String(live.url ?? ""),
    };
}
function mapTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0)
        return null;
    const filtered = tags.map((tag) => String(tag ?? "")).filter((tag) => tag.length > 0);
    return filtered.length > 0 ? filtered : null;
}
function mapFansMedal(fansMedal) {
    const medal = fansMedal?.medal;
    if (!medal?.medal_name)
        return null;
    return {
        name: String(medal.medal_name),
        level: Number(medal.level ?? 0),
        target_mid: Number(medal.target_id ?? 0) || null,
    };
}
//# sourceMappingURL=space.js.map