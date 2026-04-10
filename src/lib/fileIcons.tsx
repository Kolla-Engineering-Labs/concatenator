/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Folder, 
  FileText, 
  FileCode, 
  FileJson, 
  FileImage, 
  FileArchive, 
  FileAudio, 
  FileVideo, 
  FileSpreadsheet, 
  File 
} from 'lucide-react';
import { cn } from './utils';

/**
 * Returns the appropriate Lucide icon for a given file name and kind.
 * @param fileName - The name of the file.
 * @param kind - The kind of the item ('file' or 'directory').
 * @returns A React component representing the icon.
 */
export const getFileIcon = (fileName: string, kind: 'file' | 'directory') => {
  if (kind === 'directory') return <Folder className="w-3.5 h-3.5 text-brand-500 shrink-0" />;
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconClass = "w-3.5 h-3.5 shrink-0";
  
  switch (ext) {
    case 'js':
    case 'ts':
    case 'tsx':
    case 'jsx':
    case 'html':
    case 'css':
    case 'scss':
    case 'py':
    case 'rb':
    case 'go':
    case 'rs':
    case 'c':
    case 'cpp':
    case 'java':
    case 'php':
      return <FileCode className={cn(iconClass, "text-blue-500")} />;
    case 'json':
      return <FileJson className={cn(iconClass, "text-yellow-500")} />;
    case 'md':
    case 'txt':
      return <FileText className={cn(iconClass, "text-slate-400")} />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return <FileImage className={cn(iconClass, "text-purple-500")} />;
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
    case '7z':
      return <FileArchive className={cn(iconClass, "text-orange-500")} />;
    case 'mp3':
    case 'wav':
    case 'ogg':
      return <FileAudio className={cn(iconClass, "text-pink-500")} />;
    case 'mp4':
    case 'webm':
    case 'mov':
      return <FileVideo className={cn(iconClass, "text-red-500")} />;
    case 'csv':
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className={cn(iconClass, "text-green-500")} />;
    default:
      return <File className={cn(iconClass, "text-slate-400")} />;
  }
};
