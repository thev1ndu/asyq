#!/usr/bin/env node
import { config } from "dotenv";
import { execSync } from "child_process";

config();

try {
  const branch =
    process.env.BRANCH ||
    execSync("git rev-parse --abbrev-ref HEAD").toString().trim();

  console.log(`📤 Pushing to ${branch}...`);
  execSync(`git push origin ${branch}`, { stdio: "inherit" });
  execSync("git push origin --tags", { stdio: "inherit" });
  console.log("Pushed successfully");
} catch (error) {
  console.error("Push failed");
  process.exit(1);
}
