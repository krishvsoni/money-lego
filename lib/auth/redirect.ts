// Where a person may be sent after signing in: only a path on this site. An absolute URL
// ("https://evil.example"), a protocol-relative one ("//evil.example") or a backslash trick
// ("/\evil.example") would turn sign-in into an open redirect.
export function isSafeRedirectPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}
