import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createService,
  deleteService,
  getSettings,
  getService,
  getServicesByNormalizedName,
  listServices,
  reorderServices,
  seedDatabase,
  updateSettings,
  updateService,
  updateServiceStatus,
} from "./db.js";
import { runHealthCheck } from "./health-checks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.resolve(__dirname, "..", "dist");
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const trustProxy = ["true", "1", "yes", "on"].includes(String(process.env.TRUST_PROXY ?? "false").trim().toLowerCase());

const categories = new Set(["AI", "Infrastructure", "Media", "Network", "Security"]);
const checkTypes = new Set(["HTTP", "Ping", "TCP", "None"]);
const statuses = new Set(["online", "offline", "slow", "unknown"]);
const iconNames = new Set([
  "Hearthboard", "Server", "Box", "Play", "Film", "Shield", "Globe", "Lock", "Camera", "Cpu",
  "MessageSquare", "BarChart2", "Activity", "Cloud", "ShieldCheck", "GitBranch",
  "Wifi", "Database", "Terminal", "Monitor", "HardDrive", "Layers", "Network",
  "RefreshCw",
]);

seedDatabase();

const app = Fastify({
  logger: true,
  trustProxy,
});

await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX ?? 120),
  timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
});

app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("X-Frame-Options", "DENY");
  return payload;
});

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isValidUrl(value) {
  return Boolean(parseHttpUrl(value));
}

function defaultPortForProtocol(protocol) {
  if (protocol === "https:") return 443;
  if (protocol === "http:") return 80;
  return null;
}

function isValidHost(value) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/.test(value) && !value.includes("..");
}

function isValidIp(value) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value);
}

function isValidPingTarget(value) {
  if (!value) return false;
  if (isValidUrl(value)) return true;
  return isValidIp(value) || isValidHost(value);
}

function isValidTcpTarget(value) {
  if (!value) return false;
  const url = parseHttpUrl(value);
  if (url) {
    return Boolean(url.port || defaultPortForProtocol(url.protocol));
  }
  const match = value.match(/^(.+):(\d{1,5})$/);
  if (!match) return false;
  const port = Number(match[2]);
  return port > 0 && port <= 65535 && (isValidIp(match[1]) || isValidHost(match[1]));
}

