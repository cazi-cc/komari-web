import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const forbidden = [
  "raw.githubusercontent.com/komari-monitor/komari-agent",
  "github.com/komari-monitor/komari-agent/releases",
  "api.github.com/repos/komari-monitor/komari-agent",
  "ghcr.io/komari-monitor/komari-agent",
];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(target);
    }
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [target] : [];
  });
}

const violations = [];
for (const file of sourceFiles(root)) {
  const content = fs.readFileSync(file, "utf8");
  for (const value of forbidden) {
    if (content.includes(value)) {
      violations.push(`${path.relative(process.cwd(), file)}: ${value}`);
    }
  }
}

const manifestSource = fs.readFileSync(
  path.join(root, "lib", "agentDistribution.ts"),
  "utf8",
);
for (const required of [
  "cazi-cc/komari-agent",
  "ghcr.io/cazi-cc/komari-agent:snapshot",
  '"--disable-web-ssh"',
  '"--interval"',
  '"--info-report-interval"',
]) {
  if (!manifestSource.includes(required)) {
    violations.push(`src/lib/agentDistribution.ts: missing ${required}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Agent distribution references are owned by the Cazi fork.");
