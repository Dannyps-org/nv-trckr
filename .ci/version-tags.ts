#!/usr/bin/env -S npx ts-node --esm

import { $ } from 'zx';
import { getRequiredEnvVar } from './lib';

await $`git fetch --tags`;
let existingTags = (await $`git tag -l`).toString().split("\n");

let tag = getRequiredEnvVar("GIT_TAG");
console.log(`triggerer: ${tag}`)
console.log(`existing tags: ${existingTags}`)
