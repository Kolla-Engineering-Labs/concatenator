/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react'
import { FileItem, TreeItem } from '../../../../core/types'

/**
 * Custom hook to construct a hierarchical tree structure from a flat list of files.
 */
export const useFileTree = (filteredFiles: FileItem[]) => {
  const fileTree = useMemo(() => {
    const root: TreeItem = {
      name: 'Root',
      path: '/',
      kind: 'directory',
      children: [],
    }

    filteredFiles.forEach((file) => {
      const parts = file.path.split('/').filter((p) => p !== '')
      let current = root

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1
        const currentPath = '/' + parts.slice(0, index + 1).join('/')

        let existing = current.children?.find((c) => c.name === part)

        if (!existing) {
          existing = {
            name: part,
            path: currentPath,
            kind: isLast ? file.kind : 'directory',
            children: isLast && file.kind === 'file' ? undefined : [],
            isIgnored: isLast ? file.isIgnored : false,
          }
          current.children?.push(existing)
        }
        current = existing
      })
    })

    const sortTree = (node: TreeItem) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.kind === 'directory' && b.kind === 'file') return -1
          if (a.kind === 'file' && b.kind === 'directory') return 1
          return a.name.localeCompare(b.name)
        })
        node.children.forEach(sortTree)
      }
    }
    sortTree(root)

    if (
      root.children &&
      root.children.length === 1 &&
      root.children[0].kind === 'directory'
    ) {
      return root.children[0]
    }

    return root
  }, [filteredFiles])

  return fileTree
}
