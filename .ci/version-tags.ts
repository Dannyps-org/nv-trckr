#!/usr/bin/env -S npx ts-node --esm

import { $ } from 'zx';

await $`git fetch --tags`;
await $`git tag -l`;