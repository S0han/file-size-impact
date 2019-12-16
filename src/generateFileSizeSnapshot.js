import { createLogger } from "@jsenv/logger"
import { metaMapToSpecifierMetaMap } from "@jsenv/url-meta"
import { collectFiles } from "@jsenv/file-collector"
import { resolveUrl, urlToFilePath } from "./internal/urlUtils.js"
import { writeFileContent } from "./internal/filesystemUtils.js"
import { normalizeDirectoryUrl } from "./internal/normalizeDirectoryUrl.js"

export const generateFileSizeSnapshot = async ({
  logLevel,
  projectDirectoryUrl,
  trackedFilesConfig = {
    "./**/*": true,
    "./**/*.map": false,
  },
  file = true,
  fileRelativeUrl = "./filesize-snapshot.json",
}) => {
  const logger = createLogger({ logLevel })

  projectDirectoryUrl = normalizeDirectoryUrl(projectDirectoryUrl)

  const specifierMetaMap = metaMapToSpecifierMetaMap({
    track: trackedFilesConfig,
  })

  const filesizeSnapshot = {}

  await collectFiles({
    directoryPath: urlToFilePath(projectDirectoryUrl),
    specifierMetaMap,
    predicate: (meta) => meta.track === true,
    matchingFileOperation: async ({ relativeUrl, lstat }) => {
      filesizeSnapshot[relativeUrl] = {
        type: statsToType(lstat),
        size: lstat.size,
      }
    },
  })

  if (file) {
    const fileUrl = resolveUrl(fileRelativeUrl, projectDirectoryUrl)
    logger.info(`write filesize snapshot file at ${fileUrl}`)
    await writeFileContent(fileUrl, JSON.stringify(filesizeSnapshot, null, "  "))
  }

  return filesizeSnapshot
}

const statsToType = (stats) => {
  if (stats.isFile()) return "file"
  if (stats.isDirectory()) return "directory"
  if (stats.isSymbolicLink()) return "symbolic-link"
  if (stats.isFIFO()) return "fifo"
  if (stats.isSocket()) return "socket"
  if (stats.isCharacterDevice()) return "character-device"
  if (stats.isBlockDevice()) return "block-device"
  return "unknown type"
}
