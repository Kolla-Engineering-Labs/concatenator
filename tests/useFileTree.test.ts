import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useFileTree } from '../src/hooks/useFileTree';
import { FileItem } from '../src/types';

describe('useFileTree', () => {
  it('returns root node with empty children for empty file list', () => {
    const { result } = renderHook(() => useFileTree([]));
    
    expect(result.current.name).toBe('Root');
    expect(result.current.path).toBe('/');
    expect(result.current.kind).toBe('directory');
    expect(result.current.children).toEqual([]);
  });

  it('builds flat tree structure from single file', () => {
    const files: FileItem[] = [
      { name: 'test.txt', path: 'test.txt', kind: 'file', content: 'hello' }
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Single file stays under Root, only single directory gets promoted
    expect(result.current.name).toBe('Root');
    expect(result.current.children).toHaveLength(1);
    expect(result.current.children?.[0].name).toBe('test.txt');
    expect(result.current.children?.[0].path).toBe('/test.txt');
    expect(result.current.children?.[0].kind).toBe('file');
  });

  it('correctly nests files in directories', () => {
    const files: FileItem[] = [
      { name: 'file1.txt', path: 'src/file1.txt', kind: 'file', content: 'content1' },
      { name: 'file2.txt', path: 'src/components/file2.txt', kind: 'file', content: 'content2' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Should promote single root directory
    expect(result.current.name).toBe('src');
    expect(result.current.kind).toBe('directory');
    expect(result.current.children).toHaveLength(2);
    
    // First child should be file1.txt at root of src
    const file1 = result.current.children?.find(c => c.name === 'file1.txt');
    expect(file1).toBeDefined();
    expect(file1?.kind).toBe('file');
    expect(file1?.path).toBe('/src/file1.txt');
    
    // Second child should be components directory
    const componentsDir = result.current.children?.find(c => c.name === 'components');
    expect(componentsDir).toBeDefined();
    expect(componentsDir?.kind).toBe('directory');
    expect(componentsDir?.children).toHaveLength(1);
  });

  it('sorts directories before files at each level', () => {
    const files: FileItem[] = [
      { name: 'zfile.txt', path: 'zfile.txt', kind: 'file' },
      { name: 'adir', path: 'adir', kind: 'directory' },
      { name: 'bfile.txt', path: 'bfile.txt', kind: 'file' },
      { name: 'zdir', path: 'zdir', kind: 'directory' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    const children = result.current.children || [];
    expect(children[0].kind).toBe('directory'); // adir
    expect(children[0].name).toBe('adir');
    expect(children[1].kind).toBe('directory'); // zdir
    expect(children[1].name).toBe('zdir');
    expect(children[2].kind).toBe('file'); // bfile.txt
    expect(children[2].name).toBe('bfile.txt');
    expect(children[3].kind).toBe('file'); // zfile.txt
    expect(children[3].name).toBe('zfile.txt');
  });

  it('sorts items alphabetically within same kind', () => {
    const files: FileItem[] = [
      { name: 'zebra.txt', path: 'zebra.txt', kind: 'file' },
      { name: 'apple.txt', path: 'apple.txt', kind: 'file' },
      { name: 'mango.txt', path: 'mango.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Single file becomes root, so test with multiple
    const { result: result2 } = renderHook(() => 
      useFileTree([
        ...files,
        { name: 'testdir', path: 'testdir', kind: 'directory' }
      ])
    );
    
    const children = result2.current.children || [];
    expect(children[0].kind).toBe('directory'); // testdir
    expect(children[1].name).toBe('apple.txt');
    expect(children[2].name).toBe('mango.txt');
    expect(children[3].name).toBe('zebra.txt');
  });

  it('handles deeply nested paths correctly', () => {
    const files: FileItem[] = [
      { name: 'deep.txt', path: 'a/b/c/d/e/deep.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Should promote 'a' as root
    expect(result.current.name).toBe('a');
    expect(result.current.path).toBe('/a');
    
    // Navigate to deepest file
    let current = result.current;
    while (current.children && current.children.length > 0) {
      current = current.children[0];
    }
    
    expect(current.name).toBe('deep.txt');
    expect(current.path).toBe('/a/b/c/d/e/deep.txt');
    expect(current.kind).toBe('file');
  });

  it('handles multiple files in same directory', () => {
    const files: FileItem[] = [
      { name: 'a.txt', path: 'folder/a.txt', kind: 'file' },
      { name: 'b.txt', path: 'folder/b.txt', kind: 'file' },
      { name: 'c.txt', path: 'folder/c.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    expect(result.current.name).toBe('folder');
    expect(result.current.children).toHaveLength(3);
  });

  it('promotes single root directory to top level', () => {
    const files: FileItem[] = [
      { name: 'file1.txt', path: 'project/file1.txt', kind: 'file' },
      { name: 'file2.txt', path: 'project/file2.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Should return 'project' as root, not a synthetic root with 'project' as child
    expect(result.current.name).toBe('project');
    expect(result.current.path).toBe('/project');
  });

  it('does not promote when multiple root-level items exist', () => {
    const files: FileItem[] = [
      { name: 'file1.txt', path: 'project1/file1.txt', kind: 'file' },
      { name: 'file2.txt', path: 'project2/file2.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Should return synthetic root with both projects as children
    expect(result.current.name).toBe('Root');
    expect(result.current.path).toBe('/');
    expect(result.current.children).toHaveLength(2);
  });

  it('handles files with no directory prefix', () => {
    const files: FileItem[] = [
      { name: 'rootfile.txt', path: 'rootfile.txt', kind: 'file' },
      { name: 'another.txt', path: 'another.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Multiple root files should be under synthetic root
    expect(result.current.name).toBe('Root');
    expect(result.current.children).toHaveLength(2);
  });

  it('handles paths with leading slashes', () => {
    const files: FileItem[] = [
      { name: 'file.txt', path: '/src/file.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Leading slash should be handled, promoting 'src'
    expect(result.current.name).toBe('src');
    expect(result.current.path).toBe('/src');
  });

  it('handles empty path segments from double slashes', () => {
    const files: FileItem[] = [
      { name: 'file.txt', path: 'src//file.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    // Empty segments should be filtered out
    expect(result.current.name).toBe('src');
    const file = result.current.children?.[0];
    expect(file?.name).toBe('file.txt');
  });

  it('correctly memoizes result for same input', () => {
    const files: FileItem[] = [
      { name: 'file.txt', path: 'file.txt', kind: 'file' },
    ];
    
    const { result, rerender } = renderHook(
      ({ files }) => useFileTree(files),
      { initialProps: { files } }
    );
    
    const firstResult = result.current;
    
    // Rerender with same files array
    rerender({ files });
    
    // Should be same reference due to useMemo
    expect(result.current).toBe(firstResult);
  });

  it('updates result when input changes', () => {
    const files1: FileItem[] = [
      { name: 'file1.txt', path: 'file1.txt', kind: 'file' },
    ];
    
    const files2: FileItem[] = [
      { name: 'file2.txt', path: 'file2.txt', kind: 'file' },
    ];
    
    const { result, rerender } = renderHook(
      ({ files }) => useFileTree(files),
      { initialProps: { files: files1 } }
    );
    
    // Single files stay under Root
    expect(result.current.name).toBe('Root');
    expect(result.current.children?.[0].name).toBe('file1.txt');
    
    rerender({ files: files2 });
    
    expect(result.current.name).toBe('Root');
    expect(result.current.children?.[0].name).toBe('file2.txt');
  });

  it('handles mixed files and directories at same level', () => {
    const files: FileItem[] = [
      { name: 'readme.txt', path: 'project/readme.txt', kind: 'file' },
      { name: 'docs', path: 'project/docs', kind: 'directory' },
      { name: 'src', path: 'project/src', kind: 'directory' },
      { name: 'main.js', path: 'project/main.js', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    expect(result.current.name).toBe('project');
    const children = result.current.children || [];
    
    // Directories should come before files
    expect(children[0].kind).toBe('directory');
    expect(children[0].name).toBe('docs');
    expect(children[1].kind).toBe('directory');
    expect(children[1].name).toBe('src');
    expect(children[2].kind).toBe('file');
    expect(children[2].name).toBe('main.js');
    expect(children[3].kind).toBe('file');
    expect(children[3].name).toBe('readme.txt');
  });

  it('handles files with dots in directory names', () => {
    const files: FileItem[] = [
      { name: 'file.txt', path: 'some.dir/another.dir/file.txt', kind: 'file' },
    ];
    
    const { result } = renderHook(() => useFileTree(files));
    
    expect(result.current.name).toBe('some.dir');
    expect(result.current.children?.[0].name).toBe('another.dir');
  });
});
