/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { join, resolve } from 'node:path'

// Mocking Node built-ins and dependencies with vi.hoisted
const { mockFs, mockChildProcess, mockCrypto, mockLogger, mockFsUtils } =
  vi.hoisted(() => {
    const mockFs = {
      readdirSync: vi.fn(),
      readFileSync: vi.fn(),
      statSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      existsSync: vi.fn(),
      rmSync: vi.fn(),
    }

    const mockChildProcess = {
      execSync: vi.fn(),
      execFileSync: vi.fn(),
      exec: vi.fn(),
    }

    const mockCrypto = {
      createHash: vi.fn(),
      randomBytes: vi.fn(),
    }

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      raw: vi.fn((msg: any) => console.log(msg)),
      rawError: vi.fn((msg: any) => console.error(msg)),
    }

    const mockFsUtils = {
      isDirectoryTainted: vi.fn().mockReturnValue(false),
    }

    return {
      mockFs,
      mockChildProcess,
      mockCrypto,
      mockLogger,
      mockFsUtils,
    }
  })

vi.mock('node:fs', () => ({
  default: mockFs,
  ...mockFs,
}))
vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}))
vi.mock('node:child_process', () => ({
  default: mockChildProcess,
  ...mockChildProcess,
}))
vi.mock('child_process', () => ({
  default: mockChildProcess,
  ...mockChildProcess,
}))
vi.mock('node:crypto', () => ({
  default: mockCrypto,
  ...mockCrypto,
}))
vi.mock('crypto', () => ({
  default: mockCrypto,
  ...mockCrypto,
}))

// Mock logger
vi.mock('../../src/lib/logger.js', () => ({
  logger: mockLogger,
}))

// Mock TokenService and IgnoreEngine if needed, but they are relatively safe to use or mock lightly
vi.mock('../../src/core/TokenService.js', () => ({
  TokenService: {
    getTokenEstimate: vi.fn().mockReturnValue(10),
    getTokenCount: vi.fn().mockReturnValue({ count: 10, model: 'heuristic' }),
  },
}))

// Mock UIServer to avoid starting a real server
vi.mock('../../src/core/UIServer.js', () => ({
  UIServer: class {
    start = vi.fn().mockResolvedValue(1234)
  },
}))

// Mock IgnoreEngine
vi.mock('../../src/core/ignore/IgnoreEngine.js', () => {
  const parseIgnoreFile = vi
    .fn()
    .mockImplementation((content: string) => content.split('\n'))
  return {
    IgnoreEngine: {
      parseIgnoreFile,
    },
    default: {
      parseIgnoreFile,
    },
  }
})

// Mock web-assets
vi.mock('../../src/cli/web-assets.js', () => ({
  webAssets: {},
}))
vi.mock('../../src/cli/webAssets.js', () => ({
  webAssets: {},
}))

// Mock engine
vi.mock('../../src/core/engine.js', () => ({
  generateSessionId: vi.fn().mockReturnValue('mock-session'),
}))

// Mock fs-utils
vi.mock('../../src/core/utils/fs-utils.js', () => ({
  default: mockFsUtils,
  ...mockFsUtils,
}))

// Mock fetch
global.fetch = vi.fn()

