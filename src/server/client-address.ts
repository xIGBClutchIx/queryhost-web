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
  const groups = ipv6Groups(plain);
  // An IPv4-mapped address is an IPv4 caller in any notation, dotted or hex.
  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff
  ) {
    const [high = 0, low = 0] = groups.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  const prefix = groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":");
  return `${prefix}::/64`;
}

/** The eight 16-bit groups of a valid IPv6 literal, expanding `::` and a dotted tail. */
function ipv6Groups(address: string): readonly number[] {
  const [head = "", tail] = address.split("::", 2);
  const parse = (part: string): number[] =>
    part === ""
      ? []
      : part.split(":").flatMap((group) => {
          if (!group.includes(".")) return [Number.parseInt(group, 16)];
          const [a = 0, b = 0, c = 0, d = 0] = group.split(".").map(Number);
          return [(a << 8) | b, (c << 8) | d];
        });
  const left = parse(head);
  if (tail === undefined) return left;
  const right = parse(tail);
  return [
    ...left,
    ...Array.from({ length: 8 - left.length - right.length }, () => 0),
    ...right,
  ];
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
