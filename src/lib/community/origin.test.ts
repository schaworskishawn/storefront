import { describe, expect, it } from "vitest";
import { clientIp, sameOrigin } from "./origin";

const request = (headers: Record<string, string>) =>
	new Request("https://www.example.com/api/community/messages", { method: "POST", headers });

describe("sameOrigin", () => {
	it("lets through a request from this site", () => {
		expect(sameOrigin(request({ origin: "https://www.example.com", host: "www.example.com" }))).toBe(true);
	});
	it("uses the forwarded host behind a proxy", () => {
		expect(
			sameOrigin(
				request({
					origin: "https://www.example.com",
					host: "internal:3000",
					"x-forwarded-host": "www.example.com",
				}),
			),
		).toBe(true);
	});
	it("refuses another site's page posting here", () => {
		expect(sameOrigin(request({ origin: "https://evil.example.net", host: "www.example.com" }))).toBe(false);
	});
	it("refuses an origin that isn't an address, or when the host is unknown", () => {
		expect(sameOrigin(request({ origin: "not a url", host: "www.example.com" }))).toBe(false);
		expect(sameOrigin(request({ origin: "https://www.example.com" }))).toBe(false);
	});
	it("lets through a request with no Origin, like a script", () => {
		expect(sameOrigin(request({ host: "www.example.com" }))).toBe(true);
	});
});

describe("clientIp", () => {
	it("takes the first forwarded address", () => {
		expect(clientIp(request({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
	});
	it("falls back to the real-ip header, then to unknown", () => {
		expect(clientIp(request({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
		expect(clientIp(request({}))).toBe("unknown");
	});
});
