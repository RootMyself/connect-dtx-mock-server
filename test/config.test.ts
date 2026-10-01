import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.ts";

describe("connect-dtx config", () => {
  it("defaults to localhost PORT with derived publicBaseUrl", () => {
    const config = loadConfig({});
    assert.equal(config.port, 8091);
    assert.equal(config.publicBaseUrl, "http://localhost:8091");
    assert.equal(config.clientId, "test-client-id");
    assert.equal(config.clientSecret, "test-client-secret");
  });

  it("honors PUBLIC_BASE_URL/CLIENT_ID/CLIENT_SECRET overrides", () => {
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:8899",
      CLIENT_ID: "test",
      CLIENT_SECRET: "test",
    });
    assert.equal(config.publicBaseUrl, "http://localhost:8899");
    assert.equal(config.clientId, "test");
    assert.equal(config.clientSecret, "test");
  });

  it("trims trailing slashes from PUBLIC_BASE_URL", () => {
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:8899///" });
    assert.equal(config.publicBaseUrl, "http://localhost:8899");
  });

  it("empty strings fall back to defaults", () => {
    const config = loadConfig({ PUBLIC_BASE_URL: "", CLIENT_ID: "", PORT: "" });
    assert.equal(config.port, 8091);
    assert.equal(config.publicBaseUrl, "http://localhost:8091");
    assert.equal(config.clientId, "test-client-id");
  });

  it("rejects non-http PUBLIC_BASE_URL and non-integer PORT", () => {
    assert.throws(() => loadConfig({ PUBLIC_BASE_URL: "not-a-url" }), /PUBLIC_BASE_URL/);
    assert.throws(() => loadConfig({ PUBLIC_BASE_URL: "ftp://host" }), /PUBLIC_BASE_URL/);
    assert.throws(() => loadConfig({ PORT: "abc" }), /PORT/);
  });
});
