#!/usr/bin/env -S npx ts-node --esm

import { Octokit } from "@octokit/rest"
import { $, fs } from "zx"
import { getRequiredEnvVar } from "./lib.js"

const GITHUB_TOKEN = getRequiredEnvVar("GITHUB_TOKEN")
const octokit = new Octokit({ auth: GITHUB_TOKEN })
const featureBranchPrefix = "upgrade-helm"
const chartVersionFileName = "chart-version.txt"
const prTitle = (newVersion: string) => `Bump helm-chart version to ${newVersion}`
const [owner, repo] = getRequiredEnvVar("GITHUB_REPOSITORY").split("/")
const featureBranchName = (branchPrefix: string, newVersion: string) => `${branchPrefix}/${newVersion}'`

await main()

async function main(): Promise<void> {
    const backboneHelmChartVersion = await getVersionFromEnmeshedBackboneRepositoryHelmChart()

    if (
        isChartVersionFileUpToDate(backboneHelmChartVersion) ||
        (await doesPullRequestForVersionExist(backboneHelmChartVersion))
    ) {
        console.log("nothing to do.")
        return
    }

    await deleteExistingBranches()
    const branchName = await createFeatureBranch(backboneHelmChartVersion)
    const prUrl = await createPr(branchName)
    console.log(`PR created: ${prUrl}`)
}

function isChartVersionFileUpToDate(version: string): boolean {
    const chartVersionFileContent = fs.readFileSync(chartVersionFileName).toString().trim()
    return chartVersionFileContent === version
}

async function doesPullRequestForVersionExist(version: string): Promise<boolean> {
    const pulls = await octokit.rest.pulls.list({ owner, repo, state: "open" })
    return pulls.data.some((p) => p.head.ref == featureBranchName(featureBranchPrefix, version))
}

async function createPr(head: string): Promise<string> {
    const title = prTitle(head)
    const pr = await octokit.pulls.create({ owner, repo, head, base: "main", title })
    return pr.data.url
}

async function getVersionFromEnmeshedBackboneRepositoryHelmChart(): Promise<string> {
    const tagPrefix = "helm/"

    const releases = await octokit.rest.repos.listReleases({ owner: "nmshd", repo: "backbone" })
    const relevantRelease = releases.data.find((p) => p.tag_name?.startsWith(tagPrefix))!
    return relevantRelease.tag_name!.split(tagPrefix)[1]
}

async function deleteExistingBranches(): Promise<number> {
    const branches = await octokit.repos.listBranches({ owner, repo, per_page: 100 })
    const featureBranches = branches.data.filter((b) => b.name.startsWith(featureBranchPrefix))

    for (const featureBranch of featureBranches) {
        await octokit.git.deleteRef({ owner, repo, ref: `heads/${featureBranch.name}` })
    }

    return featureBranches.length
}

async function createFeatureBranch(backboneHelmChartVersion: string): Promise<string> {
    const branchName = featureBranchName(featureBranchPrefix, backboneHelmChartVersion)

    await $`git config --global user.email "actions@github.com"`
    await $`git config --global user.name "GitHub Actions"`
    await $`git checkout -b ${featureBranchName} main`
    fs.writeFileSync(chartVersionFileName, backboneHelmChartVersion)
    await $`git add ${chartVersionFileName}`
    await $`git commit -m "Update chart version to ${backboneHelmChartVersion}"`
    await $`git push --set-upstream origin ${featureBranchName}`

    return branchName
}
