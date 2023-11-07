#!/usr/bin/env -S npx tsx

import { Octokit } from "@octokit/rest";
import { $, fs } from "zx";
import { getRequiredEnvVar } from "./lib";

const environments = ["dev", "stage", "prod", "bird"] as const;
type Environment = typeof environments[number];
type RefDetails = { env: Environment, hash: string, url: string, message: string, date: string, behindMainCommitCount: number; };

const [owner, repo] = getRequiredEnvVar("GITHUB_REPOSITORY").split("/");
const githubToken = getRequiredEnvVar("GITHUB_TOKEN");
const octokit = new Octokit({ auth: githubToken });
const githubPagesDir = "gh-pages";

const configFileName = `${githubPagesDir}/_config.yml`;
const configStubFileName = `${githubPagesDir}/_config.stub.yml`;

const indexFileName = `${githubPagesDir}/index.markdown`;
const indexStubFileName = `${githubPagesDir}/index.stub.markdown`;

fs.writeFile(configFileName, await fs.readFile(configStubFileName));
fs.writeFile(indexFileName, await fs.readFile(indexStubFileName));

fs.appendFile(configFileName, `\nbaseurl: /${repo}\n`);

const results = [] as Promise<RefDetails>[];
environments.forEach(env => {
    results.push(getDetailsForEnv(env));
});

let toAppend = '';
Promise.all(results).then(res => {
    res.forEach(details => {
        toAppend += `| ${details.env} | [${details.hash}](${details.url}) | ${details.message} | ${details.date} | ${details.behindMainCommitCount} |\n`;
    });
});
console.log(toAppend);
fs.appendFile(indexFileName, toAppend);

fs.appendFile(configFileName, `description: Last updated on ${new Date().toDateString()}\n`);

$`cd gh-pages && git add . && git commit -m "Update github pages"`;

async function getDetailsForEnv(env: Environment): Promise<RefDetails> {
    const ref = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `tags/${env}`,
    });

    if (ref.data.object.type === 'tag') {
        const tag = await octokit.rest.git.getTag({
            owner,
            repo,
            tag_sha: ref.data.object.sha,
        });

        return {
            env,
            hash: ref.data.object.sha,
            url: tag.data.url,
            message: tag.data.message,
            date: tag.data.tagger.date,
            behindMainCommitCount: 0
        };
    } else {
        const commit = await octokit.rest.git.getCommit({
            owner,
            repo,
            commit_sha: ref.data.object.sha,
        });

        return {
            env,
            hash: ref.data.object.sha,
            url: commit.data.url,
            message: commit.data.message,
            date: commit.data.author.date,
            behindMainCommitCount: 0
        };
    }
}
