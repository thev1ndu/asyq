export type AIEnvDoc = {
  key: string;
  description: string;
  where_to_get: string;
  example_value: string;
  is_secret: boolean;
};

export type AIGenerateOptions = {
  apiKey: string;
  model: string;
  projectHint?: string;
  contexts: Record<string, { file: string; line: number; snippet: string }[]>;
  keys: string[];
};

const JSON_SCHEMA = {
  name: "env_docs",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: { type: "string" },
            description: { type: "string" },
            where_to_get: { type: "string" },
            example_value: { type: "string" },
            is_secret: { type: "boolean" },
          },
          required: [
            "key",
            "description",
            "where_to_get",
            "example_value",
            "is_secret",
          ],
        },
      },
    },
    required: ["items"],
  },
} as const;

function buildInput(opts: AIGenerateOptions) {
  const lines = opts.keys.map((k) => {
    const ctx = opts.contexts[k]?.[0];
    const seenAt = ctx ? `${ctx.file}:${ctx.line}` : "unknown";
    const snippet = ctx ? ctx.snippet : "";
    return `- ${k}\n  seen_at: ${seenAt}\n  snippet: ${snippet}`;
  });

  const system = [
    "You generate documentation for environment variables.",
    "Return ONLY JSON that matches the provided JSON Schema.",
    "Do not include markdown or extra text.",
    "Never output real secrets. Use safe placeholders.",
    "Keep descriptions short and practical.",
    "where_to_get must be actionable (dashboard, secret manager, CI, local service, etc.).",
  ].join(" ");

  const user = [
    opts.projectHint ? `Project hint: ${opts.projectHint}` : "",
    "Variables:",
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function extractTextFromResponses(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim())
    return data.output_text;

  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (typeof c?.text === "string" && c.text.trim()) return c.text;
      }
    }
  }
  return "";
}

function tryParseJsonLoose(raw: string): any | null {
  // First try direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract the first {...} block
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export async function generateEnvDocsWithOpenAI(
  opts: AIGenerateOptions
): Promise<AIEnvDoc[]> {
  const input = buildInput(opts);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input,
      text: {
        format: {
          type: "json_schema",
          ...JSON_SCHEMA,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${text}`);
  }

  const data: any = await res.json();
  const raw = extractTextFromResponses(data).trim();

  const parsed = tryParseJsonLoose(raw);
  if (!parsed) {
    throw new Error(
      "AI output was not valid JSON. Try again, or use a different model."
    );
  }

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return items
    .map((x: any) => ({
      key: String(x.key ?? ""),
      description: String(x.description ?? ""),
      where_to_get: String(x.where_to_get ?? ""),
      example_value: String(x.example_value ?? ""),
      is_secret: Boolean(x.is_secret),
    }))
    .filter((x: AIEnvDoc) => x.key.length > 0);
}
