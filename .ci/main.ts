#!/usr/bin/env -S npx ts-node --esm

import { Octokit } from '@octokit/rest';
import { $, fs } from 'zx';
import { getRequiredEnvVar } from './lib.js';

const GITHUB_TOKEN = getRequiredEnvVar('GITHUB_TOKEN');
const octokit = new Octokit({ auth: GITHUB_TOKEN });
const featureBranchPrefix = 'upgrade-helm';
const chartVersionFileName = 'chart-version.txt';
const prTitle = 'Bump helm-chart version to {backboneHelmChartVersion}';
const [owner, repo] = getRequiredEnvVar('GITHUB_REPOSITORY').split('/');

await main();

function formatString(template: string, ...params: string[]): string {
  return template.replace(/{.+?}/g, (match, _) => {
    if (params.length > 0) {
      return params.shift() || '';
    } else {
      return `${match}`;
    }
  });
}

async function main(): Promise<void> {
  const chartVersionFileContent = fs.readFileSync(chartVersionFileName).toString().trim();
  const pullRequestVersion = await getVersionFromPullRequests();
  const backboneHelmChartVersion = await getVersionFromEnmeshedBackboneRepositoryHelmChart(octokit);

  if (backboneHelmChartVersion !== chartVersionFileContent && backboneHelmChartVersion !== pullRequestVersion) {
    await deleteUpgradeHelmBranches(featureBranchPrefix);

    const featureBranchName = `${featureBranchPrefix}/${backboneHelmChartVersion}`;
    await createFeatureBranch(featureBranchName, backboneHelmChartVersion);
    const prUrl = await createPr(featureBranchName);
    console.log(`PR created: ${prUrl}`);
  } else {
    console.log('nothing to do.');
  }
}

async function createPr(head: string): Promise<string> {
  
  let title = formatString(prTitle, head);
  const pr = await octokit.pulls.create({ owner, repo, head, base: 'main', title });
  return pr.data.url;
}

async function getVersionFromPullRequests(): Promise<string> {
  const pulls = await octokit.rest.pulls.list({ owner, repo, state: 'open' });
  const relevantPulls = pulls.data.filter(p => p.head.ref.startsWith(featureBranchPrefix));
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

async function deleteUpgradeHelmBranches(featureBranchPrefix: string): Promise<number> {
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
  fs.writeFileSync(chartVersionFileName, backboneHelmChartVersion);
  await $`git add ${chartVersionFileName}`;
  await $`git commit -m "Update chart version to ${backboneHelmChartVersion}"`;
  await $`git push --set-upstream origin ${featureBranchName}`;
}