function toBool(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return fallback;
  return ["true", "1", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeNameKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeService(input, existing = {}) {
  const service = {
    id: existing.id ?? randomUUID(),
    name: String(input.name ?? existing.name ?? "").trim(),
    description: String(input.description ?? existing.description ?? "").trim(),
    category: String(input.category ?? existing.category ?? "Infrastructure"),
    url: String(input.url ?? existing.url ?? "").trim(),
    healthUrl: String(input.healthUrl ?? existing.healthUrl ?? "").trim(),
    checkType: String(input.checkType ?? existing.checkType ?? "HTTP"),
    icon: String(input.icon ?? existing.icon ?? "Server"),
    status: String(input.status ?? existing.status ?? "unknown"),
    statusCheckEnabled: Boolean(input.statusCheckEnabled ?? existing.statusCheckEnabled ?? true),
    displayOrder: input.displayOrder != null
      ? Number(input.displayOrder)
      : existing.displayOrder,
    lastCheckedAt: existing.lastCheckedAt ?? null,
    responseTimeMs: existing.responseTimeMs ?? null,
  };

  if (!service.name) throw badRequest("Service name is required");
  if (!categories.has(service.category)) throw badRequest("Invalid category");
  if (!checkTypes.has(service.checkType)) throw badRequest("Invalid check type");
  if (!statuses.has(service.status)) throw badRequest("Invalid status");

  if (service.url && !isValidUrl(service.url)) {
    throw badRequest("Service URL must be a valid URL when provided");
  }

  const checkTarget = service.healthUrl || service.url;
  if (service.checkType === "HTTP" && !isValidUrl(checkTarget)) {
    throw badRequest("HTTP checks require a full health check URL or service URL");
  }

  if (service.checkType === "Ping" && !isValidPingTarget(checkTarget)) {
    throw badRequest("Ping checks require an IP address, hostname, FQDN, or URL target");
  }

  if (service.checkType === "TCP" && !isValidTcpTarget(checkTarget)) {
    throw badRequest("TCP checks require a host:port target or URL with a port");
  }

  return service;
}

function normalizeImportedService(input, existing = {}) {
  return normalizeService({
    name: input.name,
    description: input.description ?? "",
    category: input.category,
    url: input.url ?? "",
    healthUrl: input.healthUrl ?? "",
    checkType: input.checkType,
    icon: input.icon ?? "Server",
    status: "unknown",
    statusCheckEnabled: toBool(input.statusCheckEnabled),
  }, existing);
}

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/settings", async () => getSettings());

app.patch("/api/settings", async (request) => {
  const input = request.body ?? {};
  const next = {};

  if ("dashboardName" in input) {
    next.dashboardName = String(input.dashboardName ?? "").trim().slice(0, 80);
    if (!next.dashboardName) throw badRequest("Dashboard name is required");
  }

  if ("dashboardSubtitle" in input) {
    next.dashboardSubtitle = String(input.dashboardSubtitle ?? "").trim().slice(0, 80);
  }

  if ("dashboardIcon" in input) {
    next.dashboardIcon = String(input.dashboardIcon ?? "Server");
    if (!iconNames.has(next.dashboardIcon)) throw badRequest("Invalid dashboard icon");
  }

  return updateSettings(next);
});

app.get("/api/services", async () => listServices());

app.get("/api/services/:id", async (request, reply) => {
  const service = getService(request.params.id);
  if (!service) return reply.code(404).send("Service not found");
  return service;
});

app.post("/api/services", async (request, reply) => {
  const service = createService(normalizeService(request.body ?? {}));
  return reply.code(201).send(service);
});

app.post("/api/services/import", async (request, reply) => {
  const requestedMode = String(request.body?.mode ?? "append");
  const mode = ["append", "updateByName", "skipExisting"].includes(requestedMode) ? requestedMode : "append";
  const rows = Array.isArray(request.body?.services) ? request.body.services : [];

  if (rows.length === 0) throw badRequest("Import requires at least one service");
  if (rows.length > 500) throw badRequest("Import is limited to 500 services at a time");

  const operations = [];
  const seenNames = new Set();

  if (mode !== "append") {
    for (const row of rows) {
      const nameKey = normalizeNameKey(row.name);
      if (!nameKey) continue;
      if (seenNames.has(nameKey)) {
        throw badRequest(`Import contains duplicate name "${String(row.name ?? "").trim()}"; remove duplicates before using this mode`);
      }
      seenNames.add(nameKey);
    }
  }

  for (const row of rows) {
    const matches = mode === "append" ? [] : getServicesByNormalizedName(row.name);

    if (mode === "skipExisting" && matches.length > 0) {
      operations.push({ type: "skip" });
      continue;
    }

    if (mode === "updateByName" && matches.length > 1) {
      throw badRequest(`Multiple existing services match "${String(row.name ?? "").trim()}"; rename or delete duplicates before updating by name`);
    }

    const existing = mode === "updateByName" ? matches[0] : null;
    const service = normalizeImportedService(row, existing ?? {});
    operations.push(existing
      ? { type: "update", id: existing.id, service }
      : { type: "create", service }
    );
  }

  const imported = [];
  const updated = [];
  let skipped = 0;

  for (const operation of operations) {
    if (operation.type === "skip") {
      skipped += 1;
    } else if (operation.type === "update") {
      updated.push(updateService(operation.id, operation.service));
    } else {
      imported.push(createService(operation.service));
    }
  }

  return reply.code(201).send({
    mode,
    created: imported.length,
    updated: updated.length,
    skipped,
    services: listServices(),
  });
});

app.patch("/api/services/:id", async (request, reply) => {
  const existing = getService(request.params.id);
  if (!existing) return reply.code(404).send("Service not found");
  const updated = updateService(request.params.id, normalizeService(request.body ?? {}, existing));
  return updated;
});

app.delete("/api/services/:id", async (request, reply) => {
  deleteService(request.params.id);
  return reply.code(204).send();
});

app.post("/api/services/reorder", async (request) => {
  const ids = Array.isArray(request.body?.ids) ? request.body.ids.map(id => String(id)) : [];
  const existingIds = new Set(listServices().map(service => service.id));
  const uniqueIds = new Set(ids);
  if (ids.length !== existingIds.size || uniqueIds.size !== existingIds.size || ids.some(id => !existingIds.has(id))) {
    throw badRequest("Reorder payload must include every service id exactly once");
  }
  return reorderServices(ids);
});

app.post("/api/services/:id/check", async (request, reply) => {
  const service = getService(request.params.id);
  if (!service) return reply.code(404).send("Service not found");
  const result = await runHealthCheck(service);
  return updateServiceStatus(service.id, result.status, result.responseTimeMs);
});

app.post("/api/services/check-all", async () => {
  const checked = [];
  for (const service of listServices()) {
    const result = await runHealthCheck(service);
    const updated = updateServiceStatus(service.id, result.status, result.responseTimeMs);
    if (updated) checked.push(updated);
  }
  return checked;
});

app.get("/sw.js", async (request, reply) => {
  return reply
    .header("Cache-Control", "no-store")
    .code(404)
    .send("Service worker is not used by Hearthboard");
});

await app.register(fastifyStatic, {
  root: publicPath,
  prefix: "/",
});

app.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api/")) {
    return reply.code(404).send("Route not found");
  }
  return reply
    .header("Cache-Control", "no-store")
    .sendFile("index.html");
});

await app.listen({ port, host });
