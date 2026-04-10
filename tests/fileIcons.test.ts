import { describe, it, expect } from 'vitest';
import { getFileIcon } from '../src/lib/fileIcons';

describe('getFileIcon', () => {
  describe('directory icon', () => {
    it('returns Folder icon for directories regardless of name', () => {
      const icon = getFileIcon('any-name', 'directory');
      expect(icon).toBeDefined();
      expect(icon.type).toBeDefined();
    });

    it('returns Folder icon for directory with extension-like name', () => {
      const icon = getFileIcon('folder.txt', 'directory');
      expect(icon).toBeDefined();
    });
  });

  describe('code file icons', () => {
    const codeExtensions = ['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'scss', 'py', 'rb', 'go', 'rs', 'c', 'cpp', 'java', 'php'];
    
    codeExtensions.forEach(ext => {
      it(`returns FileCode icon for .${ext} files`, () => {
        const icon = getFileIcon(`file.${ext}`, 'file');
        expect(icon).toBeDefined();
        expect(icon.props.className).toContain('text-blue-500');
      });
    });

    it('handles uppercase extensions', () => {
      const icon = getFileIcon('file.JS', 'file');
      expect(icon).toBeDefined();
    });
  });

  describe('json files', () => {
    it('returns FileJson icon for .json files', () => {
      const icon = getFileIcon('config.json', 'file');
      expect(icon).toBeDefined();
      expect(icon.props.className).toContain('text-yellow-500');
    });

    it('returns FileJson icon for .JSON uppercase', () => {
      const icon = getFileIcon('config.JSON', 'file');
      expect(icon).toBeDefined();
    });
  });

  describe('text and markdown files', () => {
    it('returns FileText icon for .md files', () => {
      const icon = getFileIcon('readme.md', 'file');
      expect(icon).toBeDefined();
      expect(icon.props.className).toContain('text-slate-400');
    });

    it('returns FileText icon for .txt files', () => {
      const icon = getFileIcon('notes.txt', 'file');
      expect(icon).toBeDefined();
    });

    it('handles uppercase .MD and .TXT', () => {
      const mdIcon = getFileIcon('README.MD', 'file');
      const txtIcon = getFileIcon('NOTES.TXT', 'file');
      expect(mdIcon).toBeDefined();
      expect(txtIcon).toBeDefined();
    });
  });

  describe('image files', () => {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
    
    imageExtensions.forEach(ext => {
      it(`returns FileImage icon for .${ext} files`, () => {
        const icon = getFileIcon(`image.${ext}`, 'file');
        expect(icon).toBeDefined();
        expect(icon.props.className).toContain('text-purple-500');
      });
    });
  });

  describe('archive files', () => {
    const archiveExtensions = ['zip', 'tar', 'gz', 'rar', '7z'];
    
    archiveExtensions.forEach(ext => {
      it(`returns FileArchive icon for .${ext} files`, () => {
        const icon = getFileIcon(`archive.${ext}`, 'file');
        expect(icon).toBeDefined();
        expect(icon.props.className).toContain('text-orange-500');
      });
    });
  });

  describe('audio files', () => {
    const audioExtensions = ['mp3', 'wav', 'ogg'];
    
    audioExtensions.forEach(ext => {
      it(`returns FileAudio icon for .${ext} files`, () => {
        const icon = getFileIcon(`song.${ext}`, 'file');
        expect(icon).toBeDefined();
        expect(icon.props.className).toContain('text-pink-500');
      });
    });
  });

  describe('video files', () => {
    const videoExtensions = ['mp4', 'webm', 'mov'];
    
    videoExtensions.forEach(ext => {
      it(`returns FileVideo icon for .${ext} files`, () => {
        const icon = getFileIcon(`movie.${ext}`, 'file');
        expect(icon).toBeDefined();
        expect(icon.props.className).toContain('text-red-500');
      });
    });
  });

  describe('spreadsheet files', () => {
    const spreadsheetExtensions = ['csv', 'xlsx', 'xls'];
    
    spreadsheetExtensions.forEach(ext => {
      it(`returns FileSpreadsheet icon for .${ext} files`, () => {
        const icon = getFileIcon(`data.${ext}`, 'file');
        expect(icon).toBeDefined();
        expect(icon.props.className).toContain('text-green-500');
    });
    });
  });

  describe('unknown file types', () => {
    it('returns generic File icon for unknown extensions', () => {
      const icon = getFileIcon('file.unknown', 'file');
      expect(icon).toBeDefined();
      expect(icon.props.className).toContain('text-slate-400');
    });

    it('returns generic File icon for files without extension', () => {
      const icon = getFileIcon('Makefile', 'file');
      expect(icon).toBeDefined();
    });

    it('returns generic File icon for dotfiles without extension', () => {
      const icon = getFileIcon('.gitignore', 'file');
      expect(icon).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('handles files with multiple dots in name', () => {
      const icon = getFileIcon('some.file.name.js', 'file');
      expect(icon).toBeDefined();
      // Should use last extension (js)
    });

    it('handles files starting with dot (hidden files)', () => {
      const icon = getFileIcon('.env.local', 'file');
      expect(icon).toBeDefined();
    });

    it('handles empty filename', () => {
      const icon = getFileIcon('', 'file');
      expect(icon).toBeDefined();
    });

    it('handles filename with only extension', () => {
      const icon = getFileIcon('.gitignore', 'file');
      expect(icon).toBeDefined();
    });

    it('handles very long extension', () => {
      const icon = getFileIcon('file.verylongextension', 'file');
      expect(icon).toBeDefined();
    });

    it('handles unicode in filename', () => {
      const icon = getFileIcon('文件.txt', 'file');
      expect(icon).toBeDefined();
    });

    it('handles special characters in filename', () => {
      const icon = getFileIcon('file-with_special.chars.js', 'file');
      expect(icon).toBeDefined();
    });
  });

  describe('icon sizing', () => {
    it('returns icons with correct size classes for files', () => {
      const icon = getFileIcon('test.js', 'file');
      expect(icon.props.className).toContain('w-3.5');
      expect(icon.props.className).toContain('h-3.5');
    });

    it('returns icons with correct size classes for directories', () => {
      const icon = getFileIcon('folder', 'directory');
      expect(icon.props.className).toContain('w-3.5');
      expect(icon.props.className).toContain('h-3.5');
    });

    it('returns icons with shrink-0 class', () => {
      const icon = getFileIcon('test.js', 'file');
      expect(icon.props.className).toContain('shrink-0');
    });
  });
});
