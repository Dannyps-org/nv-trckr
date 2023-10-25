#!/usr/bin/env -S npx ts-node --esm

import { Octokit } from '@octokit/rest';
import { $, fs } from 'zx';
import { getRequiredEnvVar } from './lib.js';

async function main(): Promise<void> {
  const GITHUB_TOKEN = getRequiredEnvVar('GITHUB_TOKEN');
  const GITHUB_REPOSITORY = getRequiredEnvVar('GITHUB_REPOSITORY');
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const featureBranchPrefix = 'upgrade-helm';

  const chartVersionFileContent = fs.readFileSync('chart-version.txt').toString().trim();
  const pullRequestVersion = await getVersionFromPullRequestsByLogin(octokit, GITHUB_REPOSITORY, 'github-actions[bot]');
  const backboneHelmChartVersion = await getVersionFromEnmeshedBackboneRepositoryHelmChart(octokit);

  if (backboneHelmChartVersion !== chartVersionFileContent && backboneHelmChartVersion !== pullRequestVersion) {
    await deleteUpgradeHelmBranches(octokit, GITHUB_REPOSITORY, featureBranchPrefix);

    const featureBranchName = `${featureBranchPrefix}/${backboneHelmChartVersion}`;
    await createFeatureBranch(featureBranchName, backboneHelmChartVersion);
    const prUrl = await createPr(octokit, GITHUB_REPOSITORY, `Bump helm-chart version to ${backboneHelmChartVersion}`, 'Created by bot', 'main', featureBranchName);
    console.log(`PR created: ${prUrl}`);
  } else {
    console.log('nothing to do.');
  }
}

async function createPr(octokit: Octokit, GITHUB_REPOSITORY: string, title: string, body: string, base: string, head: string): Promise<string> {
  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  const pr = await octokit.pulls.create({ owner, repo, head, base, title, body });
  return pr.data.url;
}

async function getVersionFromPullRequestsByLogin(octokit: Octokit, GITHUB_REPOSITORY: string, loginName: string): Promise<string> {
  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  const pulls = await octokit.rest.pulls.list({ owner, repo, state: 'open' });
  const relevantPulls = pulls.data.filter(p => p.user?.login === loginName && p.title.match('v[0-9]+.[0-9]+.[0-9]+$') != null);
  if (relevantPulls.length > 0) {
    const matches = relevantPulls[0].title.match('v[0-9]+.[0-9]+.[0-9]+$');
    return matches?.[0] ?? 'no-pr';
  } else {
    return 'no-pr';
  }
}

async function getVersionFromEnmeshedBackboneRepositoryHelmChart(octokit: Octokit): Promise<string> {
  const tagPrefix = 'helm/';

  const releases = await octokit.rest.repos.listReleases({ owner: 'nmshd', repo: 'backbone' });
  const relevantReleases = releases.data.filter(p => p.tag_name?.startsWith(tagPrefix));
  if (relevantReleases.length > 0) {
    return relevantReleases[0].tag_name?.split(tagPrefix)[1] ?? 'no-release';
  } else {
    return 'no-release';
  }
}

await main();

async function deleteUpgradeHelmBranches(octokit: Octokit, GITHUB_REPOSITORY: string, featureBranchPrefix: string): Promise<number> {
  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  const branches = await octokit.repos.listBranches({ owner, repo, per_page: 100 });
  const featureBranches = branches.data.filter(b => b.name.startsWith(featureBranchPrefix));

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  featureBranches.forEach(async branch => {
    await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch.name}` });
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
