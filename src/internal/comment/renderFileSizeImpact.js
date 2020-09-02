import { renderEachGroup, isAdded, isDeleted, isModified } from "./helper.js"

export const renderFileSizeImpact = ({
  trackingConfig,
  transformations,
  snapshotComparison,
  formatSize,
}) => {
  return renderEachGroup(
    (groupComparison, groupName) => {
      return renderGroup(groupComparison, { groupName, transformations, formatSize })
    },
    { snapshotComparison, trackingConfig },
  )
}

const renderGroup = (groupComparison, { groupName, transformations, formatSize }) => {
  const fileByFileImpact = groupComparisonToFileByFileImpact(groupComparison)
  const impactCount = Object.keys(fileByFileImpact).length
  const noImpact = impactCount === 0
  if (noImpact) {
    return `<h5 id=${groupName}>${groupName}</h5>
<p>No impact on files in ${groupName} group.</p>`
  }

  return `<h5 id=${groupName}>${groupName}</h5>
${renderFileSizeImpactTable(fileByFileImpact, { transformations, formatSize })}`
}

const groupComparisonToFileByFileImpact = (groupComparison) => {
  const fileByFileImpact = {}
  Object.keys(groupComparison).forEach((fileRelativeUrl) => {
    const { base, afterMerge } = groupComparison[fileRelativeUrl]

    if (isAdded({ base, afterMerge })) {
      fileByFileImpact[fileRelativeUrl] = {
        base,
        afterMerge,
        event: "added",
      }
      return
    }

    if (isDeleted({ base, afterMerge })) {
      fileByFileImpact[fileRelativeUrl] = {
        base,
        afterMerge,
        event: "deleted",
      }
      return
    }

    if (isModified({ base, afterMerge })) {
      fileByFileImpact[fileRelativeUrl] = {
        base,
        afterMerge,
        event: "modified",
      }
    }
  })
  return fileByFileImpact
}

const renderFileSizeImpactTable = (fileByFileImpact, { transformations, formatSize }) => {
  return `<table>
  <thead>
    ${renderFileSizeImpactTableHeader(transformations)}
  </thead>
  <tbody>
    ${renderFileSizeImpactTableBody(fileByFileImpact, { transformations, formatSize })}
  </tbody>
  <tfoot>
    ${renderFileSizeImpactTableFooter(fileByFileImpact, { transformations, formatSize })}
  </tfoot>
</table>`
}

const renderFileSizeImpactTableHeader = (transformations) => {
  const headerCells = [
    `<th nowrap>File</th>`,
    ...Object.keys(transformations).map((sizeName) => `<th nowrap>${sizeName}</th>`),
    `<th nowrap>Event</th>`,
  ]

  return `<tr>
      ${headerCells.join(`
      `)}
    </tr>`
}

const renderFileSizeImpactTableBody = (fileByFileImpact, { transformations, formatSize }) => {
  const lines = []
  const sizeNames = Object.keys(transformations)

  const renderDiffCell = (fileImpact, sizeName) => {
    const { size, diff } = fileImpactToSizeAndDiff(fileImpact, sizeName)
    return `${formatSize(size)} (${formatSize(diff, { diff: true })})`
  }

  Object.keys(fileByFileImpact).forEach((fileRelativePath) => {
    const fileImpact = fileByFileImpact[fileRelativePath]
    const cells = [
      `<td nowrap>${fileRelativePath}</td>`,
      ...sizeNames.map((sizeName) => `<td nowrap>${renderDiffCell(fileImpact, sizeName)}</td>`),
      `<td nowrap>${fileImpact.event}</td>`,
    ].filter((cell) => cell.length > 0)
    lines.push(`
      ${cells.join(`
      `)}`)
  })

  if (lines.length === 0) return ""
  return `<tr>${lines.join(`
    </tr>
    <tr>`)}
    </tr>`
}

const renderFileSizeImpactTableFooter = (fileByFileImpact, { transformations, formatSize }) => {
  const renderTotal = (sizeName) => {
    const total = Object.keys(fileByFileImpact).reduce(
      (previous, fileRelativePath) => {
        const previousSize = previous.size
        const previousDiff = previous.diff

        const fileImpact = fileByFileImpact[fileRelativePath]
        const { size, diff } = fileImpactToSizeAndDiff(fileImpact, sizeName)
        return { size: previousSize + size, diff: previousDiff + diff }
      },
      { size: 0, diff: 0 },
    )
    return `${formatSize(total.size)} (${formatSize(total.diff, { diff: true })})`
  }

  const footerCells = [
    `<td nowrap><strong>Total</strong></td>`,
    ...Object.keys(transformations).map(
      (sizeName) => `<td nowrap>${formatSize(renderTotal(sizeName), { diff: true })}</td>`,
    ),
    `<td nowrap></td>`,
  ]

  return `<tr>
      ${footerCells.join(`
      `)}
    </tr>`
}

const fileImpactToSizeAndDiff = ({ event, base, afterMerge }, sizeName) => {
  if (event === "deleted") {
    const baseSizeMap = base.sizeMap
    if (sizeName in baseSizeMap) {
      return {
        size: 0,
        diff: -baseSizeMap[sizeName],
      }
    }
  }

  if (event === "added") {
    const afterMergeSizeMap = afterMerge.sizeMap
    if (sizeName in afterMergeSizeMap) {
      return {
        size: afterMergeSizeMap[sizeName],
        diff: afterMergeSizeMap[sizeName],
      }
    }
  }

  if (event === "modified") {
    const baseSizeMap = base.sizeMap
    const afterMergeSizeMap = afterMerge.sizeMap
    if (sizeName in baseSizeMap && sizeName in afterMergeSizeMap) {
      return {
        size: afterMergeSizeMap[sizeName],
        diff: afterMergeSizeMap[sizeName] - baseSizeMap[sizeName],
      }
    }
  }

  return { size: 0, diff: 0 }
}