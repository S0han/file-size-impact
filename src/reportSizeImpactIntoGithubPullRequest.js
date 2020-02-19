import { createLogger } from "@jsenv/logger"
import {
  assertAndNormalizeDirectoryUrl,
  resolveUrl,
  readFile,
  urlToFileSystemPath,
  catchCancellation,
  createCancellationTokenForProcess,
} from "@jsenv/util"
import { getPullRequestCommentMatching } from "./internal/getPullRequestCommentMatching.js"
import { createPullRequestComment } from "./internal/createPullRequestComment.js"
import { updatePullRequestComment } from "./internal/updatePullRequestComment.js"
import { generatePullRequestCommentString } from "./internal/generatePullRequestCommentString.js"
import { compareTwoSnapshots } from "./internal/compareTwoSnapshots.js"

const regexForMergingSizeImpact = /Overall size impact on .*?: /

export const reportSizeImpactIntoGithubPullRequest = async ({
  cancellationToken = createCancellationTokenForProcess(),
  logLevel,
  projectDirectoryUrl,
  baseSnapshotFileRelativeUrl,
  headSnapshotFileRelativeUrl,
  formatSize,
  generatedByLink,
}) => {
  return catchCancellation(async () => {
    const logger = createLogger({ logLevel })

    projectDirectoryUrl = assertAndNormalizeDirectoryUrl(projectDirectoryUrl)

    if (typeof baseSnapshotFileRelativeUrl !== "string") {
      throw new TypeError(
        `baseSnapshotFileRelativeUrl must be a string, got ${baseSnapshotFileRelativeUrl}`,
      )
    }
    if (typeof headSnapshotFileRelativeUrl !== "string") {
      throw new TypeError(
        `headSnapshotFileRelativeUrl must be a string, got ${headSnapshotFileRelativeUrl}`,
      )
    }

    const {
      repositoryOwner,
      repositoryName,
      pullRequestNumber,
      pullRequestBase,
      pullRequestHead,
      githubToken,
    } = getOptionsFromGithubAction()

    const baseSnapshotFileUrl = resolveUrl(baseSnapshotFileRelativeUrl, projectDirectoryUrl)
    const headSnapshotFileUrl = resolveUrl(headSnapshotFileRelativeUrl, projectDirectoryUrl)

    logger.debug(`
compare file snapshots
--- base snapshot file path ---
${urlToFileSystemPath(baseSnapshotFileUrl)}
--- head snapshot file path ---
${urlToFileSystemPath(headSnapshotFileUrl)}
`)
    const snapshotsPromise = Promise.all([
      readFile(baseSnapshotFileUrl),
      readFile(headSnapshotFileUrl),
    ])

    logger.debug(
      `
search for existing comment inside pull request.
--- pull request url ---
${getPullRequestHref({
  repositoryOwner,
  repositoryName,
  pullRequestNumber,
})}
`,
    )
    const existingCommentPromise = getPullRequestCommentMatching({
      repositoryOwner,
      repositoryName,
      pullRequestNumber,
      githubToken,
      regex: regexForMergingSizeImpact,
    })

    const [
      [baseSnapshotFileContent, headSnapshotFileContent],
      existingComment,
    ] = await Promise.all([snapshotsPromise, existingCommentPromise])

    cancellationToken.throwIfRequested()

    logger.debug(`
--- base snapshot file content ---
${baseSnapshotFileContent}
`)

    logger.debug(`
--- head snapshot file content ---
${headSnapshotFileContent}
`)

    const snapshotComparison = compareTwoSnapshots(
      JSON.parse(baseSnapshotFileContent),
      JSON.parse(headSnapshotFileContent),
    )

    const pullRequestCommentString = generatePullRequestCommentString({
      pullRequestBase,
      pullRequestHead,
      snapshotComparison,
      formatSize,
      generatedByLink,
    })

    if (!pullRequestCommentString) {
      logger.warn(`
aborting because the pull request comment would be empty.
May happen whem a snapshot file is empty for instance
`)
    }

    if (existingComment) {
      logger.debug(`comment found, updating it
--- comment href ---
${existingComment.html_url}`)
      const comment = await updatePullRequestComment({
        githubToken,
        repositoryOwner,
        repositoryName,
        pullRequestNumber,
        commentId: existingComment.id,
        commentBody: pullRequestCommentString,
      })
      logger.info(`comment updated at ${existingComment.html_url}`)
      return comment
    }

    logger.debug(`comment not found, creating a comment`)
    const comment = await createPullRequestComment({
      repositoryOwner,
      repositoryName,
      pullRequestNumber,
      githubToken,
      commentBody: pullRequestCommentString,
    })
    logger.info(`comment created at ${comment.html_url}`)
    return comment
  }).catch((e) => {
    // this is required to ensure unhandledRejection will still
    // set process.exitCode to 1 marking the process execution as errored
    // preventing further command to run
    process.exitCode = 1
    throw e
  })
}

// https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables
const getOptionsFromGithubAction = () => {
  const eventName = process.env.GITHUB_EVENT_NAME
  if (!eventName) {
    throw new Error(`missing process.env.GITHUB_EVENT_NAME, we are not in a github action`)
  }
  if (eventName !== "pull_request") {
    throw new Error(`getOptionsFromGithubAction must be called only in a pull request action`)
  }

  const githubRepository = process.env.GITHUB_REPOSITORY
  if (!githubRepository) {
    throw new Error(`missing process.env.GITHUB_REPOSITORY`)
  }

  const [repositoryOwner, repositoryName] = githubRepository.split("/")

  const githubRef = process.env.GITHUB_REF
  if (!githubRef) {
    throw new Error(`missing process.env.GITHUB_REF`)
  }
  const pullRequestNumber = githubRefToPullRequestNumber(githubRef)
  if (!pullRequestNumber) {
    throw new Error(`cannot get pull request number from process.env.GITHUB_REF
--- process.env.GITHUB_REF ---
${githubRef}`)
  }

  const githubBaseRef = process.env.GITHUB_BASE_REF
  if (!githubBaseRef) {
    throw new Error(`missing process.env.GITHUB_BASE_REF`)
  }
  const pullRequestBase = githubBaseRef

  const githubHeadRef = process.env.GITHUB_HEAD_REF
  if (!githubHeadRef) {
    throw new Error(`missing process.env.GITHUB_HEAD_REF`)
  }
  const pullRequestHead = githubHeadRef

  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    throw new Error(`missing process.env.GITHUB_TOKEN`)
  }

  return {
    repositoryOwner,
    repositoryName,
    pullRequestNumber,
    pullRequestBase,
    pullRequestHead,
    githubToken,
  }
}

const githubRefToPullRequestNumber = () => {
  const ref = process.env.GITHUB_REF
  const pullPrefix = "refs/pull/"
  const pullRequestNumberStartIndex = ref.indexOf(pullPrefix)
  if (pullRequestNumberStartIndex === -1) return undefined
  const afterPull = ref.slice(pullRequestNumberStartIndex + pullPrefix.length)
  const slashAfterPullIndex = afterPull.indexOf("/")
  if (slashAfterPullIndex === -1) return undefined
  const pullRequestNumberString = afterPull.slice(0, slashAfterPullIndex)
  return Number(pullRequestNumberString)
}

const getPullRequestHref = ({ repositoryOwner, repositoryName, pullRequestNumber }) =>
  `https://github.com/${repositoryOwner}/${repositoryName}/pull/${pullRequestNumber}`