describe('cli-utils', () => {
  let cliUtils: any

  beforeAll(async () => {
    // We need to import after mocks are set
    cliUtils = await import('../../src/cli/cli-utils.js')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
  })

  describe('calculateFileHash', () => {
    it('should calculate SHA256 hash of a file', () => {
      const mockBuffer = Buffer.from('test content')
      mockFs.readFileSync.mockReturnValue(mockBuffer)

      const mockUpdate = vi.fn().mockReturnThis()
      const mockDigest = vi.fn().mockReturnValue('mock-hash')
      mockCrypto.createHash.mockReturnValue({
        update: mockUpdate,
        digest: mockDigest,
      })

      const result = cliUtils.calculateFileHash('test.txt')

      expect(mockFs.readFileSync).toHaveBeenCalledWith('test.txt')
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256')
      expect(mockUpdate).toHaveBeenCalledWith(mockBuffer)
      expect(result).toBe('mock-hash')
    })
  })

  describe('checkQuarantine', () => {
    it('should log security brief if mocked', () => {
      process.env.CONCATENATOR_MOCK_QUARANTINE = 'true'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      cliUtils.checkQuarantine()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY BRIEF')
      )

      delete process.env.CONCATENATOR_MOCK_QUARANTINE
      consoleSpy.mockRestore()
    })

    it.skip('should check quarantine via ls -l@ on darwin', () => {
      const platformSpy = vi
        .spyOn(process, 'platform', 'get')
        .mockReturnValue('darwin')

      mockChildProcess.execFileSync.mockReturnValue('com.apple.quarantine')
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      cliUtils.checkQuarantine()

      expect(mockChildProcess.execFileSync).toHaveBeenCalledWith(
        'ls',
        ['-l@', expect.any(String)],
        expect.anything()
      )

      platformSpy.mockRestore()
      consoleSpy.mockRestore()
    })
  })

  describe('getProjectHash', () => {
    it('should return a short hash of the absolute path', () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockDigest = vi.fn().mockReturnValue('abcdef1234567890')
      mockCrypto.createHash.mockReturnValue({
        update: mockUpdate,
        digest: mockDigest,
      })

      const result = cliUtils.getProjectHash('some/path')

      expect(mockUpdate).toHaveBeenCalled()
      expect(result).toBe('abcdef12')
    })
  })

  describe('acquireLock', () => {
    it('should write a lock file with process info', () => {
      const projectPath = '/tmp/project'
      const data = { pid: 123, port: 456, token: 'abc', sessionId: 'xyz' }

      cliUtils.acquireLock(projectPath, data)

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        join(projectPath, '.concatenator.lock'),
        JSON.stringify(data, null, 2),
        'utf-8'
      )
    })
  })

  describe('ensureLockInGitignore', () => {
    it('should add .concatenator.lock to .gitignore if missing', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('node_modules\ndist\n')

      cliUtils.ensureLockInGitignore('/tmp/project')

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        'node_modules\ndist\n.concatenator.lock\n',
        'utf-8'
      )
    })

    it('should not add if already present', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('node_modules\n.concatenator.lock\n')

      cliUtils.ensureLockInGitignore('/tmp/project')

      expect(mockFs.writeFileSync).not.toHaveBeenCalled()
    })
  })

  describe('checkOutputPath', () => {
    it('should return true if path does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)
      const result = cliUtils.checkOutputPath('out.txt', false, 'file')
      expect(result).toBe(true)
    })

    it('should throw error if file exists and force is false', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isDirectory: () => false })

      expect(() => cliUtils.checkOutputPath('out.txt', false, 'file')).toThrow(
        /already exists/
      )
    })

    it('should remove file if force is true', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isDirectory: () => false })

      const result = cliUtils.checkOutputPath('out.txt', true, 'file')

      expect(mockFs.rmSync).toHaveBeenCalledWith('out.txt', {
        recursive: true,
        force: true,
      })
      expect(result).toBe(true)
    })

    it('should handle directory collisions correctly', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isDirectory: () => true })

      // Outputting file to a directory
      expect(() => cliUtils.checkOutputPath('out-dir', false, 'file')).toThrow(
        /exists as a directory/
      )

      // Force outputting file to a directory
      cliUtils.checkOutputPath('out-dir', true, 'file')
      expect(mockFs.rmSync).toHaveBeenCalledWith('out-dir', {
        recursive: true,
        force: true,
      })

      // Outputting directory to a file
      mockFs.statSync.mockReturnValue({ isDirectory: () => false })
      expect(() =>
        cliUtils.checkOutputPath('out-file', false, 'directory')
      ).toThrow(/exists as a file/)

      // Force outputting directory to a file
      cliUtils.checkOutputPath('out-file', true, 'directory')
      expect(mockFs.rmSync).toHaveBeenCalled()
    })

    it('should handle tainted directory collision', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isDirectory: () => true })
      mockFsUtils.isDirectoryTainted.mockReturnValue(true)

      expect(() =>
        cliUtils.checkOutputPath('tainted-dir', false, 'directory')
      ).toThrow(/already exists and is not empty/)

      cliUtils.checkOutputPath('tainted-dir', true, 'directory')
      expect(mockFs.rmSync).toHaveBeenCalled()
    })

    it('should return true for non-tainted existing directory', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isDirectory: () => true })
      mockFsUtils.isDirectoryTainted.mockReturnValue(false)

      const result = cliUtils.checkOutputPath('clean-dir', false, 'directory')
      expect(result).toBe(true)
    })
  })

  describe('handleError', () => {
    it('should log error and exit', () => {
      const error = new Error('oops')

      expect(() => cliUtils.handleError(error)).toThrow('process.exit called')
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(mockLogger.error).toHaveBeenCalledWith('Error: oops')
    })

    it('should handle UserError differently', () => {
      const { UserError } = cliUtils
      const error = new UserError('user-friendly error')

      expect(() => cliUtils.handleError(error)).toThrow('process.exit called')
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error: user-friendly error'
      )
    })
  })

  describe('collectFiles', () => {
    it('should recursively collect files', () => {
      mockFs.readdirSync
        .mockReturnValueOnce([
          { name: 'file1.txt', isDirectory: () => false, isFile: () => true },
          { name: 'subdir', isDirectory: () => true, isFile: () => false },
        ])
        .mockReturnValueOnce([
          { name: 'file2.txt', isDirectory: () => false, isFile: () => true },
        ])

      mockFs.statSync.mockReturnValue({ size: 100 })
      mockFs.readFileSync.mockReturnValue('content')

      const mockIgnoreEngine = {
        isIgnored: vi.fn().mockReturnValue(false),
      }

      const result = cliUtils.collectFiles('/base', '/base', mockIgnoreEngine)

      expect(result.files).toHaveLength(2)
      expect(result.files[0].path).toBe('file1.txt')
      expect(result.files[1].path).toBe(join('subdir', 'file2.txt'))
      expect(result.totalTokens).toBe(20) // 10 per file from TokenService mock
    })

    it('should skip files that cannot be read', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'locked.txt', isDirectory: () => false, isFile: () => true },
      ])
      mockFs.statSync.mockImplementation(() => {
        throw new Error('locked')
      })

      const mockIgnoreEngine = { isIgnored: () => false }
      const result = cliUtils.collectFiles('/base', '/base', mockIgnoreEngine)

      expect(result.files).toHaveLength(0)
    })

    it('should skip non-file/non-directory entries', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'socket', isDirectory: () => false, isFile: () => false },
      ])
      const mockIgnoreEngine = { isIgnored: () => false }
      const result = cliUtils.collectFiles(
        '/base',
        '/base',
        mockIgnoreEngine as any
      )
      expect(result.files).toHaveLength(0)
    })

    it('should handle ignore engine and verbose logging', () => {
      mockFs.readdirSync.mockReturnValue([
        { name: 'ignored.txt', isDirectory: () => false, isFile: () => true },
        { name: 'verbose.txt', isDirectory: () => false, isFile: () => true },
      ])
      mockFs.statSync.mockReturnValue({ size: 100 })
      mockFs.readFileSync.mockReturnValue('content')

      const mockIgnoreEngine = {
        isIgnored: vi
          .fn()
          .mockReturnValueOnce(true) // First file ignored
          .mockReturnValueOnce(false), // Second file kept
      }

      const result = cliUtils.collectFiles(
        '/base',
        '/base',
        mockIgnoreEngine,
        2
      )

      expect(mockIgnoreEngine.isIgnored).toHaveBeenCalledTimes(2)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('tokens] verbose.txt')
      ) // verbose 2
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Dir: .')
      ) // verbose 1
      expect(result.files).toHaveLength(1)
    })

    it('should discover negated files in ignored directories (matching UI behavior)', async () => {
      // Mock a structure: tests/core/main.ts
      // Ignore: tests, Negate: !core
      mockFs.readdirSync
        .mockReturnValueOnce([
          { name: 'tests', isDirectory: () => true, isFile: () => false },
        ])
        .mockReturnValueOnce([
          { name: 'core', isDirectory: () => true, isFile: () => false },
          { name: 'other.txt', isDirectory: () => false, isFile: () => true },
        ])
        .mockReturnValueOnce([
          { name: 'main.ts', isDirectory: () => false, isFile: () => true },
        ])

      mockFs.statSync.mockReturnValue({ size: 100 })
      mockFs.readFileSync.mockReturnValue('content')

      // Real IgnoreEngine to test the logic I just fixed
      const { IgnoreEngine } = await vi.importActual<any>(
        '../../src/core/ignore/IgnoreEngine.js'
      )
      const engine = new IgnoreEngine(['tests', '!core'])

      const result = cliUtils.collectFiles('/base', '/base', engine)

      // Should find tests/core/main.ts because !core forced recursion and un-ignored it
      // Should NOT find tests/other.txt because it's ignored and not negated
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe(join('tests', 'core', 'main.ts'))
    })
  })

  describe('getIgnorePatterns', () => {
    it('should resolve patterns from exclude flag', () => {
      const patterns = cliUtils.getIgnorePatterns({
        exclude: 'node_modules,dist',
      })
      expect(patterns).toContain('node_modules')
      expect(patterns).toContain('dist')
    })

    it('should load patterns from ignore file', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('pattern1\npattern2')

      cliUtils.getIgnorePatterns({ ignoreFile: '.gitignore' })
      expect(mockFs.readFileSync).toHaveBeenCalledWith('.gitignore', 'utf-8')
    })

    it('should handle errors when reading ignore file', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('read error')
      })

      cliUtils.getIgnorePatterns({ ignoreFile: '.gitignore' })
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not read ignore file')
      )
    })

    it('should throw if explicit ignore file is missing', () => {
      mockFs.existsSync.mockReturnValue(false)
      expect(() =>
        cliUtils.getIgnorePatterns({ ignoreFile: 'missing.txt' })
      ).toThrow(/does not exist/)
    })

    it('should discover local ignore files in input paths', () => {
      mockFs.existsSync.mockImplementation((p) => p.includes('.gitignore'))
      mockFs.statSync.mockReturnValue({ isDirectory: () => true })
      mockFs.readFileSync.mockReturnValue('src-pattern')

      const patterns = cliUtils.getIgnorePatterns({}, ['src'])
      expect(patterns).toContain('src-pattern')
    })

    it('should resolve dirname if input path is a file', () => {
      mockFs.existsSync.mockImplementation((p) => p.includes('.gitignore'))
      mockFs.statSync.mockReturnValue({ isDirectory: () => false })
      mockFs.readFileSync.mockReturnValue('file-pattern')

      const patterns = cliUtils.getIgnorePatterns({}, ['src/main.ts'])
      expect(patterns).toContain('file-pattern')
      expect(mockFs.statSync).toHaveBeenCalledWith('src/main.ts')
    })
  })

  describe('reconstructFiles', () => {
    it('should write virtual files to disk', () => {
      const files = [
        { path: 'a.txt', content: 'content a' },
        { path: 'b/c.txt', content: 'content c' },
      ]

      mockFs.existsSync.mockReturnValue(false)

      cliUtils.reconstructFiles(files, '/out')

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/out', expect.anything())
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        resolve('/out', 'a.txt'),
        'content a',
        'utf-8'
      )
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        resolve('/out', 'b/c.txt'),
        'content c',
        'utf-8'
      )
    })
  })

  describe('formatValidationReport', () => {
    it('should log validation summary', () => {
      const result = {
        isValid: true,
        sessionId: 'test-session',
        totalMarkersFound: 5,
        targetFileCount: 3,
        foreignFileCount: 2,
        targetFiles: ['a.ts', 'b.ts', 'c.ts'],
        foreignFiles: ['f1.ts', 'f2.ts'],
        warnings: ['warn1'],
        errors: [],
      }

      cliUtils.formatValidationReport(result, 'test.txt')

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Validating: test.txt')
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Valid session manifest found')
      )
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('warn1')
      )
    })

    it('should log validation summary without foreign files', () => {
      const result = {
        isValid: true,
        sessionId: 'test-session',
        totalMarkersFound: 3,
        targetFileCount: 3,
        foreignFileCount: 0,
        targetFiles: ['a.ts', 'b.ts', 'c.ts'],
        foreignFiles: [],
        warnings: [],
        errors: [],
      }

      cliUtils.formatValidationReport(result, 'test.txt')

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('3 file(s) ready for extraction')
      )
    })

    it('should log overwrites and invalid status', () => {
      const result = {
        isValid: false,
        sessionId: null,
        totalMarkersFound: 1,
        targetFileCount: 1,
        foreignFileCount: 0,
        targetFiles: ['a.ts'],
        foreignFiles: [],
        warnings: [],
        errors: ['Missing end marker'],
        overwrites: Array(15).fill('overwritten.ts'),
      }

      cliUtils.formatValidationReport(result, 'test.txt', false, true)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Potential Overwrites (15)')
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('and 5 more')
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Validation found 1 error(s)')
      )
    })

    it('should log foreign markers in verbose mode', () => {
      const result = {
        isValid: true,
        sessionId: 'session',
        totalMarkersFound: 25,
        targetFileCount: 2,
        foreignFileCount: 23,
        targetFiles: ['a.ts', 'b.ts'],
        foreignFiles: Array(23).fill('foreign.ts'),
        warnings: [],
        errors: [],
      }

      cliUtils.formatValidationReport(result, 'test.txt', true)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Foreign Markers Ignored (23)')
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('and 3 more')
      )
    })
  })

  describe('launchUI', () => {
    it('should start UIServer and open browser', async () => {
      mockFs.existsSync.mockReturnValue(false)
      mockCrypto.randomBytes.mockReturnValue(Buffer.from('token'))

      mockChildProcess.exec.mockImplementation((cmd, cb) => {
        if (cb) cb(null)
      })

      await cliUtils.launchUI('/some/path', { maxFiles: 100 })

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.lock'),
        expect.stringContaining('"token"'),
        'utf-8'
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting Concatenator Workbench UI')
      )
    })

    it('should reuse existing server if running', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          pid: 999,
          port: 8888,
          token: 'existing-token',
        })
      )

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ pid: 999 }),
      })

      await cliUtils.launchUI('/some/path')

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Server already running')
      )
    })

    it('should handle SIGINT for graceful shutdown', async () => {
      mockFs.existsSync.mockReturnValue(false)
      mockCrypto.randomBytes.mockReturnValue(Buffer.from('token'))

      let sigintHandler: any
      const onSpy = vi
        .spyOn(process, 'on')
        .mockImplementation((event, listener) => {
          if (event === 'SIGINT') sigintHandler = listener
          return process
        })

      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      await cliUtils.launchUI('/some/path')

      expect(sigintHandler).toBeDefined()
      await sigintHandler()

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Termination signal received')
      )
      onSpy.mockRestore()
    })
  })

  describe('startPulseMirror', () => {
    it('should mirror pulse data to stderr', async () => {
      vi.useFakeTimers()
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          ts: 100,
          op: 'test-op',
          progress: 50,
          active: true,
        })
      )

      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)

      cliUtils.startPulseMirror()
      vi.advanceTimersByTime(500)

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PULSE] test-op: 50% (active)')
      )

      vi.useRealTimers()
      stderrSpy.mockRestore()
    })
  })
})
