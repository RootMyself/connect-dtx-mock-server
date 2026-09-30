import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Client } from "../clients.ts";
import {
  createClient,
  deleteClient,
  findClient,
  listClients,
  updateClientSecret,
} from "../clients.ts";
import type { Config } from "../config.ts";
import { isRecord } from "../guards.ts";
import { clearScenario, getScenario, listScenarios, setScenario } from "../tokens.ts";

interface RouteOptions {
  config: Config;
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isValidClientId(value: unknown): value is string {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value);
}

function isValidClientSecret(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the control-character range IS the check — secrets must not contain whitespace/control chars.
    !/[\s\x00-\x1f\x7f]/.test(value)
  );
}

function isValidZone(value: unknown): value is "normal" | "gov" {
  return value === "normal" || value === "gov";
}

interface MaskedClient {
  clientId: string;
  clientSecretMasked: string;
  zone: "normal" | "gov";
  createdAt: number;
  updatedAt: number;
}

function sendBadRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ error: "bad_request", message });
}

function paramClientId(request: FastifyRequest): unknown {
  return (request.params as { clientId?: unknown }).clientId;
}

function paramKey(request: FastifyRequest): unknown {
  return (request.params as { key?: unknown }).key;
}

const SCENARIO_KEYS: Record<string, true> = {
  validate: true,
  phicode_validate: true,
  phicode_history: true,
  dtx_info: true,
  dtxprcp: true,
  dtxresult: true,
  last_dtxresult: true,
};

export default async function routes(app: FastifyInstance, opts: RouteOptions): Promise<void> {
  void opts;

  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    void req;
    const text = body as string;
    if (text === "") {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      done(null, { __parseFailed: true });
    }
  });

  app.get("/admin/clients", async (_request, reply) => {
    return reply.code(200).send({ clients: listClients().map(toMasked) });
  });

  app.post("/admin/clients", async (request, reply) => {
    const body: unknown = request.body;
    if (!isRecord(body)) {
      return sendBadRequest(reply, "body must be a JSON object");
    }
    const clientId: unknown = body["clientId"];
    if (!isValidClientId(clientId)) {
      return sendBadRequest(reply, "clientId must match ^[A-Za-z0-9._-]{1,64}$");
    }
    const clientSecret: unknown = body["clientSecret"];
    if (!isValidClientSecret(clientSecret)) {
      return sendBadRequest(
        reply,
        "clientSecret must be 1..128 chars with no whitespace or control chars",
      );
    }
    const zone: unknown = body["zone"] ?? "normal";
    if (!isValidZone(zone)) {
      return sendBadRequest(reply, 'zone must be "normal" or "gov"');
    }
    const created = createClient(clientId, clientSecret, zone);
    if (created === undefined) {
      return reply.code(409).send({ error: "conflict", message: `client "${clientId}" exists` });
    }
    return reply.code(201).send(created);
  });

  app.get("/admin/clients/:clientId", async (request, reply) => {
    const clientId = paramClientId(request);
    if (!isValidClientId(clientId)) {
      return sendBadRequest(reply, "clientId must match ^[A-Za-z0-9._-]{1,64}$");
    }
    const found = findClient(clientId);
    if (found === undefined) {
      return reply.code(404).send({ error: "not_found", message: `client "${clientId}" missing` });
    }
    return reply.code(200).send(toMasked(found));
  });

  app.put("/admin/clients/:clientId", async (request, reply) => {
    const clientId = paramClientId(request);
    if (!isValidClientId(clientId)) {
      return sendBadRequest(reply, "clientId must match ^[A-Za-z0-9._-]{1,64}$");
    }
    const body: unknown = request.body;
    if (!isRecord(body)) {
      return sendBadRequest(reply, "body must be a JSON object");
    }
    const clientSecret: unknown = body["clientSecret"];
    if (!isValidClientSecret(clientSecret)) {
      return sendBadRequest(
        reply,
        "clientSecret must be 1..128 chars with no whitespace or control chars",
      );
    }
    const updated = updateClientSecret(clientId, clientSecret);
    if (updated === undefined) {
      return reply.code(404).send({ error: "not_found", message: `client "${clientId}" missing` });
    }
    return reply.code(200).send(toMasked(updated));
  });

  app.delete("/admin/clients/:clientId", async (request, reply) => {
    const clientId = paramClientId(request);
    if (!isValidClientId(clientId)) {
      return sendBadRequest(reply, "clientId must match ^[A-Za-z0-9._-]{1,64}$");
    }
    if (!deleteClient(clientId)) {
      return reply.code(404).send({ error: "not_found", message: `client "${clientId}" missing` });
    }
    return reply.code(204).send();
  });

  // 실패 주입: PUT {"key":"dtxprcp","value":"503:1"} → 해당 경로가 503 반환.
  // value "expired" (validate 전용) 또는 "http:result_code" 형식.
  app.get("/admin/scenarios", async (_request, reply) => {
    return reply.code(200).send({ scenarios: listScenarios() });
  });

  app.put("/admin/scenarios", async (request, reply) => {
    const body: unknown = request.body;
    if (!isRecord(body)) {
      return sendBadRequest(reply, "body must be a JSON object");
    }
    const key: unknown = body["key"];
    const value: unknown = body["value"];
    if (typeof key !== "string" || SCENARIO_KEYS[key] !== true) {
      return sendBadRequest(reply, `key must be one of ${Object.keys(SCENARIO_KEYS).join(",")}`);
    }
    if (typeof value !== "string" || value === "") {
      return sendBadRequest(reply, "value must be a non-empty string");
    }
    setScenario(key, value);
    return reply.code(200).send({ key, value: getScenario(key) });
  });

  app.delete("/admin/scenarios/:key", async (request, reply) => {
    const key = paramKey(request);
    if (typeof key !== "string" || SCENARIO_KEYS[key] !== true) {
      return sendBadRequest(reply, `key must be one of ${Object.keys(SCENARIO_KEYS).join(",")}`);
    }
    clearScenario(key);
    return reply.code(204).send();
  });
}

function toMasked(client: Client): MaskedClient {
  return {
    clientId: client.clientId,
    clientSecretMasked:
      client.clientSecret.length <= 4 ? "****" : `${client.clientSecret.slice(0, 4)}****`,
    zone: client.zone,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}
