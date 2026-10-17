import { describe, expect, it } from "vitest";
import { callerAddress } from "../src/server/client-address.js";
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
