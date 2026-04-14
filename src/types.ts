export interface FileItem {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  content?: string | ArrayBuffer;
  size?: number;
}

export interface TreeItem {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  children?: TreeItem[];
}

export type ViewMode = 'list' | 'tree';
export type AppMode = 'concatenate' | 'deconcatenate';
export type OutputFormat = 'text' | 'pdf';
