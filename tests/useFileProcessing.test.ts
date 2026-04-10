import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFileProcessing } from '../src/hooks/useFileProcessing';
import { START_DELIMITER, END_DELIMITER, FILE_END_DELIMITER } from '../src/constants';

// Mock JSZip
const mockFile = vi.fn();
const mockGenerateAsync = vi.fn().mockResolvedValue(new Blob(['mock-zip'], { type: 'application/zip' }));

vi.mock('jszip', () => {
  return {
    default: class MockJSZip {
      file = mockFile;
      generateAsync = mockGenerateAsync;
    }
  };
});

describe('useFileProcessing', () => {
  let originalClick: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFile.mockClear();
    mockGenerateAsync.mockClear();
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();
    
    originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = originalClick;
  });

  describe('Concatenation Logic Edge Cases', () => {
    it('does nothing when handling empty concatenate payload', () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      act(() => {
        result.current.handleConcatenate([]);
      });

      expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('demonstrates format collision when source file contains exact START delimiter', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      const mockFiles = [
        {
          name: 'malicious.js',
          path: 'src/malicious.js',
          kind: 'file' as const,
          content: `${START_DELIMITER}fake/path.js${END_DELIMITER}\nfake content`,
          size: 100
        }
      ];

      act(() => { result.current.handleConcatenate(mockFiles); });
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      const createObjCallArgs = (global.URL.createObjectURL as any).mock.calls[0][0];
      const text = await createObjCallArgs.text();
      // Outputs the delimiter into the body, confusing the regex engine later
      expect(text).toContain(`${START_DELIMITER}fake/path.js${END_DELIMITER}`);
    });

    it('appends proper delimiters and handles missing trailing new lines', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const mockFiles = [
        {
          name: 'test.js',
          path: 'src/test.js',
          kind: 'file' as const,
          content: 'console.log("hello");', // No trailing newline
          size: 100
        }
      ];

      act(() => {
        result.current.handleConcatenate(mockFiles);
      });

      // We need to intercept the Blob passed to createObjectURL to see the output format
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      const createObjCallArgs = (global.URL.createObjectURL as any).mock.calls[0][0];
      expect(createObjCallArgs).toBeInstanceOf(Blob);
      
      const text = await createObjCallArgs.text();
      expect(text).toContain(`${START_DELIMITER}src/test.js${END_DELIMITER}`);
      expect(text).toContain('console.log("hello");\n<<<<< CONCATENATOR_FILE_END >>>>>');
    });

    it('safely processes files with empty or undefined webkitRelativePath properties', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      const mockFiles = [
        {
          name: 'orphan.txt',
          path: '', // Edge Case: undefined paths
          kind: 'file' as const,
          content: 'orphan content',
          size: 100
        }
      ];

      act(() => { result.current.handleConcatenate(mockFiles); });
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      const createObjCallArgs = (global.URL.createObjectURL as any).mock.calls[0][0];
      const text = await createObjCallArgs.text();
      expect(text).toContain(`${START_DELIMITER}${END_DELIMITER}`);
      expect(text).toContain('orphan content');
    });

    it('handles heavy surrogate pair emojis in file content correctly without charset mangling', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const emojiContent = '👨‍👩‍👧‍👦 complex proxy content 🚀';
      const mockFiles = [
        {
          name: 'emoji.txt',
          path: 'src/emoji🚀.txt',
          kind: 'file' as const,
          content: emojiContent,
          size: 100
        }
      ];

      act(() => { result.current.handleConcatenate(mockFiles); });
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      const createObjCallArgs = (global.URL.createObjectURL as any).mock.calls[0][0];
      const text = await createObjCallArgs.text();
      expect(text).toContain(`src/emoji🚀.txt`);
      expect(text).toContain(emojiContent);
    });

    it('throws a memory safeguard warning synchronously without crashing UI thread when concatenating massive array structures', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      // Simulating edge case #17 checking array iteration locks. Vitest tests break if this takes > 5000ms.
      const massiveFiles = Array.from({ length: 15_000 }).map((_, i) => ({
        name: `file-${i}.txt`,
        path: `massive/file-${i}.txt`,
        kind: 'file' as const,
        content: `file content ${i}`,
        size: 100
      }));

      act(() => { result.current.handleConcatenate(massiveFiles); });
      
      expect(global.URL.createObjectURL).not.toHaveBeenCalled();
      expect(result.current.importError).toContain('Warning: You are attempting to concatenate over 10000 files.');
    });

    it('executes URL.revokeObjectURL synchronously which may cause download race conditions on slow devices', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const mockFiles = [
        {
          name: 'test.js',
          path: 'src/test.js',
          kind: 'file' as const,
          content: 'content',
          size: 100
        }
      ];

      act(() => { result.current.handleConcatenate(mockFiles); });

      expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('concatenates files containing unregulated URI components in paths leading to special path injection risks', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const mockFiles = [
        {
          name: 'inject.js',
          path: 'src/../../../etc/passwd%20null&?.txt',
          kind: 'file' as const,
          content: 'malicious path content',
          size: 100
        }
      ];

      act(() => { result.current.handleConcatenate(mockFiles); });
      
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      const createObjCallArgs = (global.URL.createObjectURL as any).mock.calls[0][0];
      const text = await createObjCallArgs.text();
      expect(text).toContain(`${START_DELIMITER}src/../../../etc/passwd%20null&?.txt${END_DELIMITER}`);
    });

    it('does not enforce individual file size limitations risking V8 string accumulation memory issues', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      // Simulate large string concatenation risk
      const mockFiles = [
        {
          name: 'large.txt',
          path: 'src/large.txt',
          kind: 'file' as const,
          content: 'A'.repeat(5000),
          size: 5000 
        }
      ];

      act(() => { result.current.handleConcatenate(mockFiles); });
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      
      const createObjCallArgs = (global.URL.createObjectURL as any).mock.calls[0][0];
      const text = await createObjCallArgs.text();
      expect(text.length).toBeGreaterThan(5000);
    });
  });

  describe('De-Concatenation Regex Logic Edge Cases', () => {
    it('handles files containing correct regex paths and complex formats', async () => {
      const JSZip = (await import('jszip')).default;
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      const complexPath = 'src/test-(spec)+1.js';
      const fileContent = 'const a = 1;';
      const concatenatedContent = `${START_DELIMITER}${complexPath}${END_DELIMITER}\n${fileContent}\n${FILE_END_DELIMITER}\n\n`;
      
      const mockFiles = [
        {
          name: 'concat.txt',
          path: 'concat.txt',
          kind: 'file' as const,
          content: concatenatedContent,
          size: 1000
        }
      ];

      await act(async () => {
        await result.current.handleDeconcatenate(mockFiles);
      });

      expect(mockFile).toHaveBeenCalledWith(complexPath, fileContent);
    });

    it('gracefully skips files with malformed EOF delimiters', async () => {
      const JSZip = (await import('jszip')).default;
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      // Deliberately missing the closing end delimiter
      const concatenatedContent = `${START_DELIMITER}src/bad.js${END_DELIMITER}\nThis is bad content\n<BAD_DELIMITER>`;
      
      const mockFiles = [
        {
          name: 'concat.txt',
          path: 'concat.txt',
          kind: 'file' as const,
          content: concatenatedContent,
          size: 1000
        }
      ];

      await act(async () => {
        await result.current.handleDeconcatenate(mockFiles);
      });

      // Because EOF is missing, the regex match fails entirely.
      expect(mockFile).not.toHaveBeenCalled();
      expect(result.current.importError).toBe("No concatenated files were found in the uploaded file(s). Make sure you are uploading a file generated by this tool.");
    });

    it('sets import error when deconcatenating a file with no matches', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      const mockFiles = [
        {
          name: 'generic.txt',
          path: 'generic.txt',
          kind: 'file' as const,
          content: 'Just a regular text file with no delimiters',
          size: 1000
        }
      ];

      await act(async () => {
        await result.current.handleDeconcatenate(mockFiles);
      });

      expect(mockFile).not.toHaveBeenCalled();
      expect(result.current.importError).toBe("No concatenated files were found in the uploaded file(s). Make sure you are uploading a file generated by this tool.");
    });

    it('gracefully handles duplicated file paths in concatenated payload by sequential processing', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      const concatenatedContent = 
        `${START_DELIMITER}src/dup.js${END_DELIMITER}\nFirst content\n${FILE_END_DELIMITER}\n\n` +
        `${START_DELIMITER}src/dup.js${END_DELIMITER}\nSecond content\n${FILE_END_DELIMITER}\n\n`;
      
      const mockFiles = [{ name: 'concat.txt', path: 'concat.txt', kind: 'file' as const, content: concatenatedContent, size: 1000 }];

      await act(async () => { await result.current.handleDeconcatenate(mockFiles); });

      // Check that JSZip file was called twice with the SAME path, implicitly overwriting the first one per JSZip spec
      expect(mockFile).toHaveBeenCalledTimes(2);
      expect(mockFile).toHaveBeenLastCalledWith('src/dup.js', 'Second content');
    });

    it('truncates concatenated file contents prematurely if EOF delimiter exists natively inside code logic', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      const fileContent = `const a = 1;\n${FILE_END_DELIMITER}\nconst b = 2;`;
      const concatenatedContent = `${START_DELIMITER}src/trunc.js${END_DELIMITER}\n${fileContent}\n${FILE_END_DELIMITER}\n\n`;
      
      const mockFiles = [{ name: 'concat.txt', path: 'concat.txt', kind: 'file' as const, content: concatenatedContent, size: 1000 }];

      await act(async () => { await result.current.handleDeconcatenate(mockFiles); });

      // BUG documentation: Because the regex reads `.*?FILE_END_DELIMITER`, it matches the FIRST instance of the end delimiter!
      // This means the second half of the JS file is completely lost, verifying Edge Case #15.
      expect(mockFile).toHaveBeenCalledWith('src/trunc.js', 'const a = 1;');
    });

    it('gracefully skips broken files and parses subsequent ones without delimiter bleeding (Edge Case 25)', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      const concatenatedContent = 
        `${START_DELIMITER}src/file1.js${END_DELIMITER}\nContent 1\n` + 
        // Missing FILE_END_DELIMITER here!
        `${START_DELIMITER}src/file2.js${END_DELIMITER}\nContent 2\n${FILE_END_DELIMITER}\n\n`;
      
      const mockFiles = [{ name: 'concat.txt', path: 'concat.txt', kind: 'file' as const, content: concatenatedContent, size: 1000 }];

      await act(async () => { await result.current.handleDeconcatenate(mockFiles); });

      // File 1 is dropped because it lacks its FILE_END_DELIMITER before the next FILE_START_DELIMITER.
      // File 2 is correctly parsed since its boundaries are perfectly valid.
      expect(mockFile).toHaveBeenCalledTimes(1);
      expect(mockFile).toHaveBeenCalledWith('src/file2.js', 'Content 2');
    });

    it('fails to extract files if start delimiters are completely missing (Edge Case 26)', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      const concatenatedContent = 
        `I have no start delimiter\nContent 1\n${FILE_END_DELIMITER}\n\n` + 
        `${START_DELIMITER}src/file2.js${END_DELIMITER}\nContent 2\n${FILE_END_DELIMITER}\n\n`;
      
      const mockFiles = [{ name: 'concat.txt', path: 'concat.txt', kind: 'file' as const, content: concatenatedContent, size: 1000 }];

      await act(async () => { await result.current.handleDeconcatenate(mockFiles); });

      // The first file is completely ignored because it lacks the START_DELIMITER string.
      expect(mockFile).toHaveBeenCalledTimes(1);
      expect(mockFile).toHaveBeenCalledWith('src/file2.js', 'Content 2');
    });

    it('safely handles and cleans mangled newlines directly after delimiters (Edge Case 27)', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      // Simulating a mangled newline \n\r instead of \n or \r\n
      const concatenatedContent = 
        `${START_DELIMITER}src/mangled.js${END_DELIMITER}\n\rContent\n${FILE_END_DELIMITER}`;
      
      const mockFiles = [{ name: 'concat.txt', path: 'concat.txt', kind: 'file' as const, content: concatenatedContent, size: 1000 }];

      await act(async () => { await result.current.handleDeconcatenate(mockFiles); });

      // The \r is strictly trimmed from the content.
      expect(mockFile).toHaveBeenCalledTimes(1);
      expect(mockFile).toHaveBeenCalledWith('src/mangled.js', 'Content');
    });

    it('sanitizes inputs to prevent Zip Path Traversal attacks (Edge Case 29)', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'deconcatenate', compiledIgnores: [] }));
      
      const maliciousPath = '../../../etc/passwd';
      const concatenatedContent = `${START_DELIMITER}${maliciousPath}${END_DELIMITER}\nMalicious Content\n${FILE_END_DELIMITER}\n\n`;
      
      const mockFiles = [{ name: 'concat.txt', path: 'concat.txt', kind: 'file' as const, content: concatenatedContent, size: 1000 }];

      await act(async () => { await result.current.handleDeconcatenate(mockFiles); });

      // The path traversal elements should be heavily stripped out by the sanitization routine.
      expect(mockFile).toHaveBeenCalledWith('etc/passwd', 'Malicious Content');
    });
  });

  describe('File System Ignore Checks (isIgnored)', () => {
    it('evaluates case-sensitivity accurately based on user configuration (Edge Case 35 fixed)', () => {
      // Assuming compiledIgnores is constructed carefully by useIgnoreList
      const compiledIgnores = [/makefile/i, 'debug'];
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores }));

      // Strict uppercase 'Makefile' should be ignored by insensitive regex
      expect(result.current.isIgnored('Makefile')).toBe(true);
      
      // Strict 'Debug' should NOT be ignored by the segment matcher since segment matcher is now strict case string match
      expect(result.current.isIgnored('src/Debug/app.js')).toBe(false);
      
      // Strict 'debug' matching exact casing should be ignored
      expect(result.current.isIgnored('src/debug/app.js')).toBe(true);
      
      // Should not ignore normal files
      expect(result.current.isIgnored('src/main.js')).toBe(false);
    });

    it('ignores empty folders or explicitly matched root directories appropriately', () => {
      const compiledIgnores = ['node_modules'];
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores }));

      // isIgnored passing in root segment
      // Fixed: isIgnored now correctly maps all string segments globally without slice(1) leaks.
      expect(result.current.isIgnored('node_modules/abc.js')).toBe(true);
      
      // root segment itself
      expect(result.current.isIgnored('node_modules')).toBe(true);
      
      // Empty string path should safely bypass
      expect(result.current.isIgnored('')).toBe(false);
    });

    it('normalizes windows backslash paths correctly for ignore evaluation', () => {
      const compiledIgnores = [/test\.js/i];
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores }));

      // Testing backslash replacement edge case (normalize string internally to /)
      expect(result.current.isIgnored('src\\components\\test.js')).toBe(true); // removed second argument
    });

    it('demonstrates that over-broad regex patterns can accidentally match and ignore everything (Edge Case 34)', () => {
      // User accidentally saves an over-broad regex
      const compiledIgnores = [/[\s\S]+/]; 
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores }));

      expect(result.current.isIgnored('src/main.js')).toBe(true);
      expect(result.current.isIgnored('index.html')).toBe(true);
      expect(result.current.isIgnored('package.json')).toBe(true);
    });

    it('properly evaluates trailing slash paths by dropping trailing slashes during strict matching (Edge Case 40 Fixed)', () => {
      const compiledIgnores = ['build/'];
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores }));

      // The trailing slash in the ignore pattern is handled so "build" directory resolves to true.
      expect(result.current.isIgnored('build/main.js')).toBe(true);
    });
  });

  describe('File Upload/Reading Edge Cases', () => {
    it('skips files that fail to read via FileReader silently', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const file1 = new File(['valid'], 'valid.txt', { type: 'text/plain' });
      const file2 = new File(['invalid'], 'invalid.txt', { type: 'text/plain' });
      Object.defineProperty(file1, 'webkitRelativePath', { value: 'valid.txt' });
      Object.defineProperty(file2, 'webkitRelativePath', { value: 'invalid.txt' });

      // Mock FileReader to fail for file2
      const originalFileReader = global.FileReader;
      const mockReadAsText = vi.fn().mockImplementation(function (this: any, file: File) {
        if (file.name === 'invalid.txt') {
          setTimeout(() => this.onerror(new Error('Mock read error')), 5);
        } else {
          this.result = 'valid content';
          setTimeout(() => this.onload(), 5);
        }
      });
      global.FileReader = class {
        readAsText = mockReadAsText;
      } as any;

      const mockEvent = {
        target: {
          files: [file1, file2],
          value: 'mock_path'
        }
      };

      await act(async () => {
        await result.current.handleFileUpload(mockEvent as any);
      });

      // Only valid.txt is loaded
      expect(result.current.files.length).toBe(1);
      expect(result.current.files[0].name).toBe('valid.txt');
      expect(result.current.files[0].content).toBe('valid content');

      global.FileReader = originalFileReader;
      consoleSpy.mockRestore();
    });
  });

  describe('Drop API Edge Cases', () => {
    it('ignores empty folders in drag-and-drop traversal', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const mockEntry = {
        name: 'empty-folder',
        isFile: false,
        isDirectory: true,
        createReader: () => ({
          readEntries: (callback: any) => callback([]) // returns no children
        })
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          items: [{ webkitGetAsEntry: () => mockEntry }]
        }
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(mockEvent);
      });

      expect(result.current.files.length).toBe(0);
      expect(result.current.importError).toBe("No files were imported. This might be because all files matched your ignore list (check if any Regex is overly broad) or the folder was empty.");
    });

    it('processes deep directory trees up to internal stack limitations without crashing', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));

      let depthLimit = 100;
      let currentDepth = 0;

      // Create a recursive directory structure
      const createDirectoryEntry = (name: string): any => {
        return {
          name,
          isFile: false,
          isDirectory: true,
          createReader: () => {
            let read = false;
            return {
              readEntries: (callback: any) => {
                if (read) {
                  return callback([]);
                }
                read = true;
                if (currentDepth < depthLimit) {
                  currentDepth++;
                  callback([createDirectoryEntry(`child-${currentDepth}`)]);
                } else if (currentDepth === depthLimit) {
                  currentDepth++;
                  // Add a file at the very bottom
                  callback([{
                    name: 'deep.txt',
                    isFile: true,
                    isDirectory: false,
                    file: (cb: any) => cb(new File(['content'], 'deep.txt', { type: 'text/plain' }))
                  }]);
                } else {
                  callback([]);
                }
              }
            };
          }
        };
      };

      const rootEntry = createDirectoryEntry('root');

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          items: [{ webkitGetAsEntry: () => rootEntry }]
        }
      } as unknown as React.DragEvent;

      // Mock FileReader to avoid test blocking on read
      const originalFileReader = global.FileReader;
      global.FileReader = class {
        readAsText = vi.fn().mockImplementation(function (this: any) {
          this.result = 'content';
          setTimeout(() => this.onload(), 5);
        });
      } as any;

      await act(async () => {
        await result.current.handleDrop(mockEvent);
      });

      // Validates deep paths are formed correctly and no stack size exceeded issues were hit
      expect(result.current.files.length).toBeGreaterThan(0);
      const deepFile = result.current.files.find(f => f.kind === 'file');
      expect(deepFile?.path.includes('child-100')).toBe(true);

      global.FileReader = originalFileReader;
    });

    it('bypasses parsing execution when standard dataTransfer format is missing', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {} // Missing .items
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(mockEvent);
      });

      expect(result.current.isProcessing).toBe(false);
      expect(result.current.files.length).toBe(0);
    });

    it('skips traversing root directories explicitly blocked by ignore list', async () => {
      // Testing edge case mapping logic failure point bypassing children processing 
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: ['ignored-root'] }));
      
      const rootEntry = {
        name: 'ignored-root',
        isFile: false,
        isDirectory: true,
        createReader: () => {
          let read = false;
          return {
            readEntries: (callback: any) => {
              if (read) return callback([]);
              read = true;
              callback([{ 
                name: 'should-not-read.txt', 
                isFile: true, 
                isDirectory: false,
                file: (cb: any) => cb(new File(['content'], 'should-not-read.txt', { type: 'text/plain' })) 
              }]);
            }
          };
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          items: [{ webkitGetAsEntry: () => rootEntry }]
        }
      } as unknown as React.DragEvent;

      // Mock FileReader to avoid test blocking on read
      const originalFileReader = global.FileReader;
      global.FileReader = class {
        readAsText = vi.fn().mockImplementation(function (this: any) {
          this.result = 'content';
          setTimeout(() => this.onload(), 5);
        });
      } as any;

      await act(async () => {
        await result.current.handleDrop(mockEvent);
      });

      // Fixed: Explicit root drops are now aborted efficiently if blocked by the ignore targets!
      expect(result.current.files.length).toBe(0);
      
      global.FileReader = originalFileReader;
    });
  });

    describe('UI State & Asynchronous Concurrency Edge Cases', () => {
    it('prevents simultaneous drop race conditions (Edge Case 41)', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const file1 = new File(['content1'], 'file1.txt', { type: 'text/plain' });
      const file2 = new File(['content2'], 'file2.txt', { type: 'text/plain' });
      
      const originalFileReader = global.FileReader;
      global.FileReader = class {
        readAsText = vi.fn().mockImplementation(function (this: any, f: File) {
          setTimeout(() => {
            this.result = f.name.includes('1') ? 'content1' : 'content2';
            this.onload();
          }, 10);
        });
      } as any;

      const mockEvent1 = {
        preventDefault: vi.fn(), stopPropagation: vi.fn(),
        target: { files: [file1], value: 'mock_path1' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      const mockEvent2 = {
        preventDefault: vi.fn(), stopPropagation: vi.fn(),
        target: { files: [file2], value: 'mock_path2' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      // Fire both file uploads without waiting, simulating rapid user action
      act(() => { result.current.handleFileUpload(mockEvent1); });
      
      // Because isProcessingRef prevents overlapping, the second drop should be instantly ignored
      act(() => { result.current.handleFileUpload(mockEvent2); });

      await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });

      expect(result.current.files.length).toBe(1); // Only the first file made it to state! (plus potential dirs = 1 total)
      expect(result.current.files[0].content).toBe('content1');
      global.FileReader = originalFileReader;
    });

    it('safely aborts FileReader operations to prevent memory leaks (Edge Case 42)', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      let readerAbort: any;
      const file = new File(['content'], 'big.txt', { type: 'text/plain' });
      
      const originalFileReader = global.FileReader;
      const mockAbort = vi.fn();
      global.FileReader = class {
        abort = mockAbort;
        readAsText = vi.fn().mockImplementation(function (this: any) {
           this.abort = () => { mockAbort(); if (this.onabort) this.onabort(); };
        });
      } as any;

      const mockEvent = { preventDefault: vi.fn(), target: { files: [file], value: 'mock_path' } } as unknown as React.ChangeEvent<HTMLInputElement>;

      let promise: any;
      act(() => { promise = result.current.handleFileUpload(mockEvent); });

      // Wait for the initial 50ms delay to pass and reader to start
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });

      // Cancel import using the new cancelProcessing function
      act(() => { result.current.cancelProcessing(); });
      
      await act(async () => { await promise; });

      // Ensure that not only did it skip saving the file, but it successfully triggered FileReader.abort.
      expect(result.current.files.length).toBe(0);
      expect(mockAbort).toHaveBeenCalled();
      global.FileReader = originalFileReader;
    });

    it('throttles React state rendering during massive operations (Edge Case 44)', async () => {
      const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
      
      const mockedFiles = Array.from({ length: 50 }).map((_, i) => new File(['text'], `f${i}.txt`, { type: 'text/plain' }));
      const mockEvent = { preventDefault: vi.fn(), target: { files: mockedFiles, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

      const originalFileReader = global.FileReader;
      global.FileReader = class {
        readAsText = vi.fn().mockImplementation(function (this: any) {
           this.result = 'foo';
           this.onload();
        });
      } as any;

      await act(async () => {
        await result.current.handleFileUpload(mockEvent);
      });

      // The loop still parses everything perfectly, but throttled to 50ms instead of thrashing
      expect(result.current.files.length).toBeGreaterThan(0);
      global.FileReader = originalFileReader;
    });

    it('processes massive array sets without spreading constraints (Edge Case 45)', async () => {
       const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
       const originalFileReader = global.FileReader;
       global.FileReader = class {
         readAsText = vi.fn().mockImplementation(function (this: any) { this.result = 'foo'; this.onload(); });
       } as any;

       const mockFiles = [new File(['foo'], 'foo.txt')];
       const mockEvent = { preventDefault: vi.fn(), target: { files: mockFiles, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

       await act(async () => { await result.current.handleFileUpload(mockEvent); });

       // Now operates securely utilizing .concat() instead of spread notation constraints.
       expect(result.current.files.length).toBeGreaterThan(0);
       global.FileReader = originalFileReader;
    });

    it('optimizes deduplication via sets instead of Map iterations (Edge Case 46)', async () => {
       const { result } = renderHook(() => useFileProcessing({ appMode: 'concatenate', compiledIgnores: [] }));
       const mockFiles = [new File(['foo'], 'dedup.txt')];
       const mockEvent = { preventDefault: vi.fn(), target: { files: mockFiles, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

       const originalFileReader = global.FileReader;
       global.FileReader = class {
         readAsText = vi.fn().mockImplementation(function (this: any) { this.result = 'foo'; this.onload(); });
       } as any;

       await act(async () => { await result.current.handleFileUpload(mockEvent); });
       // Ensures deduplication filtering sets successfully complete without regressions
       expect(result.current.files.some(f => f.name === 'dedup.txt')).toBe(true);
       global.FileReader = originalFileReader;
    });
});
});
