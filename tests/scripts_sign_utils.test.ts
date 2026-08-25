/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// For Node built-ins in ESM, vi.mock often fails to intercept internal imports of other modules.
// Using vi.doMock + dynamic import is more reliable for this case.

describe('sign-utils', () => {
  let signUtils: any
  let mockExecFileSync: any
  let mockWriteFileSync: any
  let mockUnlinkSync: any
  let mockExistsSync: any

  beforeAll(async () => {
    mockExecFileSync = vi.fn()
    vi.doMock('child_process', () => ({
      execFileSync: mockExecFileSync,
      execSync: mockExecFileSync,
      default: {
        execFileSync: mockExecFileSync,
        execSync: mockExecFileSync,
      },
      __esModule: true,
    }))

    mockWriteFileSync = vi.fn()
    mockUnlinkSync = vi.fn()
    mockExistsSync = vi.fn()
    vi.doMock('fs', () => ({
      existsSync: mockExistsSync,
      writeFileSync: mockWriteFileSync,
      unlinkSync: mockUnlinkSync,
      readFileSync: vi.fn(),
      default: {
        existsSync: mockExistsSync,
        writeFileSync: mockWriteFileSync,
        unlinkSync: mockUnlinkSync,
        readFileSync: vi.fn(),
      },
      __esModule: true,
    }))

    // Dynamic import to ensure mocks are applied
    signUtils = await import('../scripts/sign-utils.ts')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env vars
    delete process.env.APPLE_ID
    delete process.env.APPLE_ID_PASSWORD
    delete process.env.APPLE_TEAM_ID
    delete process.env.MACOS_CERT_NAME
    delete process.env.SIGNING_CERT_DATA
    delete process.env.SIGNING_CERT_PASSWORD
  })

  describe('checkTools', () => {
    it('should return true if tools exist for win32', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('help'))
      expect(signUtils.checkTools('win32')).toBe(true)
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'signtool',
        ['/?'],
        expect.anything()
      )
    })

    it('should return true if tools exist for darwin', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('version'))
      expect(signUtils.checkTools('darwin')).toBe(true)
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'codesign',
        ['--version'],
        expect.anything()
      )
    })

    it('should return false if tools are missing', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('command not found')
      })
      expect(signUtils.checkTools('win32')).toBe(false)
      expect(signUtils.checkTools('darwin')).toBe(false)
    })

    it('should return false for unknown platform', () => {
      expect(signUtils.checkTools('linux')).toBe(false)
    })
  })

  describe('isSigningEnabled', () => {
    it('should identify when signing is enabled/disabled on macOS', () => {
      expect(signUtils.isSigningEnabled('darwin')).toBe(false)
      process.env.APPLE_ID = 'test@example.com'
      process.env.APPLE_ID_PASSWORD = 'pass'
      process.env.APPLE_TEAM_ID = 'TEAM123'
      process.env.MACOS_CERT_NAME = 'Developer ID Application: Test'
      expect(signUtils.isSigningEnabled('darwin')).toBe(true)
    })

    it('should identify when signing is enabled/disabled on win32', () => {
      expect(signUtils.isSigningEnabled('win32')).toBe(false)
      process.env.SIGNING_CERT_DATA = 'base64data'
      process.env.SIGNING_CERT_PASSWORD = 'pass'
      expect(signUtils.isSigningEnabled('win32')).toBe(true)
    })

    it('should return false for unknown platform', () => {
      expect(signUtils.isSigningEnabled('linux')).toBe(false)
    })
  })

  describe('applyAdHocSignature', () => {
    it('should apply ad-hoc signature using codesign -s -', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('ok'))
      const result = signUtils.applyAdHocSignature('test-bin')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'codesign',
        ['-s', '-', 'test-bin'],
        expect.anything()
      )
      expect(result).toBe(true)
    })

    it('should return false if ad-hoc signature fails', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('failed')
      })
      const result = signUtils.applyAdHocSignature('test-bin')
      expect(result).toBe(false)
    })
  })

  describe('signBinary', () => {
    describe('Windows', () => {
      it('should perform full signing on win32', () => {
        process.env.SIGNING_CERT_DATA = 'YmFzZTY0'
        process.env.SIGNING_CERT_PASSWORD = 'pass'

        mockExecFileSync.mockReturnValue(Buffer.from('ok'))
        mockExistsSync.mockReturnValue(true)

        const result = signUtils.signBinary('test-bin', 'win32')

        expect(mockWriteFileSync).toHaveBeenCalled()
        expect(mockExecFileSync).toHaveBeenCalledWith(
          'signtool',
          [
            'sign',
            '/f',
            expect.stringContaining('temp_cert.pfx'),
            '/p',
            'pass',
            '/tr',
            expect.any(String),
            '/td',
            'sha256',
            '/fd',
            'sha256',
            'test-bin',
          ],
          expect.anything()
        )
        expect(mockUnlinkSync).toHaveBeenCalled()
        expect(result).toBe(true)
      })

      it('should throw error if tools are missing but signing is enabled on win32', () => {
        process.env.SIGNING_CERT_DATA = 'YmFzZTY0'
        process.env.SIGNING_CERT_PASSWORD = 'pass'

        mockExecFileSync.mockImplementation((bin) => {
          if (bin === 'signtool') throw new Error('missing')
          return Buffer.from('ok')
        })

        expect(() => signUtils.signBinary('test-bin', 'win32')).toThrow(
          /Signing tools missing/
        )
      })

      it('should return early if signing is disabled on win32', () => {
        const result = signUtils.signBinary('test-bin', 'win32')
        expect(result).toBe(false)
      })
    })

    describe('macOS', () => {
      it('should perform full notarization on darwin', () => {
        process.env.APPLE_ID = 'id'
        process.env.APPLE_ID_PASSWORD = 'pass'
        process.env.APPLE_TEAM_ID = 'team'
        process.env.MACOS_CERT_NAME = 'cert'

        mockExecFileSync.mockReturnValue(Buffer.from('ok'))

        const result = signUtils.signBinary('test-bin', 'darwin')

        expect(mockExecFileSync).toHaveBeenCalledWith(
          'codesign',
          [
            '--force',
            '--options',
            'runtime',
            '--entitlements',
            expect.stringContaining('Entitlements.plist'),
            '--sign',
            'cert',
            '--timestamp',
            'test-bin',
          ],
          expect.anything()
        )
        expect(mockExecFileSync).toHaveBeenCalledWith(
          'xcrun',
          [
            'notarytool',
            'submit',
            'test-bin',
            '--apple-id',
            'id',
            '--password',
            'pass',
            '--team-id',
            'team',
            '--wait',
          ],
          expect.anything()
        )
        expect(mockExecFileSync).toHaveBeenCalledWith(
          'xcrun',
          ['stapler', 'staple', 'test-bin'],
          expect.anything()
        )
        expect(result).toBe(true)
      })

      it('should fall back to ad-hoc signing on darwin if credentials missing', () => {
        const result = signUtils.signBinary('test-bin', 'darwin')
        expect(mockExecFileSync).toHaveBeenCalledWith(
          'codesign',
          ['-s', '-', 'test-bin'],
          expect.anything()
        )
        expect(result).toBe(true)
      })
    })

    it('should return false for unsupported platform', () => {
      const result = signUtils.signBinary('test-bin', 'linux')
      expect(result).toBe(false)
    })
  })

  describe('verifyBinary', () => {
    it('should verify signature on win32', () => {
      signUtils.verifyBinary('test-bin', 'win32')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'signtool',
        ['verify', '/pa', 'test-bin'],
        expect.anything()
      )
    })

    it('should verify signature on darwin when signing is enabled (certified build)', () => {
      process.env.APPLE_ID = 'id'
      process.env.APPLE_ID_PASSWORD = 'pass'
      process.env.APPLE_TEAM_ID = 'team'
      process.env.MACOS_CERT_NAME = 'cert'

      signUtils.verifyBinary('test-bin', 'darwin')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'spctl',
        ['--assess', '--verbose', '--type', 'execute', 'test-bin'],
        expect.anything()
      )
    })

    it('should verify signature on darwin when signing is disabled (ad-hoc build)', () => {
      signUtils.verifyBinary('test-bin', 'darwin')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'codesign',
        ['--verify', '--verbose', 'test-bin'],
        expect.anything()
      )
    })

    it('should throw error if verification fails', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('verification failed')
      })
      expect(() => signUtils.verifyBinary('test-bin', 'win32')).toThrow(
        /Signature verification failed/
      )
    })
  })
})
