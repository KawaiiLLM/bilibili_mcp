export function appendCookieFragment(cookieHeader, fragment) {
    return [cookieHeader, fragment].filter(Boolean).join("; ");
}
//# sourceMappingURL=cookies.js.map