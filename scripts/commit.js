#!/usr/bin/env node
import { config } from "dotenv";
import { execSync } from "child_process";

config();

const msg = process.env.COMMIT_MSG;

if (!msg) {
  console.error("COMMIT_MSG not found in .env");
  process.exit(1);
}

try {
  execSync("git add .", { stdio: "inherit" });
  execSync(`git commit -m "${msg}"`, { stdio: "inherit" });
  console.log("Committed successfully");
} catch (error) {
  console.error("Commit failed");
  process.exit(1);
}
