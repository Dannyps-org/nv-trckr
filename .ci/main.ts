#!/usr/bin/env -S npx ts-node --esm

import { Octokit } from "@octokit/rest";
import { $, fs } from "zx";
import { getRequiredEnvVar } from "./lib.js";
import { ChartVersionFile } from "./ChartVersionFile.js";

const [owner, repo] = getRequiredEnvVar("GITHUB_REPOSITORY").split("/");
const githubToken = getRequiredEnvVar("GITHUB_TOKEN");
const octokit = new Octokit({ auth: githubToken });

const branchPrefix = "upgrade-helm";
const generateBranchName = (newVersion: string) => `${branchPrefix}/${newVersion}'`;
const generatePullRequestTitle = (newVersion: string) => `Bump helm-chart version to ${newVersion}`;

await main();

async function main(): Promise<void> {
    const latestChartVersion = await getLatestChartVersion();

    if (isChartVersionFileUpToDate(latestChartVersion) || (await doesPullRequestForVersionExist(latestChartVersion))) {
        console.log("nothing to do.");
        return;
    }

    await deleteExistingBranches();
    const branchName = await createBranch(latestChartVersion);
    const pullRequestUrl = await createPullRequest(branchName);
    console.log(`PR created: ${pullRequestUrl}`);
}

async function getLatestChartVersion(): Promise<string> {
    const tagPrefix = "helm/";

    const releases = await octokit.rest.repos.listReleases({ owner: "nmshd", repo: "backbone" });
    const latestRelease = releases.data.find((p) => p.tag_name?.startsWith(tagPrefix))!;
    return latestRelease.tag_name!.split(tagPrefix)[1];
}

function isChartVersionFileUpToDate(latestVersion: string): boolean {
    const fileContent = ChartVersionFile.read();
    return fileContent === latestVersion;
}

async function doesPullRequestForVersionExist(version: string): Promise<boolean> {
    const pulls = await octokit.rest.pulls.list({ owner, repo, state: "open" });
    return pulls.data.some((p) => p.head.ref == generateBranchName(version));
}

async function deleteExistingBranches(): Promise<void> {
    const allBranches = await octokit.repos.listBranches({ owner, repo, per_page: 100 });
    const relevantBranches = allBranches.data.filter((b) => b.name.startsWith(branchPrefix));

    for (const branch of relevantBranches) {
        await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch.name}` });
    }
}

async function createBranch(chartVersion: string): Promise<string> {
    const branchName = generateBranchName(chartVersion);

    await $`git config --global user.email "actions@github.com"`;
    await $`git config --global user.name "GitHub Actions"`;
    await $`git checkout -b ${generateBranchName} main`;
    ChartVersionFile.write(chartVersion);
    await $`git add ${ChartVersionFile.name}`;
    await $`git commit -m "Update chart version to ${chartVersion}"`;
    await $`git push --set-upstream origin ${generateBranchName}`;

    return branchName;
}

async function createPullRequest(head: string): Promise<string> {
    const title = generatePullRequestTitle(head);
    const pullRequest = await octokit.pulls.create({ owner, repo, head, base: "main", title });
    return pullRequest.data.url;
}
