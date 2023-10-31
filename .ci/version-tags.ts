#!/usr/bin/env -S npx tsx

import { $ } from "zx";
import { getRequiredEnvVar } from "./lib.js";

await main();

async function main() {
    await $`git fetch --tags --force`;
    const existingTags = (await $`git tag -l`).stdout.split("\n").slice(0, -1);

    const inputTag = getRequiredEnvVar("GIT_TAG");
    const nextTagVersion = getNextTagVersion(existingTags, inputTag);

    await $`git tag -a ${nextTagVersion} -m "auto-tag ${nextTagVersion}"`;
    await $`git push origin ${nextTagVersion} --force`;
}

/**
 * Given a list of existing tags of the form `name-version` (e.g. `dev-2`, `stage-4`), and a tag name such as `dev`,
 * returns a new tag with the specified name and the incremented version number.
 */
function getNextTagVersion(existingTags: string[], tag: string): string {
    // Find all tags with the specified name and extract their version numbers
    const matchingTags = existingTags
        .filter((existingTag) => existingTag.startsWith(`${tag}-`))
        .map((existingTag) => parseInt(existingTag.split("-")[1]))
        .filter((versionNumber) => !isNaN(versionNumber));

    const nextVersion = matchingTags.length > 0 ? Math.max(...matchingTags) + 1 : 1;

    return `${tag}-${nextVersion}`;
}
