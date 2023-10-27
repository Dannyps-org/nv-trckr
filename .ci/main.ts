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
const featureBranchName = (featureBranchPrefix:string, chartVersion:string) => `${featureBranchPrefix}/${chartVersion}'`;

await main();

async function main(): Promise<void> {
  const backboneHelmChartVersion = await getVersionFromEnmeshedBackboneRepositoryHelmChart();

  if (isChartVersionFileUpToDate(backboneHelmChartVersion) || await pullRequestForVersionExists(backboneHelmChartVersion)) {
    console.log('nothing to do.');
    return;
  }

  await deleteExistingBranches();
  const branchName = featureBranchName(featureBranchPrefix, backboneHelmChartVersion);
  await createFeatureBranch(branchName, backboneHelmChartVersion);
  const prUrl = await createPr(branchName);
  console.log(`PR created: ${prUrl}`);
}

function isChartVersionFileUpToDate(version: string): boolean {
  const chartVersionFileContent = fs.readFileSync(chartVersionFileName).toString().trim();
  return chartVersionFileContent === version;
}

async function pullRequestForVersionExists(version: string): Promise<boolean> {
  const pulls = await octokit.rest.pulls.list({ owner, repo, state: 'open' });
  return pulls.data.some(p => p.head.ref == featureBranchName(featureBranchPrefix, version));
}

async function createPr(head: string): Promise<string> {
  const title = formatString(prTitle, head);
  const pr = await octokit.pulls.create({ owner, repo, head, base: 'main', title });
  return pr.data.url;
}

async function getVersionFromEnmeshedBackboneRepositoryHelmChart(): Promise<string> {
  const tagPrefix = 'helm/';

  const releases = await octokit.rest.repos.listReleases({ owner: 'nmshd', repo: 'backbone' });
  const relevantRelease = releases.data.find(p => p.tag_name?.startsWith(tagPrefix))!;
  return relevantRelease.tag_name!.split(tagPrefix)[1];
}

async function deleteExistingBranches(): Promise<number> {
  const branches = await octokit.repos.listBranches({ owner, repo, per_page: 100 });
  const featureBranches = branches.data.filter(b => b.name.startsWith(featureBranchPrefix));

  for (const featureBranch of featureBranches) {
    await octokit.git.deleteRef({ owner, repo, ref: `heads/${featureBranch.name}` });
  }

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

function formatString(template: string, ...params: string[]): string {
  return template.replace(/{.+?}/g, (match, _) => {
    if (params.length > 0) {
      return params.shift() || '';
    } else {
      return `${match}`;
    }
  });
}