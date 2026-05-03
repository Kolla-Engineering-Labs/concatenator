/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// For Node built-ins in ESM, vi.mock often fails to intercept internal imports of other modules.
// Using vi.doMock + dynamic import is more reliable for this case.

describe('sign-utils', () => {
  let signUtils: any
  let mockExecSync: any
  let mockWriteFileSync: any
  let mockUnlinkSync: any
  let mockExistsSync: any

  beforeAll(async () => {
    mockExecSync = vi.fn()
    vi.doMock('child_process', () => ({
      execSync: mockExecSync,
      default: { execSync: mockExecSync },
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
      mockExecSync.mockReturnValue(Buffer.from('help'))
      expect(signUtils.checkTools('win32')).toBe(true)
      expect(mockExecSync).toHaveBeenCalledWith(
        'signtool /?',
        expect.anything()
      )
    })

    it('should return true if tools exist for darwin', () => {
      mockExecSync.mockReturnValue(Buffer.from('version'))
      expect(signUtils.checkTools('darwin')).toBe(true)
      expect(mockExecSync).toHaveBeenCalledWith(
        'codesign --version',
        expect.anything()
      )
    })

    it('should return false if tools are missing', () => {
      mockExecSync.mockImplementation(() => {
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
      mockExecSync.mockReturnValue(Buffer.from('ok'))
      const result = signUtils.applyAdHocSignature('test-bin')
      expect(mockExecSync).toHaveBeenCalledWith(
        'codesign -s - "test-bin"',
        expect.anything()
      )
      expect(result).toBe(true)
    })

    it('should return false if ad-hoc signature fails', () => {
      mockExecSync.mockImplementation(() => {
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

        mockExecSync.mockReturnValue(Buffer.from('ok'))
        mockExistsSync.mockReturnValue(true)

        const result = signUtils.signBinary('test-bin', 'win32')

        expect(mockWriteFileSync).toHaveBeenCalled()
        expect(mockExecSync).toHaveBeenCalledWith(
          expect.stringContaining('signtool sign /f'),
          expect.anything()
        )
        expect(mockUnlinkSync).toHaveBeenCalled()
        expect(result).toBe(true)
      })

      it('should throw error if tools are missing but signing is enabled on win32', () => {
        process.env.SIGNING_CERT_DATA = 'YmFzZTY0'
        process.env.SIGNING_CERT_PASSWORD = 'pass'

        mockExecSync.mockImplementation((cmd) => {
          if (cmd.includes('signtool /?')) throw new Error('missing')
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

        mockExecSync.mockReturnValue(Buffer.from('ok'))

        const result = signUtils.signBinary('test-bin', 'darwin')

        expect(mockExecSync).toHaveBeenCalledWith(
          expect.stringContaining('codesign --force --options runtime'),
          expect.anything()
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          expect.stringContaining('notarytool submit'),
          expect.anything()
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          expect.stringContaining('stapler staple'),
          expect.anything()
        )
        expect(result).toBe(true)
      })

      it('should fall back to ad-hoc signing on darwin if credentials missing', () => {
        const result = signUtils.signBinary('test-bin', 'darwin')
        expect(mockExecSync).toHaveBeenCalledWith(
          'codesign -s - "test-bin"',
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
      expect(mockExecSync).toHaveBeenCalledWith(
        'signtool verify /pa "test-bin"',
        expect.anything()
      )
    })

    it('should verify signature on darwin', () => {
      signUtils.verifyBinary('test-bin', 'darwin')
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('spctl --assess'),
        expect.anything()
      )
    })

    it('should throw error if verification fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('verification failed')
      })
      expect(() => signUtils.verifyBinary('test-bin', 'win32')).toThrow(
        /Signature verification failed/
      )
    })
  })
})
