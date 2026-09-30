import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import pkg from "../package.json" with { type: "json" };
import type { Config } from "./config.ts";
import { loadConfig } from "./config.ts";
import adminRoutes from "./routes/admin.ts";
import fhirRoutes from "./routes/fhir.ts";
import oauthRoutes from "./routes/oauth.ts";
import phicodeRoutes from "./routes/phicode.ts";

const PROJECT_INFO = {
  name: pkg.name,
  version: pkg.version,
  description: "로컬 개발용 connect-dtx API 목 서버 — OAuth 토큰 → phicode 검증 → FHIR 처방/결과",
  repository: "https://github.com/RootMyself/connect-dtx-mock-server",
  endpoints: {
    health: "GET /health",
    tokenIssue: "POST /oauth2/token",
    tokenValidate: "GET /oauth2/token?grant_type=validate",
    phicodeValidate: "GET /legacy/phicode/validate",
    phicodeHistory: "GET /pauth/phicode/history",
    dtxInfo: "POST /pauth/dtx/info",
    dtxPrescription: "GET /api/dtx/dtxprcp",
    dtxResult: "POST /api/dtx/dtxresult",
  },
} as const;

export function buildApp(configOverrides?: Partial<Config>): FastifyInstance {
  const config = { ...loadConfig(), ...configOverrides };
  const app = Fastify({ bodyLimit: 10485760 });

  app.get("/health", async () => ({ status: "UP" }));
  app.get("/", async () => PROJECT_INFO);

  app.register(oauthRoutes, { config });
  app.register(phicodeRoutes, { config });
  app.register(fhirRoutes, { config });
  app.register(adminRoutes, { config });

  return app;
}
