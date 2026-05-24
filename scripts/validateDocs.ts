import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const requiredDocs = [
  "docs/overview.md",
  "docs/architecture.md",
  "docs/ai-prompts.md",
  "docs/settings.md",
  "docs/storage-schema.md",
  "docs/testing.md",
  "docs/scripts.md",
  "docs/features/core-evaluation.md",
  "docs/features/weekly-digest.md",
  "docs/features/rule-gap-detector.md",
  "docs/features/multi-language.md",
  "docs/submission/devpost-writeup.md",
  "docs/submission/demo-video-script.md"
];

const missingDocs = requiredDocs.filter((path) => !existsSync(path));
if (missingDocs.length > 0) {
  fail(`Missing docs:\n${missingDocs.join("\n")}`);
}

if (!existsSync("docs/PROGRESS.md")) {
  fail("docs/PROGRESS.md is missing");
}

const docsText = requiredDocs.map((path) => readFileSync(path, "utf8")).join("\n");
const sourceFiles = walk("src").filter((path) => /\.(ts|tsx)$/u.test(path));
const undocumented = sourceFiles.filter((path) => {
  const normalized = relative("src", path);
  return !docsText.includes(normalized) && !docsText.includes(path);
});

if (undocumented.length > 0) {
  fail(`Source files missing from docs:\n${undocumented.join("\n")}`);
}

console.log(`Docs validated: ${requiredDocs.length} docs, ${sourceFiles.length} source files referenced.`);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
