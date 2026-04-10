import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useIgnoreList } from '../src/hooks/useIgnoreList';
import { DEFAULT_IGNORE_LIST } from '../src/constants';

describe('useIgnoreList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve([])
    });
  });

  it('falls back to default list when network and cache fail', async () => {
    // Network is already mocekd to fail
    const { result } = renderHook(() => useIgnoreList());

    await waitFor(() => {
      // The length might be slightly different depending on default list but it should populate
      expect(result.current.ignoreList.length).toBe(DEFAULT_IGNORE_LIST.length);
    });
  });

  it('compiles string patterns to correct lowercase comparisons', async () => {
    const { result } = renderHook(() => useIgnoreList());
    
    await waitFor(() => {
        expect(result.current.ignoreList.length).toBeGreaterThan(0);
    });

    const compiled = result.current.compiledIgnores;
    // Check if '.git' was lowercased string
    expect(compiled).toContain('.git');
  });

  it('safely handles invalid regex syntax falling back to string match', async () => {
    const { result } = renderHook(() => useIgnoreList());

    // Wait for initial load
    await waitFor(() => {
        expect(result.current.ignoreList.length).toBeGreaterThan(0);
    });

    const { act } = await import('@testing-library/react');
    
    // Mock an invalid regex path added to the list: e.g. unclosed group
    act(() => {
      result.current.addIgnoreItem('/[invalid/');
    });

    await waitFor(() => {
      // should fallback to treating it as literal string `"/[invalid/"` (lowercased)
      expect(result.current.compiledIgnores).toContain('/[invalid/');
    });
  });

  it('restores defaults and alerts user if localStorage encounters corrupted JSON parsing errors (Edge Case 38)', async () => {
    localStorage.setItem('concatenate-ignore', '{ broken: JSON ');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { result } = renderHook(() => useIgnoreList());

    await waitFor(() => {
      expect(result.current.ignoreList.length).toBe(DEFAULT_IGNORE_LIST.length);
    });
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("corrupted"));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("corrupted"));
    
    consoleSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('respects case-sensitivity for regex and strings unless "i" flag is provided (Edge Case 35 fix)', async () => {
    localStorage.setItem('concatenate-ignore', JSON.stringify(['/Debug/', '/insensitive/i']));
    const { result } = renderHook(() => useIgnoreList());

    await waitFor(() => {
      expect(result.current.compiledIgnores.length).toBe(2);
    });

    const regex1 = result.current.compiledIgnores[0] as RegExp;
    expect(regex1).toBeInstanceOf(RegExp);
    expect(regex1.ignoreCase).toBe(false); // Should NOT force case-insensitivity
    expect(regex1.test('debug/file.js')).toBe(false);
    expect(regex1.test('Debug/file.js')).toBe(true);
    
    const regex2 = result.current.compiledIgnores[1] as RegExp;
    expect(regex2.ignoreCase).toBe(true);
    expect(regex2.test('INSENSITIVE/file.js')).toBe(true);
  });
});
