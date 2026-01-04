#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import ora from "ora";
import boxen from "boxen";
import logUpdate from "log-update";
import Table from "cli-table3";
import { scanProjectForEnvKeys } from "./scan.js";

type Step = {
  title: string;
  status: "pending" | "running" | "done" | "fail";
  detail?: string;
};

function renderHeader() {
  const title = pc.bold("autoEnv");
  const subtitle = pc.dim(
    "Generate .env.example by scanning your project for env usage"
  );
  const body = `${title}\n${subtitle}`;

  console.log(
    boxen(body, {
      padding: 1,
      borderStyle: "round",
      borderColor: "cyan",
    })
  );
  console.log("");
}

function icon(status: Step["status"]) {
  if (status === "done") return pc.green("✓");
  if (status === "fail") return pc.red("✗");
  if (status === "running") return pc.cyan("•");
  return pc.dim("•");
}

function renderSteps(steps: Step[]) {
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

function fail(message: string, hint?: string) {
  console.error(pc.red(message));
  if (hint) console.error(pc.dim(hint));
  process.exit(1);
}

const program = new Command();

program
  .name("autoEnv")
  .description("Generate .env.example by scanning your project for env usage")
  .version("2.0.1");

program
  .command("init")
  .description("Scan project and generate .env.example with KEY= lines")
  .option("--root <dir>", "Project root to scan", ".")
  .option("--out <file>", "Output file", ".env.example")
  .option("--force", "Overwrite output if it exists")
  .option(
    "--include-lowercase",
    "Include lowercase/mixed-case keys (not recommended)"
  )
  .option("--debug", "Print scan diagnostics")
  .action((opts) => {
    renderHeader();

    const root = path.resolve(process.cwd(), opts.root);
    const outFile = path.resolve(process.cwd(), opts.out);

    if (fs.existsSync(outFile) && !opts.force) {
      fail(`Output already exists: ${opts.out}`, "Use --force to overwrite.");
    }

    const steps: Step[] = [
      { title: "Preparing", status: "running", detail: `root: ${opts.root}` },
      { title: "Scanning project files", status: "pending" },
      {
        title: "Generating .env.example",
        status: "pending",
        detail: `out: ${opts.out}`,
      },
      { title: "Summary", status: "pending" },
    ];

    renderSteps(steps);

    // Step 1: prepare
    steps[0].status = "done";
    steps[0].detail = `root: ${opts.root}`;
    steps[1].status = "running";
    renderSteps(steps);

    // Spinner for scan (feels premium)
    const spinner = ora({
      text: "Scanning for environment keys",
      spinner: "dots",
    }).start();

    const res = scanProjectForEnvKeys({
      rootDir: root,
      includeLowercase: !!opts.includeLowercase,
    });

    spinner.stop();

    steps[1].status = "done";
    steps[1].detail = `${res.filesScanned} files scanned`;
    steps[2].status = "running";
    renderSteps(steps);

    if (opts.debug) {
      console.log(pc.dim(`\nDiagnostics`));
      console.log(pc.dim(`  root: ${opts.root}`));
      console.log(pc.dim(`  files scanned: ${res.filesScanned}`));
      console.log(pc.dim(`  keys found: ${res.keys.size}\n`));
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

    fs.writeFileSync(outFile, content, "utf8");

    steps[2].status = "done";
    steps[2].detail = `wrote ${opts.out}`;
    steps[3].status = "running";
    renderSteps(steps);

    // Summary table (Sentry/Next-like polish)
    const t = new Table({
      style: { head: [], border: [] },
      colWidths: [20, 60],
      wordWrap: true,
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
