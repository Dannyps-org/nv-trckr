#!/usr/bin/env -S npx ts-node --esm

import { Octokit } from "@octokit/rest";
import { $, fs } from "zx";
import { getRequiredEnvVar } from "./lib.js";
import { ChartVersionFile } from "./ChartVersionFile.js";

const [owner, repo] = getRequiredEnvVar("GITHUB_REPOSITORY").split("/");
const githubToken = getRequiredEnvVar("GITHUB_TOKEN");
const octokit = new Octokit({ auth: githubToken });

const featureBranchPrefix = "upgrade-helm";
const prTitle = (newVersion: string) => `Bump helm-chart version to ${newVersion}`;
const featureBranchName = (newVersion: string) => `${featureBranchPrefix}/${newVersion}'`;

await main();

async function main(): Promise<void> {
    const latestChartVersion = await getLatestChartVersion();

    if (isChartVersionFileUpToDate(latestChartVersion) || (await doesPullRequestForVersionExist(latestChartVersion))) {
        console.log("nothing to do.");
        return;
    }

    await deleteExistingBranches();
    const branchName = await createBranch(latestChartVersion);
    const prUrl = await createPr(branchName);
    console.log(`PR created: ${prUrl}`);
}

async function getLatestChartVersion(): Promise<string> {
    const tagPrefix = "helm/";

    const releases = await octokit.rest.repos.listReleases({ owner: "nmshd", repo: "backbone" });
    const latestRelease = releases.data.find((p) => p.tag_name?.startsWith(tagPrefix))!;
    return latestRelease.tag_name!.split(tagPrefix)[1];
}

function isChartVersionFileUpToDate(latestVersion: string): boolean {
    const chartVersionFileContent = ChartVersionFile.read();
    return chartVersionFileContent === latestVersion;
}

async function doesPullRequestForVersionExist(version: string): Promise<boolean> {
    const pulls = await octokit.rest.pulls.list({ owner, repo, state: "open" });
    return pulls.data.some((p) => p.head.ref == featureBranchName(version));
}

async function deleteExistingBranches(): Promise<number> {
    const branches = await octokit.repos.listBranches({ owner, repo, per_page: 100 });
    const featureBranches = branches.data.filter((b) => b.name.startsWith(featureBranchPrefix));

    for (const featureBranch of featureBranches) {
        await octokit.git.deleteRef({ owner, repo, ref: `heads/${featureBranch.name}` });
    }

    return featureBranches.length;
}

async function createBranch(chartVersion: string): Promise<string> {
    const branchName = featureBranchName(chartVersion);

    await $`git config --global user.email "actions@github.com"`;
    await $`git config --global user.name "GitHub Actions"`;
    await $`git checkout -b ${featureBranchName} main`;
    ChartVersionFile.write(chartVersion);
    await $`git add ${ChartVersionFile.name}`;
    await $`git commit -m "Update chart version to ${chartVersion}"`;
    await $`git push --set-upstream origin ${featureBranchName}`;

    return branchName;
}

async function createPr(head: string): Promise<string> {
    const title = prTitle(head);
    const pr = await octokit.pulls.create({ owner, repo, head, base: "main", title });
    return pr.data.url;
}
