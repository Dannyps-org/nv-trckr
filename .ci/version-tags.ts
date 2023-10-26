#!/usr/bin/env -S npx ts-node --esm

import { $ } from "zx";
import { getRequiredEnvVar } from "./lib.js";

await $`git fetch --tags`;
let existingTags = (await $`git tag -l`).toString().split("\n").slice(0, -1);

let tag = "dev"; //getRequiredEnvVar("GIT_TAG");

console.log(`triggerer: ${tag}`);
console.log(`existing tags: ${existingTags}`);
console.log(`next tag: ${getNextTagVersion(existingTags, tag)}`);

/**
 * Given a list of existing tags of the form `name-version` (e.g. `dev-2`, `stage-4`), and a tag name such as `dev`,
 * returns a new tag with the specified name and the incremented version number.
 */
function getNextTagVersion(existingTags: string[], tag: string): string {
  // Find all tags with the specified name and extract their version numbers
  const matchingTags = existingTags
    .filter((existingTag) => existingTag.startsWith(tag + "-"))
    .map((existingTag) => parseInt(existingTag.split("-")[1], 10))
    .filter((versionNumber) => !isNaN(versionNumber));

  // Determine the next version number
  const nextVersion =
    matchingTags.length > 0 ? Math.max(...matchingTags) + 1 : 1;

  // Construct and return the next tag
  return `${tag}-${nextVersion}`;
}
