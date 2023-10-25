#!/usr/bin/env -S npx ts-node --esm

import { $ } from "zx";
import { Octokit } from "@octokit/rest";
import { getRequiredEnvVar } from "./lib.js";

/**
 * Creates a PR from {@link compare} to {@link base}.
 * @returns the created PR Number
 */
async function createPr(title: string, body: string, base: string, compare: string): Promise<Number> {
    return 1;
}

async function getVersionFromPullRequestsByLogin(loginName: string): Promise<string> {
    let [owner, repo] = GITHUB_REPOSITORY.split('/');
    let pulls = await octokit.rest.pulls.list({ owner, repo, state: "open" });
    let relevantPulls = pulls.data.filter(p => p.user?.login == loginName && p.title.match("v[0-9]+.[0-9]+.[0-9]+$") != null);
    if (relevantPulls.length > 0) {
        return `v${relevantPulls[0].title.split(' v')[1]}`;
    } else {
        return 'no-pr';
    }
}

async function getVersionFromEnmeshedBackboneRepositoryHelmChart(): Promise<string> {
    let releases = await octokit.rest.repos.listReleases({ owner: "nmshd", repo: "backbone" });
    let relevantReleases = releases.data.filter(p => p.name?.startsWith("helm/"));
    if (relevantReleases.length > 0) {
        return relevantReleases[0].name?.split('helm')[1] ?? 'no-release';
    } else {
        return 'no-release';
    }
}

const GITHUB_TOKEN = getRequiredEnvVar("GITHUB_TOKEN");
const GITHUB_REPOSITORY = getRequiredEnvVar("GITHUB_REPOSITORY");
const octokit = new Octokit();

var chartVersionFileContent = await $`cat chart-version.txt`;
let pullRequestVersion = await getVersionFromPullRequestsByLogin("github-actions[bot]");
let backboneHelmChartVersion = await getVersionFromEnmeshedBackboneRepositoryHelmChart()

console.log(chartVersionFileContent, pullRequestVersion, backboneHelmChartVersion);