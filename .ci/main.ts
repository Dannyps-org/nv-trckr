#!/usr/bin/env -S npx ts-node --esm

import { Octokit } from "@octokit/rest";
import { $ } from "zx";
import { getRequiredEnvVar } from "./lib.js";

async function main() {
    const GITHUB_TOKEN = getRequiredEnvVar("GITHUB_TOKEN");
    const GITHUB_REPOSITORY = getRequiredEnvVar("GITHUB_REPOSITORY");
    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const featureBranchPrefix = "upgrade-helm";

    var chartVersionFileContent = (await $`cat chart-version.txt`).toString().trim();
    let pullRequestVersion = await getVersionFromPullRequestsByLogin(octokit, GITHUB_REPOSITORY, "github-actions[bot]");
    let backboneHelmChartVersion = "v3.4.0";//await getVersionFromEnmeshedBackboneRepositoryHelmChart(octokit);

    if (backboneHelmChartVersion !== chartVersionFileContent && backboneHelmChartVersion !== pullRequestVersion) {
        // a new version is available and there is no PR for it, neither have we updated to it yet.

        await deleteUpgradeHelmBranches(octokit, GITHUB_REPOSITORY, featureBranchPrefix);
        let featureBranchName = `${featureBranchPrefix}/${backboneHelmChartVersion}`;
        await createFeatureBranch(featureBranchName, backboneHelmChartVersion);
        await createPr(octokit, GITHUB_REPOSITORY, `Bump helm-chart version to ${backboneHelmChartVersion}`, "Created by bot", "main", featureBranchName);
    } else {
        console.log("nothing to do.");
    }
}

/**
 * Creates a PR from {@link head} to {@link base}.
 * @returns the created PR Number
 */
async function createPr(
    octokit: Octokit,
    GITHUB_REPOSITORY: string,
    title: string,
    body: string,
    base: string,
    head: string
): Promise<Number> {
    let [owner, repo] = GITHUB_REPOSITORY.split('/');
    var pr = await octokit.pulls.create({ owner, repo, head, base, title, body });
    return pr.data.id;
}

/**
 * 
 * @param octokit the octokit instance to use
 * @param GITHUB_REPOSITORY the owner/repo string of the current repo
 * @param loginName the loginName of the author of the PRs to be considered 
 * @returns the PR version
 */
async function getVersionFromPullRequestsByLogin(octokit: Octokit, GITHUB_REPOSITORY: string, loginName: string): Promise<string> {
    let [owner, repo] = GITHUB_REPOSITORY.split('/');
    let pulls = await octokit.rest.pulls.list({ owner, repo, state: "open" });
    let relevantPulls = pulls.data.filter(p => p.user?.login == loginName && p.title.match("v[0-9]+.[0-9]+.[0-9]+$") != null);
    if (relevantPulls.length > 0) {
        let matches = relevantPulls[0].title.match("v[0-9]+.[0-9]+.[0-9]+$");
        return matches?.[0] ?? 'no-pr';
    } else {
        return 'no-pr';
    }
}

/**
 * 
 * @param octokit the octokit instance to use
 * @returns the helm chart version
 */
async function getVersionFromEnmeshedBackboneRepositoryHelmChart(octokit: Octokit): Promise<string> {
    const tagPrefix = "helm/";

    let releases = await octokit.rest.repos.listReleases({ owner: "nmshd", repo: "backbone" });
    let relevantReleases = releases.data.filter(p => p.tag_name?.startsWith(tagPrefix));
    if (relevantReleases.length > 0) {
        return relevantReleases[0].tag_name?.split(tagPrefix)[1] ?? 'no-release';
    } else {
        return 'no-release';
    }
}

await main();

/**
 * also deletes related PRs
 * @returns the number of deleted entities
 */
async function deleteUpgradeHelmBranches(octokit: Octokit, GITHUB_REPOSITORY: string, featureBranchPrefix: string): Promise<number> {
    let [owner, repo] = GITHUB_REPOSITORY.split('/');
    let branches = await octokit.repos.listBranches({ owner, repo, per_page: 100 });
    let featureBranches = branches.data.filter(b => b.name.startsWith(featureBranchPrefix));
    featureBranches.forEach(async branch => {
        await octokit.git.deleteRef({owner, repo, ref:`heads/${branch.name}`})
    });
    return featureBranches.length;
}

async function createFeatureBranch(featureBranchName: string, backboneHelmChartVersion: string): Promise<void> {
    await $`git config --global user.email "actions@github.com"`;
    await $`git config --global user.name "GitHub Actions"`;
    await $`git checkout -b ${featureBranchName} main`;
    await $`echo ${backboneHelmChartVersion} > chart-version.txt`;
    await $`git add chart-version.txt`;
    await $`git commit -m "Update chart version to ${backboneHelmChartVersion}"`;
    await $`git push --set-upstream origin ${featureBranchName}`;
}

