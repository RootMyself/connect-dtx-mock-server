import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "../config.ts";
import { isRecord } from "../guards.ts";
import { findToken, getScenario } from "../tokens.ts";

interface RouteOptions {
  config: Config;
}

function bearerValid(request: FastifyRequest): boolean {
  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  if (token === "") return false;
  const found = findToken(token);
  return found !== undefined && Date.now() < found.expiresAt;
}

export default async function routes(app: FastifyInstance, opts: RouteOptions): Promise<void> {
  void opts;

  // GET /legacy/phicode/validate?code=&user_code= → result_code "0"이면 true
  app.get("/legacy/phicode/validate", async (request, reply) => {
    if (!bearerValid(request)) {
      return reply.code(401).send({ result_code: "7", error_msg: "unauthorized" });
    }
    const forced = getScenario("phicode_validate");
    if (forced !== undefined) {
      const [forcedHttp, forcedCode] = forced.split(":", 2);
      const status = Number(forcedHttp);
      return reply
        .code(Number.isInteger(status) ? status : 200)
        .send({ result_code: forcedCode ?? "1" });
    }
    const query: unknown = request.query;
    if (!isRecord(query) || typeof query["code"] !== "string" || query["code"] === "") {
      return reply.code(200).send({ result_code: "1", error_msg: "unknown code" });
    }
    return reply.code(200).send({ result_code: "0", result_msg: "success" });
  });

  // GET /pauth/phicode/history?phi_code= → {"result_code":"0","list":[{idx,phi_code}]}
  app.get("/pauth/phicode/history", async (request, reply) => {
    if (!bearerValid(request)) {
      return reply.code(401).send({ result_code: "7", error_msg: "unauthorized" });
    }
    const forced = getScenario("phicode_history");
    if (forced !== undefined) {
      const [http, code] = forced.split(":", 2);
      const status = Number(http);
      if (!Number.isInteger(status) || status !== 200) {
        return reply
          .code(Number.isInteger(status) ? status : 503)
          .send({ result_code: code ?? "1" });
      }
      if ((code ?? "0") !== "0") {
        return reply.code(200).send({ result_code: code });
      }
    }
    const historyQuery: unknown = request.query;
    const phiCode =
      isRecord(historyQuery) && typeof historyQuery["phi_code"] === "string"
        ? historyQuery["phi_code"]
        : "UNKNOWN";
    return reply.code(200).send({
      result_code: "0",
      list: [{ idx: "1", phi_code: phiCode }],
    });
  });

  // POST /pauth/dtx/info {"phi_code","state","step":"1","client_time"} → result_code "0"
  app.post("/pauth/dtx/info", async (request, reply) => {
    if (!bearerValid(request)) {
      return reply.code(401).send({ result_code: "7", error_msg: "unauthorized" });
    }
    const forced = getScenario("dtx_info");
    if (forced !== undefined) {
      const [http, code] = forced.split(":", 2);
      const status = Number(http);
      if (!Number.isInteger(status) || status !== 200) {
        return reply
          .code(Number.isInteger(status) ? status : 503)
          .send({ result_code: code ?? "1" });
      }
      return reply.code(200).send({ result_code: code ?? "0" });
    }
    const body: unknown = request.body;
    if (
      !isRecord(body) ||
      typeof body["phi_code"] !== "string" ||
      typeof body["state"] !== "string"
    ) {
      return reply.code(200).send({ result_code: "1", error_msg: "invalid params" });
    }
    return reply.code(200).send({ result_code: "0", result_msg: "success" });
  });
}
