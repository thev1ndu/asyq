#!/usr/bin/env node

// src/autoenv.ts
import { Command } from "commander";
import fs2 from "fs";
import path2 from "path";
import pc from "picocolors";
import ora from "ora";
import boxen from "boxen";
import logUpdate from "log-update";
import Table from "cli-table3";

// src/scan.ts
import fs from "fs";
import path from "path";
var IGNORE_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".turbo",
  ".cache"
]);
var ENV_KEY_RE_STRICT = /^[A-Z][A-Z0-9_]*$/;
var ENV_KEY_RE_LOOSE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function scanProjectForEnvKeys(opts) {
  const root = opts.rootDir;
  const keyOk = (k) => (opts.includeLowercase ? ENV_KEY_RE_LOOSE : ENV_KEY_RE_STRICT).test(k);
  const exts = /* @__PURE__ */ new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".yml",
    ".yaml",
    ".toml"
  ]);
  const keys = /* @__PURE__ */ new Set();
  let filesScanned = 0;
  walk(root);
  return { keys, filesScanned };
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) walk(full);
        continue;
      }
      const isEnvFile = entry.name === ".env" || entry.name.startsWith(".env.");
      const ext = path.extname(entry.name);
      if (!isEnvFile && !exts.has(ext)) continue;
      const content = safeRead(full);
      if (!content) continue;
      filesScanned++;
      if (isEnvFile) {
        extractFromEnvFile(content, keys, keyOk);
      } else {
        extractFromCodeAndConfigs(content, keys, keyOk);
      }
    }
  }
}
function extractFromEnvFile(text, keys, keyOk) {
  for (const m of text.matchAll(
    /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm
  )) {
    const k = m[1];
    if (keyOk(k)) keys.add(k);
  }
}
function extractFromCodeAndConfigs(text, keys, keyOk) {
  for (const m of text.matchAll(
    /\bprocess(?:\?\.)?\.env(?:\?\.)?\.([A-Za-z_][A-Za-z0-9_]*)\b/g
  )) {
    const k = m[1];
    if (keyOk(k)) keys.add(k);
  }
  for (const m of text.matchAll(
    /\bprocess(?:\?\.)?\.env\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g
  )) {
    const k = m[1];
    if (keyOk(k)) keys.add(k);
  }
  for (const m of text.matchAll(
    /\bimport\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)\b/g
  )) {
    const k = m[1];
    if (keyOk(k)) keys.add(k);
  }
  for (const m of text.matchAll(
    /\bDeno\.env\.get\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\)/g
  )) {
    const k = m[1];
    if (keyOk(k)) keys.add(k);
  }
  for (const m of text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const k = m[1];
    if (keyOk(k)) keys.add(k);
  }
}
function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

// src/autoenv.ts
function renderHeader() {
  const title = pc.bold("autoEnv");
  const subtitle = pc.dim(
    "Generate .env.example by scanning your project for env usage"
  );
  const body = `${title}
${subtitle}`;
  console.log(
    boxen(body, {
      padding: 1,
      borderStyle: "round",
      borderColor: "cyan"
    })
  );
  console.log("");
}
function icon(status) {
  if (status === "done") return pc.green("\u2713");
  if (status === "fail") return pc.red("\u2717");
  if (status === "running") return pc.cyan("\u2022");
  return pc.dim("\u2022");
}
function renderSteps(steps) {
  const lines = steps.map((s) => {
    const left = `${icon(s.status)} ${s.title}`;
    const right = s.detail ? pc.dim(s.detail) : "";
    return right ? `${left} ${right}` : left;
  });
  logUpdate(lines.join("\n"));
}
function finishSteps() {
  logUpdate.done();
}
function fail(message, hint) {
  console.error(pc.red(message));
  if (hint) console.error(pc.dim(hint));
  process.exit(1);
}
var program = new Command();
program.name("autoEnv").description("Generate .env.example by scanning your project for env usage").version("2.0.1");
program.command("init").description("Scan project and generate .env.example with KEY= lines").option("--root <dir>", "Project root to scan", ".").option("--out <file>", "Output file", ".env.example").option("--force", "Overwrite output if it exists").option(
  "--include-lowercase",
  "Include lowercase/mixed-case keys (not recommended)"
).option("--debug", "Print scan diagnostics").action((opts) => {
  renderHeader();
  const root = path2.resolve(process.cwd(), opts.root);
  const outFile = path2.resolve(process.cwd(), opts.out);
  if (fs2.existsSync(outFile) && !opts.force) {
    fail(`Output already exists: ${opts.out}`, "Use --force to overwrite.");
  }
  const steps = [
    { title: "Preparing", status: "running", detail: `root: ${opts.root}` },
    { title: "Scanning project files", status: "pending" },
    {
      title: "Generating .env.example",
      status: "pending",
      detail: `out: ${opts.out}`
    },
    { title: "Summary", status: "pending" }
  ];
  renderSteps(steps);
  steps[0].status = "done";
  steps[0].detail = `root: ${opts.root}`;
  steps[1].status = "running";
  renderSteps(steps);
  const spinner = ora({
    text: "Scanning for environment keys",
    spinner: "dots"
  }).start();
  const res = scanProjectForEnvKeys({
    rootDir: root,
    includeLowercase: !!opts.includeLowercase
  });
  spinner.stop();
  steps[1].status = "done";
  steps[1].detail = `${res.filesScanned} files scanned`;
  steps[2].status = "running";
  renderSteps(steps);
  if (opts.debug) {
    console.log(pc.dim(`
Diagnostics`));
    console.log(pc.dim(`  root: ${opts.root}`));
    console.log(pc.dim(`  files scanned: ${res.filesScanned}`));
    console.log(pc.dim(`  keys found: ${res.keys.size}
`));
  }
  if (res.keys.size === 0) {
    steps[2].status = "fail";
    renderSteps(steps);
    finishSteps();
    fail(
      "No environment variables found.",
      "Ensure your code uses process.env.KEY or configs use ${KEY}. If this is a monorepo, try --root apps or --root packages."
    );
  }
  const sorted = [...res.keys].sort((a, b) => a.localeCompare(b));
  const content = sorted.map((k) => `${k}=`).join("\n") + "\n";
  fs2.writeFileSync(outFile, content, "utf8");
  steps[2].status = "done";
  steps[2].detail = `wrote ${opts.out}`;
  steps[3].status = "running";
  renderSteps(steps);
  const t = new Table({
    style: { head: [], border: [] },
    colWidths: [20, 60],
    wordWrap: true
  });
  t.push(
    [pc.dim("Output"), pc.cyan(opts.out)],
    [pc.dim("Keys"), pc.cyan(String(sorted.length))],
    [pc.dim("Scan root"), pc.cyan(opts.root)]
  );
  steps[3].status = "done";
  renderSteps(steps);
  finishSteps();
  console.log("");
  console.log(pc.bold("Done"));
  console.log(t.toString());
  console.log(pc.dim("Next steps:"));
  console.log(pc.dim(`  1) Fill values in ${opts.out}`));
  console.log(pc.dim("  2) Copy to .env (do not commit secrets)"));
  console.log("");
});
program.parse(process.argv);
//# sourceMappingURL=autoenv.js.map