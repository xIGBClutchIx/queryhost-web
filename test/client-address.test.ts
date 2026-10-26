import { describe, expect, it } from "vitest";
import {
  callerAddress,
  rateLimitIdentity,
} from "../src/server/client-address.js";
import { callerFingerprint } from "../src/server/public-query.js";

function request(peer?: string, visitor?: string): Request {
  const headers = new Headers();
  if (peer !== undefined) headers.set("x-real-ip", peer);
  if (visitor !== undefined) headers.set("cf-connecting-ip", visitor);
  headers.set("x-forwarded-for", "192.0.2.100, 192.0.2.101");
  return new Request("https://query.host/api/query", { headers });
}

describe("caller addresses behind Cloudflare and Railway", () => {
  it.each(["104.16.0.1", "172.67.164.27", "2606:4700::1", "::ffff:104.16.0.1"])(
    "uses the visitor only when Railway identifies edge %s",
    (edge) => {
      expect(callerAddress(request(edge, "203.0.113.20"))).toBe("203.0.113.20");
      expect(callerAddress(request(edge, "2001:db8::20"))).toBe("2001:db8::20");
    },
  );
  it.each([
    "203.0.113.1",
    "104.15.255.255",
    "104.32.0.1",
    "2606:4701::1",
    "invalid",
  ])("ignores a spoofed visitor header from direct peer %s", (peer) => {
    expect(callerAddress(request(peer, "203.0.113.20"))).toBe(peer);
  });
  it.each([undefined, "", "invalid", "203.0.113.20, 203.0.113.21"])(
    "does not trust missing or invalid visitor data %s",
    (visitor) => {
      expect(callerAddress(request("104.16.0.1", visitor))).toBe("104.16.0.1");
    },
  );
  it("preserves direct and forwarded fallback identities", () => {
    expect(callerAddress(request("203.0.113.1", "203.0.113.2"))).toBe(
      "203.0.113.1",
    );
    expect(callerAddress(request(undefined, "203.0.113.2"))).toBe(
      "192.0.2.100",
    );
    expect(callerAddress(new Request("https://query.host"))).toBe("anonymous");
  });
  it("limits an IPv6 caller by its /64 and leaves other identities alone", () => {
    expect(rateLimitIdentity("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(rateLimitIdentity("2001:0DB8:0001:0002:ffff:0:0:9")).toBe(
      "2001:db8:1:2::/64",
    );
    expect(rateLimitIdentity("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitIdentity("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    // IPv4-mapped callers stay separate IPv4 identities in every notation.
    for (const [mapped, ipv4] of [
      ["::ffff:203.0.113.20", "203.0.113.20"],
      ["::FFFF:cb00:7114", "203.0.113.20"],
      ["::ffff:cb00:7115", "203.0.113.21"],
      ["0:0:0:0:0:ffff:cb00:7114", "203.0.113.20"],
      ["0000:0000:0000:0000:0000:ffff:203.0.113.20", "203.0.113.20"],
    ] as const) {
      expect(rateLimitIdentity(mapped), mapped).toBe(ipv4);
    }
    expect(rateLimitIdentity("203.0.113.20")).toBe("203.0.113.20");
    expect(rateLimitIdentity("anonymous")).toBe("anonymous");
    expect(callerFingerprint(request("2606:4700::1", "2001:db8:1:2::20"))).toBe(
      callerFingerprint(request("2606:4700::1", "2001:db8:1:2:ffff::99")),
    );
    expect(
      callerFingerprint(request("2606:4700::1", "2001:db8:1:3::20")),
    ).not.toBe(callerFingerprint(request("2606:4700::1", "2001:db8:1:2::20")));
  });
  it("keeps visitors separate and one visitor stable across different edges", () => {
    const first = callerFingerprint(request("104.16.0.1", "203.0.113.20"));
    expect(callerFingerprint(request("172.67.164.27", "203.0.113.20"))).toBe(
      first,
    );
    expect(callerFingerprint(request("104.16.0.1", "203.0.113.21"))).not.toBe(
      first,
    );
  });
});
