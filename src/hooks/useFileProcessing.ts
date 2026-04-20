/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { FileItem, AppMode, OutputFormat } from '../types';
import { START_DELIMITER, END_DELIMITER, FILE_END_DELIMITER } from '../constants';
import { logger } from '../lib/logger';

interface UseFileProcessingProps {
  appMode: AppMode;
  compiledIgnores: (string | RegExp)[];
  maxFileLimit: number;
  isIgnoreListLoading: boolean;
}

/**
 * Custom hook to handle file processing, concatenation, and de-concatenation.
 */
export const useFileProcessing = ({ appMode, compiledIgnores, maxFileLimit, isIgnoreListLoading }: UseFileProcessingProps) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessingState] = useState(false);
  const isProcessingRef = useRef(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const cancelImportRef = useRef(false);
  const activeReaderRef = useRef<FileReader | null>(null);
  const setIsProcessing = useCallback((processing: boolean) => {
    isProcessingRef.current = processing;
    setIsProcessingState(processing);
  }, []);

  const cancelProcessing = useCallback(() => {
    cancelImportRef.current = true;
    if (activeReaderRef.current) {
      activeReaderRef.current.abort();
    }
  }, []);

  const isIgnored = useCallback((path: string) => {
    if (!path) return false;
    const normalizedPath = path.replace(/\\/g, '/');
    const segments = normalizedPath.split('/').filter(Boolean);
    const fileName = segments.length > 0 ? segments[segments.length - 1] : '';

    if (segments.length === 0) return false;

    const result = compiledIgnores.some(ignore => {
      if (ignore instanceof RegExp) {
        // Test regex against full path, filename, and each segment
        if (ignore.test(normalizedPath)) return true;
        if (ignore.test(fileName)) return true;
        return segments.some(segment => ignore.test(segment));
      }

      const ignoreStr = typeof ignore === 'string' ? ignore.replace(/\/$/, '') : ignore;

      // Check if pattern contains glob characters
      if (ignoreStr.includes('*') || ignoreStr.includes('?')) {
        // Convert glob pattern to regex
        const globToRegex = (glob: string) => {
          const escaped = glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
            .replace(/\*/g, '.*')                    // * matches any sequence
            .replace(/\?/g, '.');                    // ? matches single char
          return new RegExp(`^${escaped}$`);
        };

        const patternRegex = globToRegex(ignoreStr);

        // Match against filename for simple patterns (no / in pattern)
        if (!ignoreStr.includes('/')) {
          if (patternRegex.test(fileName)) return true;
        }

        // Also match against full path and each segment
        if (patternRegex.test(normalizedPath)) return true;
        return segments.some(segment => patternRegex.test(segment));
      }

      // For non-glob patterns, use exact matching against segments and filename
      return segments.some(segment => segment === ignoreStr) || fileName === ignoreStr;
    });

    return result;
  }, [compiledIgnores]);

  const handleDeconcatenate = useCallback(async (inputFiles?: FileItem[]) => {
    const targetFiles = inputFiles || files;
    if (targetFiles.length === 0) return;

    setIsProcessing(true);
    let foundAnyTotal = false;
    const skippedFiles: string[] = [];

    try {
      for (const fileItem of targetFiles) {
        if (fileItem.kind !== 'file' || !fileItem.content) continue;

        const zip = new JSZip();
        let foundInThisFile = false;
        const content = fileItem.content as string;

        // Track added paths to prevent duplicates in ZIP (some libraries error on duplicates)
        const addedPaths = new Set<string>();

        let searchIndex = 0;

        /**
         * De-concatenation Parser Logic
         *
         * Handles the parsing of concatenated files with fault tolerance for:
         * - Missing FILE_END_DELIMITER (LLM hallucinations, deletions, truncation)
         * - Malformed markers or nested delimiters
         *
         * Each file block follows the format:
         *   <<<<< CONCATENATOR_FILE_START: {path} >>>>>
         *   {content}
         *   <<<<< CONCATENATOR_FILE_END >>>>>
         *
         * When an end marker is missing, the file is skipped and the parser
         * resumes at the next valid START_DELIMITER to prevent delimiter bleeding.
         */
        while (true) {
          const startIndex = content.indexOf(START_DELIMITER, searchIndex);
          if (startIndex === -1) break;

          const pathStart = startIndex + START_DELIMITER.length;
          const pathEnd = content.indexOf(END_DELIMITER, pathStart);
          if (pathEnd === -1) break;

          // Look ahead to detect if next file starts before current file ends
          // This indicates a missing FILE_END_DELIMITER (e.g., LLM deleted it)
          const nextStartDelimiter = content.indexOf(START_DELIMITER, pathStart);

          const contentStartRaw = pathEnd + END_DELIMITER.length;
          let fileEndIndex = content.indexOf(FILE_END_DELIMITER, contentStartRaw);

          let path = content.substring(pathStart, pathEnd).trim();

          /**
           * Partial File Detection
           *
           * A file is considered "partial" or corrupted if:
           * 1. No FILE_END_DELIMITER found (fileEndIndex === -1), OR
           * 2. Next file's START_DELIMITER appears before current file's END_DELIMITER
           *    (indicates the end marker was deleted/hallucinated)
           *
           * Recovery Strategy:
           * - Skip the corrupted file (don't add to ZIP)
           * - Log the path for user visibility
           * - Resume parsing at the next START_DELIMITER position
           * - This prevents content from bleeding into adjacent files
           */
          if (fileEndIndex === -1 || (nextStartDelimiter !== -1 && nextStartDelimiter < fileEndIndex)) {
            skippedFiles.push(path || '(unknown path)');
            logger.warn(`Missing end marker for file "${path || '(unknown)'}" - file will be skipped`);
            // Resume at next file's start, or end of content if no more files
            searchIndex = nextStartDelimiter !== -1 ? nextStartDelimiter : content.length;
            continue;
          }

          // Comprehensive path traversal sanitization
          let sanitizedPath = path
            // Remove null bytes
            .replace(/\x00/g, '')
            // Normalize backslashes to forward slashes for security
            .replace(/\\/g, '/')
            // Remove leading slashes (absolute path prevention)
            .replace(/^\/+/, '')
            // Remove Windows drive letters (C:, D:, etc.)
            .replace(/^[a-zA-Z]:\//, '')
            // Remove UNC path prefixes (\\?\)
            .replace(/^\\?\//, '');

          // Resolve all ../ sequences throughout the path using stack-based normalization
          const parts = sanitizedPath.split('/');
          const safeParts: string[] = [];
          for (const part of parts) {
            if (part === '..') {
              // Attempt to traverse up - pop the last safe directory if possible
              // This prevents escaping the root while preserving valid relative navigation
              if (safeParts.length > 0) {
                safeParts.pop();
              }
              // If at root, ignore the .. (can't go above root)
            } else if (part === '.' || part === '') {
              // Skip current directory references and empty parts
              continue;
            } else {
              safeParts.push(part);
            }
          }
          sanitizedPath = safeParts.join('/');

          let fileContent = content.substring(contentStartRaw, fileEndIndex);
          fileContent = fileContent.replace(/^[\r\n]+|[\r\n]+$/g, '');

          if (sanitizedPath) {
            // Handle duplicate paths by appending a counter suffix (e.g., file(1).js)
            let finalPath = sanitizedPath;
            let counter = 1;
            const lastDotIndex = sanitizedPath.lastIndexOf('.');
            const hasExtension = lastDotIndex > sanitizedPath.lastIndexOf('/');
            const baseName = hasExtension ? sanitizedPath.slice(0, lastDotIndex) : sanitizedPath;
            const extension = hasExtension ? sanitizedPath.slice(lastDotIndex) : '';

            while (addedPaths.has(finalPath)) {
              finalPath = `${baseName}(${counter})${extension}`;
              counter++;
            }

            addedPaths.add(finalPath);
            zip.file(finalPath, fileContent);
            foundInThisFile = true;
            foundAnyTotal = true;
          }

          searchIndex = fileEndIndex + FILE_END_DELIMITER.length;
        }

        if (foundInThisFile) {
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          const baseName = fileItem.name.replace(/\.[^/.]+$/, "");
          a.download = `${baseName || 'extracted_files'}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          await new Promise(resolve => setTimeout(resolve, 200));
          URL.revokeObjectURL(url);
        }
      }

      if (!foundAnyTotal) {
        setImportError("No concatenated files were found in the uploaded file(s). Make sure you are uploading a file generated by this tool.");
      } else if (skippedFiles.length > 0) {
        const fileList = skippedFiles.slice(0, 3).join(', ');
        const moreCount = skippedFiles.length - 3;
        const warningMsg = moreCount > 0
          ? `Warning: ${skippedFiles.length} file(s) were skipped due to missing end markers: ${fileList} and ${moreCount} more. Check the console for details.`
          : `Warning: ${skippedFiles.length} file(s) were skipped due to missing end markers: ${fileList}. Check the console for details.`;
        logger.warn(`Skipped ${skippedFiles.length} file(s) with missing end markers:`, skippedFiles);
        setImportError(warningMsg);
      }
    } catch (error) {
      logger.error('De-concatenation failed:', error);
      setImportError("An error occurred during de-concatenation. Please check the console for details.");
    } finally {
      setIsProcessing(false);
    }
  }, [files, setIsProcessing]);

  const processUploadedFiles = useCallback(async (uploadedFiles: File[]) => {
    setIsProcessing(true);
    cancelImportRef.current = false;
    activeReaderRef.current = null;
    setImportProgress({ current: 0, total: uploadedFiles.length });

    await new Promise(resolve => setTimeout(resolve, 50));

    const newFiles: FileItem[] = [];
    let lastRenderTime = Date.now();

    for (let i = 0; i < uploadedFiles.length; i++) {
      if (cancelImportRef.current) break;

      const file = uploadedFiles[i];
      const path = (file as any).webkitRelativePath || file.name;

      const content = await new Promise<string | ArrayBuffer | null>((resolve, reject) => {
        const reader = new FileReader();
        activeReaderRef.current = reader;
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
        reader.onabort = () => resolve(null); // Resolve to null on abort for silent cleanup
        reader.readAsText(file);
      }).catch(err => {
        logger.error('Failed to read file:', err);
        return null;
      });

      activeReaderRef.current = null;

      if (content === null || cancelImportRef.current) {
        const now = Date.now();
        if (now - lastRenderTime > 50 || i === uploadedFiles.length - 1) {
          setImportProgress(prev => ({ ...prev, current: i + 1 }));
          lastRenderTime = now;
        }
        continue;
      }

      newFiles.push({
        name: file.name,
        path: path,
        kind: 'file',
        content,
        size: file.size
      });

      const parts = path.split('/');
      for (let j = 1; j < parts.length; j++) {
        const dirPath = parts.slice(0, j).join('/');
        if (!newFiles.some(f => f.path === dirPath)) {
          newFiles.push({
            name: parts[j-1],
            path: dirPath,
            kind: 'directory'
          });
        }
      }

      const now = Date.now();
      if (now - lastRenderTime > 50 || i === uploadedFiles.length - 1) {
        setImportProgress(prev => ({ ...prev, current: i + 1 }));
        lastRenderTime = now;
      }

      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (!cancelImportRef.current) {
      if (appMode === 'deconcatenate') {
        await handleDeconcatenate(newFiles);
      } else {
        setFiles(prev => {
          // Optimized Deduplication preventing Array [...spread] max call stack and Map loop limits
          const newPaths = new Set(newFiles.map(f => f.path));
          const filteredPrev = prev.filter(f => !newPaths.has(f.path));

          const uniqueNewFilesMap = new Map();
          for (const nf of newFiles) {
            uniqueNewFilesMap.set(nf.path, nf);
          }

          return filteredPrev.concat(Array.from(uniqueNewFilesMap.values()));
        });
      }
    }

    setIsProcessing(false);
    setImportProgress({ current: 0, total: 0 });
    cancelImportRef.current = false;
    activeReaderRef.current = null;
  }, [appMode, handleDeconcatenate, setIsProcessing]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessingRef.current) {
      e.preventDefault();
      return;
    }

    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    cancelImportRef.current = false;

    const filesToProcess = Array.from(uploadedFiles as FileList) as File[];

    if (filesToProcess.length > 0) {
      await processUploadedFiles(filesToProcess);
    } else {
      setImportError('No files were imported');
    }

    e.target.value = '';
  }, [processUploadedFiles]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isProcessingRef.current) return;
    if (isIgnoreListLoading) {
      setImportError('Please wait for ignore patterns to load before importing files.');
      return;
    }

    const items = e.dataTransfer.items;
    if (!items) return;

    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
      }
    }

    if (entries.length === 0) return;

    setIsProcessing(true);
    setImportError(null);
    cancelImportRef.current = false;
    setImportProgress({ current: 0, total: 0 });

    await new Promise(resolve => setTimeout(resolve, 100));

    const droppedFiles: File[] = [];

    let skippedCount = 0;
    let processedCount = 0;

    const traverseEntry = async (entry: any, path: string = '', isRoot: boolean = false) => {
      if (cancelImportRef.current) return;

      const fullPath = path + entry.name;

      // Skip directories (root or nested) that are explicitly blocked by ignore list
      if (entry.isDirectory && isIgnored(fullPath)) {
        skippedCount++;
        return;
      }

      // Skip files that are explicitly blocked by ignore list
      if (entry.isFile && isIgnored(fullPath)) {
        skippedCount++;
        return;
      }

      if (entry.isFile) {
        processedCount++;
        // Check max file limit before adding (halt immediately when exceeded)
        if (droppedFiles.length >= maxFileLimit) {
          setImportError(`Import halted: The folder contains more than ${maxFileLimit} files. Please increase the Max Files limit or select a folder with fewer files.`);
          cancelImportRef.current = true;
          return;
        }

        setImportProgress(prev => ({ ...prev, total: prev.total + 1 }));
        const file = await new Promise<File>((resolve, reject) => {
          entry.file((f: File) => resolve(f), (err: any) => reject(err));
        });
        if (cancelImportRef.current) return;

        Object.defineProperty(file, 'webkitRelativePath', {
          value: fullPath,
          writable: false,
          configurable: true
        });
        droppedFiles.push(file);
      } else if (entry.isDirectory) {
        let reader;
        try {
          reader = entry.createReader();
        } catch (err) {
          logger.error('Failed to create directory reader:', err);
          return;
        }
        const entriesBatch = await new Promise<any[]>((resolve) => {
          const allEntries: any[] = [];
          const readBatch = () => {
            if (cancelImportRef.current) {
              resolve([]);
              return;
            }
            reader.readEntries((batch: any[]) => {
              if (batch.length === 0) {
                resolve(allEntries);
              } else {
                allEntries.push(...batch);
                readBatch();
              }
            }, (_err: any) => resolve(allEntries));
          };
          readBatch();
        });

        for (const childEntry of entriesBatch) {
          if (cancelImportRef.current) break;
          await traverseEntry(childEntry, fullPath + '/', false);
        }
      }
    };

    for (const entry of entries) {
      if (cancelImportRef.current) break;
      await traverseEntry(entry, '', true);
    }

    // Check if user cancelled during traversal (Bug 2 fix)
    if (cancelImportRef.current) {
      setIsProcessing(false);
      setImportProgress({ current: 0, total: 0 });
      cancelImportRef.current = false;
      return;
    }

    if (droppedFiles.length > 0) {
      await processUploadedFiles(droppedFiles);
    } else {
      setIsProcessing(false);
      if (!cancelImportRef.current) {
        setImportError("No files were imported. This might be because all files matched your ignore list (check if any Regex is overly broad) or the folder was empty.");
      }
    }
  }, [processUploadedFiles, setIsProcessing, maxFileLimit, isIgnored, isIgnoreListLoading]);

  const handleConcatenate = useCallback(async (filteredFiles: FileItem[], outputFormat: OutputFormat = 'text') => {
    if (filteredFiles.length === 0) return;

    if (filteredFiles.length > maxFileLimit) {
      setImportError(`Warning: You are attempting to concatenate over ${maxFileLimit} files. This exceeds safe UI thread memory parameters. Please split your architecture into smaller batch folders.`);
      return;
    }

    setIsProcessing(true);
    const now = new Date();
    const timestamp = now.toLocaleString();

    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const II = String(now.getMinutes()).padStart(2, '0');
    const SS = String(now.getSeconds()).padStart(2, '0');
    const fileTimestamp = `${YYYY}${MM}${DD}_${HH}${II}${SS}`;

    const fileList = filteredFiles.filter(f => f.kind === 'file');

    if (outputFormat === 'pdf') {
      // Dynamically import jsPDF only when PDF is requested
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const contentWidth = pageWidth - 2 * margin;
      const lineHeight = 5;

      let yPosition = margin;

      // Add timestamp header
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Concatenated on: ${timestamp}`, margin, yPosition);
      yPosition += lineHeight * 2;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      fileList.forEach((file, index) => {
        // Check if we need a new page
        if (yPosition > doc.internal.pageSize.getHeight() - margin - lineHeight * 5) {
          doc.addPage();
          yPosition = margin;
        }

        // Add file header with delimiters
        doc.setFont('helvetica', 'bold');
        const headerText = `${START_DELIMITER}${file.path}${END_DELIMITER}`;
        const headerLines = doc.splitTextToSize(headerText, contentWidth);
        doc.text(headerLines, margin, yPosition);
        yPosition += headerLines.length * lineHeight;

        // Add file content
        doc.setFont('helvetica', 'normal');
        const content = typeof file.content === 'string' ? file.content : '';
        const contentLines = doc.splitTextToSize(content, contentWidth);

        // Handle page breaks for long content
        for (let i = 0; i < contentLines.length; i++) {
          if (yPosition > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(contentLines[i], margin, yPosition);
          yPosition += lineHeight;
        }

        // Add file end delimiter
        if (yPosition > doc.internal.pageSize.getHeight() - margin - lineHeight) {
          doc.addPage();
          yPosition = margin;
        }

        doc.setFont('helvetica', 'bold');
        const endText = FILE_END_DELIMITER;
        doc.text(endText, margin, yPosition);
        yPosition += lineHeight * 2; // Extra spacing between files

        // Add separator line between files (except for last file)
        if (index < fileList.length - 1) {
          if (yPosition > doc.internal.pageSize.getHeight() - margin - lineHeight * 2) {
            doc.addPage();
            yPosition = margin;
          }
          yPosition += lineHeight;
        }
      });

      // Save PDF
      doc.save(`concatenator-${fileTimestamp}.pdf`);
    } else {
      // Generate text file (default)
      let result = `Concatenated on: ${timestamp}\n\n`;

      fileList.forEach(file => {
        result += `${START_DELIMITER}${file.path}${END_DELIMITER}\n`;
        result += file.content;
        result += `\n${FILE_END_DELIMITER}\n\n`;
      });

      const blob = new Blob([result], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `concatenator-${fileTimestamp}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setIsProcessing(false);
  }, [setIsProcessing, maxFileLimit]);

  return {
    files,
    setFiles,
    isProcessing,
    importProgress,
    importError,
    setImportError,
    cancelProcessing,
    isIgnored,
    handleFileUpload,
    handleDrop,
    handleConcatenate,
    handleDeconcatenate
  };
};
