import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { validateClientCredentials } from "../clients.ts";
import type { Config } from "../config.ts";
import { isRecord } from "../guards.ts";
import { findToken, getScenario, issueToken } from "../tokens.ts";

interface RouteOptions {
  config: Config;
}

function bearerOf(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  return token === "" ? undefined : token;
}

export default async function routes(app: FastifyInstance, opts: RouteOptions): Promise<void> {
  const config = opts.config;

  // PhiRestComm 토큰 발급: POST /oauth2/token (Content-Type application/json, JSON 바디)
  app.post("/oauth2/token", async (request, reply) => {
    const body: unknown = request.body;
    if (!isRecord(body)) {
      return reply.code(400).send({ result_code: "400", error_msg: "invalid body" });
    }
    if (body["grant_type"] !== "client_credentials") {
      return reply.code(400).send({ result_code: "400", error_msg: "unsupported grant_type" });
    }
    const clientId = body["client_id"];
    const clientSecret = body["client_secret"];
    if (typeof clientId !== "string" || typeof clientSecret !== "string" || clientId === "") {
      return reply.code(401).send({ result_code: "7", error_msg: "invalid credentials" });
    }
    if (config.strictCredentials) {
      const client = validateClientCredentials(clientId, clientSecret);
      if (client === undefined) {
        return reply.code(401).send({ result_code: "7", error_msg: "invalid credentials" });
      }
      const token = issueToken(clientId, client.zone, config.tokenTtlMs);
      return reply.code(200).send({ access_token: token.accessToken });
    }
    // strict=false: DB 조회 생략, zone은 gov ID와 일치하면 gov
    const zone = clientId === config.govClientId ? "gov" : "normal";
    const token = issueToken(clientId, zone, config.tokenTtlMs);
    return reply.code(200).send({ access_token: token.accessToken });
  });

  // PhiRestComm 토큰 검증: GET /oauth2/token?grant_type=validate + Bearer
  app.get("/oauth2/token", async (request: FastifyRequest, reply: FastifyReply) => {
    const query: unknown = request.query;
    if (!isRecord(query) || query["grant_type"] !== "validate") {
      return reply.code(400).send({ result_code: "400", error_msg: "unsupported grant_type" });
    }
    if (getScenario("validate") === "expired") {
      return reply.code(200).send({ result_code: "7", error_msg: "token is expired" });
    }
    const bearer = bearerOf(request);
    if (bearer === undefined) {
      return reply.code(200).send({ result_code: "7", error_msg: "token is expired" });
    }
    const token = findToken(bearer);
    if (token === undefined || Date.now() >= token.expiresAt) {
      return reply.code(200).send({ result_code: "7", error_msg: "token is expired" });
    }
    return reply.code(200).send({ result_code: "0" });
  });
}
