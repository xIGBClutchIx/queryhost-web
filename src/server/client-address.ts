import { BlockList, isIP } from "node:net";

// Cloudflare's published proxy ranges, checked 2026-10-16:
// https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
// Railway sets x-real-ip to its incoming peer. Only an authenticated-by-network
// Cloudflare peer may supply the visitor header; direct origin callers cannot.
const EDGE_RANGES = new BlockList();
for (const [network, prefix] of [
  ["173.245.48.0", 20],
  ["103.21.244.0", 22],
  ["103.22.200.0", 22],
  ["103.31.4.0", 22],
  ["141.101.64.0", 18],
  ["108.162.192.0", 18],
  ["190.93.240.0", 20],
  ["188.114.96.0", 20],
  ["197.234.240.0", 22],
  ["198.41.128.0", 17],
  ["162.158.0.0", 15],
  ["104.16.0.0", 13],
  ["104.24.0.0", 14],
  ["172.64.0.0", 13],
  ["131.0.72.0", 22],
] as const)
  EDGE_RANGES.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["2400:cb00::", 32],
  ["2606:4700::", 32],
  ["2803:f800::", 32],
  ["2405:b500::", 32],
  ["2405:8100::", 32],
  ["2a06:98c0::", 29],
  ["2c0f:f248::", 32],
] as const)
  EDGE_RANGES.addSubnet(network, prefix, "ipv6");

/**
 * The unit a caller limit applies to. An IPv6 caller usually controls a whole
 * /64, so its addresses share one identity; anything else is used as is.
 */
export function rateLimitIdentity(address: string): string {
  const plain = address.split("%", 1)[0] ?? address;
  if (isIP(plain) !== 6) return address;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(plain);
  if (mapped?.[1] !== undefined) return mapped[1];
  const [head = "", tail] = plain.toLowerCase().split("::", 2);
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  // An embedded dotted IPv4 tail fills two 16-bit groups.
  const rightGroups = right.reduce(
    (count, group) => count + (group.includes(".") ? 2 : 1),
    0,
  );
  const groups =
    tail === undefined
      ? left
      : [
          ...left,
          ...Array.from({ length: 8 - left.length - rightGroups }, () => "0"),
          ...right,
        ];
  const prefix = groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/u, ""))
    .join(":");
  return `${prefix}::/64`;
}

/** Resolves a rate-limit identity through Railway and an optional trusted Cloudflare edge. */
export function callerAddress(request: Request): string {
  const peer = request.headers.get("x-real-ip")?.trim();
  const visitor = request.headers.get("cf-connecting-ip")?.trim();
  const family = peer === undefined ? 0 : isIP(peer);
  if (
    peer !== undefined &&
    family !== 0 &&
    visitor !== undefined &&
    isIP(visitor) !== 0 &&
    EDGE_RANGES.check(peer, family === 4 ? "ipv4" : "ipv6")
  ) {
    return visitor;
  }
  return (
    peer ||
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    "anonymous"
  );
}
