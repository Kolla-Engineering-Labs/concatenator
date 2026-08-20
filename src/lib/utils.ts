import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return '-'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function estimateTokenCount(
  content: string | ArrayBuffer | undefined,
  size: number = 0
): number {
  if (content === undefined) return Math.ceil(size / 4)
  if (content instanceof ArrayBuffer) {
    return Math.ceil(content.byteLength / 4)
  }
  return Math.ceil(content.length / 4)
}

export function isImageFile(fileName: string): boolean {
  const imageExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.ico',
    '.bmp',
  ]
  const lowerName = fileName.toLowerCase()
  return imageExtensions.some((ext) => lowerName.endsWith(ext))
}

export function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf')
}

export function isBinaryFile(fileName: string): boolean {
  const binaryExtensions = [
    '.zip',
    '.tar',
    '.gz',
    '.rar',
    '.7z',
    '.db',
    '.sqlite',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.bin',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.pdf',
  ]
  const lowerName = fileName.toLowerCase()
  return binaryExtensions.some((ext) => lowerName.endsWith(ext))
}
