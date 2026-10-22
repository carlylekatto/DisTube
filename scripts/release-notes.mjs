/**
 * Print the notes of a release, from the changelog.
 *
 * The changelog holds a section per version. The release of a version uses
 * that section as its body, and a short line when the version has none.
 *
 * Usage: node scripts/release-notes.mjs <version>
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];
if (!version) {
  process.stderr.write("Usage: node scripts/release-notes.mjs <version>\n");
  process.exit(1);
}

const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");

/**
 * The section of a version: the lines between its heading and the heading of
 * the next version.
 */
function sectionOf(text, wanted) {
  const lines = text.split("\n");
  const start = lines.findIndex(line => line.trim() === `## [${wanted}]`);
  if (start === -1) return null;

  const end = lines.findIndex((line, index) => index > start && /^## \[/.test(line));
  const body = lines.slice(start + 1, end === -1 ? lines.length : end);

  // The links of the changelog point at the pages of GitHub.
  return body
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\]\(\.\//g, "](https://github.com/carlylekatto/DisTube/blob/main/")
    .trim();
}

const section = sectionOf(changelog, version);
const tail = "The whole list is in the [changelog](https://github.com/carlylekatto/DisTube/blob/main/CHANGELOG.md).";

if (!section) {
  process.stdout.write(`The version ${version} has no section in the changelog.\n`);
} else {
  process.stdout.write(`${section}\n\n${tail}\n`);
}
