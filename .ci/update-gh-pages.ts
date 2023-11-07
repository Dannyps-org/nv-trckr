#!/usr/bin/env -S npx tsx

import { Octokit } from "@octokit/rest";
import { $, fs } from "zx";
import { getRequiredEnvVar } from "./lib";

const environments = ["dev", "stage", "prod", "bird"] as const;
type Environment = typeof environments[number];

const [_, repo] = getRequiredEnvVar("GITHUB_REPOSITORY").split("/");
const githubToken = getRequiredEnvVar("GITHUB_TOKEN");
const octokit = new Octokit({ auth: githubToken });
const githubPagesDir = "../gh-pages"

const configFileName = `${githubPagesDir}/_config.yml`;
const configStubFileName = `${githubPagesDir}/_config.stub.yml`;

const indexFileName=`${githubPagesDir}/index.markdown`;
const indexStubFileName=`${githubPagesDir}/index.stub.markdown`;

fs.writeFile(configFileName, await fs.readFile(configStubFileName));
fs.writeFile(indexFileName, await fs.readFile(indexStubFileName));

fs.appendFile(configFileName, `\nbaseurl: /${repo}\n`);

environments.forEach(env => {
    const details = getDetailsForEnv(env);
    fs.appendFile(indexFileName, `| ${details.env} | [${details.hash}](${details.url}) | ${details.message} | ${details.date} | ${details.behindMainCommitCount} |\n`);
});

fs.appendFile(configFileName, `description: Last updated on ${new Date().toDateString()}\n`)

$`git add . && git commit -m "Update github pages"`;

function getDetailsForEnv(env: Environment): { env: Environment, hash: string, url: string, message: string, date: Date, behindMainCommitCount: number; } {
    return {
        env,
        hash: "xxxxxx",
        url: "url",
        message: "message",
        date: new Date(),
        behindMainCommitCount: 0
    };
}
