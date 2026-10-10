// This source generates both machine schema and runtime validators.
const str = { type: "string", minLength: 1, maxLength: 20000 },
  id = { type: "string", format: "uuid" },
  revision = { type: "integer", minimum: 1 };
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const component = {
  enum: ["evidence", "scope", "method", "sources", "change", "handoff"],
};
export const source = {
  type: "array",
  minItems: 1,
  maxItems: 30,
  items: object({ type: { enum: ["message", "artifact", "decision"] }, id }),
};
export const memoryPayload = object(
  {
    kind: { enum: ["preference", "project_rule", "method"] },
    scope: { enum: ["personal", "project", "work"] },
    workId: { anyOf: [id, { type: "null" }] },
    statement: str,
    sourceRefs: source,
    sensitivity: { enum: ["internal", "restricted"] },
    expiresAt: {
      anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
    },
    appliesTo: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { enum: ["skill", "document", "system"] },
    },
  },
  [
    "kind",
    "scope",
    "workId",
    "statement",
    "sourceRefs",
    "sensitivity",
    "expiresAt",
  ],
);
export const payloads = {
  "app.snapshot": object({}),
  "project.create": object({ name: { ...str, maxLength: 80 } }),
  "work.create": object({
    name: { ...str, maxLength: 150 },
    kind: { enum: ["skill", "document", "system"] },
    goal: str,
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: { ...str, maxLength: 200 },
    },
  }),
  "work.start": object(
    {
      workId: id,
      providerId: id,
      allowSend: { const: true },
      tokenLimit: { type: "integer", minimum: 2000, maximum: 2000000 },
      allowContainer: { const: true },
    },
    ["workId", "providerId", "allowSend", "tokenLimit"],
  ),
  "work.control": object({
    workId: id,
    action: { enum: ["pause", "resume", "cancel"] },
  }),
  "conversation.send": object(
    {
      workId: id,
      text: str,
      purpose: { enum: ["supplement", "memory-source"] },
    },
    ["workId", "text"],
  ),
  "material.import": object({
    workId: id,
    name: { ...str, maxLength: 150 },
    text: { ...str, maxLength: 200000 },
    origin: { ...str, maxLength: 2000 },
  }),
  "system.rework": object({
    workId: id,
    stage: {
      enum: [
        "research",
        "product",
        "design",
        "architecture",
        "test-design",
        "implementation",
        "final-review",
      ],
    },
    reason: str,
  }),
  "material.fetch": object({
    workId: id,
    url: { type: "string", format: "uri", maxLength: 2000 },
    allowFetch: { const: true },
  }),
  "skill.attach": object({ workId: id, versionId: id }),
  "provider.save": object({
    name: str,
    protocol: {
      enum: ["codex-local", "openai-completions", "anthropic-messages"],
    },
    baseUrl: { type: "string", maxLength: 2000 },
    modelId: { type: "string", maxLength: 150 },
  }),
  "provider.check": object({ providerId: id }),
  "baseline.decide": object({
    workId: id,
    fingerprint: str,
    verdict: { enum: ["approve", "request_changes"] },
    reason: str,
  }),
  "change.preview": object({
    workId: id,
    goal: str,
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: { ...str, maxLength: 200 },
    },
  }),
  "change.apply": object({
    workId: id,
    previewFingerprint: str,
    goal: str,
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: { ...str, maxLength: 200 },
    },
  }),
  "budget.reconcile": object({
    workId: id,
    acceptConservativeCharge: { const: true },
    reason: str,
  }),
  "data.backup": object({}),
  "data.restore": object({ backupId: id }),
  "memory.configureGlobal": object({ enabled: { type: "boolean" } }),
  "data.export": object({ workId: id }),
  "memory.list": object({ workId: { anyOf: [id, { type: "null" }] } }),
  "memory.propose": memoryPayload,
  "memory.confirm": object({ memoryId: id }),
  "memory.correct": object({
    memoryId: id,
    statement: str,
    sourceRefs: source,
  }),
  "memory.disable": object({ memoryId: id, disabled: { type: "boolean" } }),
  "memory.forget": object({ memoryId: id }),
  "memory.export": object({ workId: { anyOf: [id, { type: "null" }] } }),
  "memory.runRegression": object({
    memoryId: id,
    workId: id,
    providerId: id,
    allowSend: { const: true },
    cases: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: object({
        kind: { enum: ["positive", "negative"] },
        input: { ...str, maxLength: 2000 },
        expectedContains: {
          type: "array",
          maxItems: 10,
          items: { ...str, maxLength: 200 },
        },
        mustNotContain: {
          type: "array",
          maxItems: 10,
          items: { ...str, maxLength: 200 },
        },
      }),
    },
  }),
  "memory.validateMethod": object({ memoryId: id, evidenceVersionId: id }),
  "context.preview": object({ workId: id }),
  "context.configure": object({ workId: id, enabled: { type: "boolean" } }),
  "viewIntent.propose": object({
    workId: id,
    targetFingerprint: str,
    componentId: component,
    reasonRefs: { type: "array", maxItems: 30, items: id },
    memoryRevisionRefs: {
      type: "array",
      maxItems: 30,
      items: object({ id, revision }),
    },
    priority: { type: "integer", minimum: 0, maximum: 100 },
    expiresAt: { type: "string", format: "date-time" },
  }),
  "viewIntent.explain": object({ workId: id }),
  "viewIntent.pin": object({ workId: id, componentId: component }),
  "viewIntent.unpin": object({ workId: id }),
};
export const commandSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  oneOf: Object.entries(payloads).map(([method, payload]) =>
    object({
      schemaVersion: { const: 2 },
      requestId: id,
      projectId: { anyOf: [id, { type: "null" }] },
      method: { const: method },
      expectedRevision: { anyOf: [revision, { type: "null" }] },
      payload,
    }),
  ),
};
