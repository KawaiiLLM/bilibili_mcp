export function appendCookieFragment(
  cookieHeader: string | undefined,
  fragment: string,
): string {
  return [cookieHeader, fragment].filter(Boolean).join("; ");
}
