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
    // Network is already mocked to fail
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
  describe('Category 5: Ignore List Edge Cases', () => {
    it('safely handles regex look-arounds without crashing', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['/(?<=src\\/)secret/']));
      const { result } = renderHook(() => useIgnoreList());

      await waitFor(() => {
        expect(result.current.compiledIgnores.length).toBeGreaterThan(0);
      });

      const regex = result.current.compiledIgnores[0] as RegExp;
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.source).toContain('(?<=src\\/)secret');
      expect(regex.test('src/secret')).toBe(true);
      expect(regex.test('lib/secret')).toBe(false);
    });

    it('matches literal strings containing regex-like brackets properly', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['file[A-Z].js']));
      const { result } = renderHook(() => useIgnoreList());

      await waitFor(() => {
        expect(result.current.compiledIgnores.length).toBeGreaterThan(0);
      });

      const literal = result.current.compiledIgnores[0];
      // Due to string matching in useFileProcessing, compiledIgnores keeps strings as strings!
      expect(typeof literal).toBe('string');
      expect(literal).toBe('file[A-Z].js'); 
    });

    it('matches unicode and internationalized paths correctly', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['📂folder', '中文.txt']));
      const { result } = renderHook(() => useIgnoreList());

      await waitFor(() => {
        expect(result.current.compiledIgnores.length).toBeGreaterThan(0);
      });

      expect(result.current.compiledIgnores).toContain('📂folder');
      // toLowerCase() behavior on international chars is OS specific, but usually expected
      expect(result.current.compiledIgnores).toContain('中文.txt'.toLowerCase());
    });

    it('deduplicates identical ignore rules to optimize performance', async () => {
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList.length).toBe(DEFAULT_IGNORE_LIST.length);
      });

      const { act } = await import('@testing-library/react');
      
      const originalLength = result.current.ignoreList.length;
      
      act(() => {
        // Adding it twice shouldn't increase size by two if handling identical
        result.current.addIgnoreItem('duplicate.txt');
      });

      let addedLength = 0;
      await waitFor(() => {
        addedLength = result.current.ignoreList.length;
        expect(addedLength).toBe(originalLength + 1);
      });
      
      act(() => {
        result.current.addIgnoreItem('duplicate.txt');
      });

      await waitFor(() => {
        // Size shouldn't change
        expect(result.current.ignoreList.length).toBe(addedLength);
      });
    });
  });

  describe('removeIgnoreItem functionality', () => {
    it('removes item from ignore list', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['item1', 'item2', 'item3']));
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList).toContain('item1');
      });

      const { act } = await import('@testing-library/react');
      
      act(() => {
        result.current.removeIgnoreItem('item2');
      });

      await waitFor(() => {
        expect(result.current.ignoreList).not.toContain('item2');
        expect(result.current.ignoreList).toContain('item1');
        expect(result.current.ignoreList).toContain('item3');
      });
    });

    it('handles removing non-existent item gracefully', async () => {
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList.length).toBeGreaterThan(0);
      });

      const { act } = await import('@testing-library/react');
      const originalLength = result.current.ignoreList.length;
      
      act(() => {
        result.current.removeIgnoreItem('non-existent-item');
      });

      await waitFor(() => {
        expect(result.current.ignoreList.length).toBe(originalLength);
      });
    });

    it('persists removal to localStorage', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['keep', 'remove']));
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList).toContain('remove');
      });

      const { act } = await import('@testing-library/react');
      
      act(() => {
        result.current.removeIgnoreItem('remove');
      });

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('concatenate-ignore') || '[]');
        expect(saved).not.toContain('remove');
        expect(saved).toContain('keep');
      });
    });
  });

  describe('addIgnoreItem edge cases', () => {
    it('trims whitespace from new items', async () => {
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList.length).toBeGreaterThan(0);
      });

      const { act } = await import('@testing-library/react');
      
      act(() => {
        result.current.addIgnoreItem('  spaced-item  ');
      });

      await waitFor(() => {
        expect(result.current.ignoreList).toContain('spaced-item');
        expect(result.current.ignoreList).not.toContain('  spaced-item  ');
      });
    });

    it('does not add empty strings', async () => {
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList.length).toBeGreaterThan(0);
      });

      const { act } = await import('@testing-library/react');
      const originalLength = result.current.ignoreList.length;
      
      act(() => {
        result.current.addIgnoreItem('');
        result.current.addIgnoreItem('   ');
      });

      await waitFor(() => {
        expect(result.current.ignoreList.length).toBe(originalLength);
      });
    });

    it('adds items in sorted order', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['zebra', 'apple']));
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList).toEqual(['apple', 'zebra']);
      });

      const { act } = await import('@testing-library/react');
      
      act(() => {
        result.current.addIgnoreItem('mango');
      });

      await waitFor(() => {
        expect(result.current.ignoreList).toEqual(['apple', 'mango', 'zebra']);
      });
    });
  });

  describe('server synchronization', () => {
    it('fetches ignore list from server on mount when available', async () => {
      const serverList = ['server-item1', 'server-item2'];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(serverList)
      });

      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList).toEqual(['server-item1', 'server-item2']);
      });
    });

    it('saves ignore list to server when modified', async () => {
      // Mock: initial fetch fails (triggers defaults), then save succeeds
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false }) // initial fetch fails -> defaults load
        .mockResolvedValue({ ok: true }); // save succeeds
      global.fetch = fetchMock;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const { result } = renderHook(() => useIgnoreList());
      
      // Wait for defaults to load
      await waitFor(() => {
        expect(result.current.ignoreList.length).toBeGreaterThan(0);
      });

      const { act } = await import('@testing-library/react');
      
      act(() => {
        result.current.addIgnoreItem('new-server-item');
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/ignore-list',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
      
      consoleSpy.mockRestore();
    });

    it('handles server fetch network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      localStorage.setItem('concatenate-ignore', JSON.stringify(['cached-item']));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList).toContain('cached-item');
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('handles server save errors gracefully', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false }) // initial fetch
        .mockRejectedValueOnce(new Error('Save failed')); // save attempt

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList.length).toBeGreaterThan(0);
      });

      const { act } = await import('@testing-library/react');
      
      act(() => {
        result.current.addIgnoreItem('test-item');
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to save'),
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it('handles malformed server response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve('not-an-array')
      });

      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        // Should fall back to defaults
        expect(result.current.ignoreList.length).toBe(DEFAULT_IGNORE_LIST.length);
      });
    });

    it('skips server save when ignoreList is empty', async () => {
      const { act } = await import('@testing-library/react');
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      global.fetch = fetchMock;

      await act(async () => {
        renderHook(() => useIgnoreList());
      });
      
      // Wait for all effects to settle
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      
      // POST should not be called with empty list (since server returns empty array, ignoreList stays empty)
      const postCalls = fetchMock.mock.calls.filter(call => call[1]?.method === 'POST');
      expect(postCalls.length).toBe(0);
    });
  });

  describe('compiledIgnores edge cases', () => {
    it('handles regex with empty flags', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['/pattern/']));
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.compiledIgnores.length).toBeGreaterThan(0);
      });

      const regex = result.current.compiledIgnores[0] as RegExp;
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.source).toBe('pattern');
      expect(regex.flags).toBe('');
    });

    it('handles regex with multiple flags', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['/test/gim']));
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.compiledIgnores.length).toBeGreaterThan(0);
      });

      const regex = result.current.compiledIgnores[0] as RegExp;
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.flags).toContain('i');
      expect(regex.flags).toContain('g');
      expect(regex.flags).toContain('m');
    });

    it('handles special regex characters in pattern body', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['/\\d+\.test$/']));
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.compiledIgnores.length).toBeGreaterThan(0);
      });

      const regex = result.current.compiledIgnores[0] as RegExp;
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test('123.test')).toBe(true);
      expect(regex.test('abc.test')).toBe(false);
    });

    it('compiles ignores reactively when ignoreList changes', async () => {
      const { result } = renderHook(() => useIgnoreList());
      
      await waitFor(() => {
        expect(result.current.ignoreList.length).toBeGreaterThan(0);
      });

      const originalCompiledCount = result.current.compiledIgnores.length;

      const { act } = await import('@testing-library/react');
      
      act(() => {
        result.current.addIgnoreItem('/new-regex/i');
      });

      await waitFor(() => {
        expect(result.current.compiledIgnores.length).toBe(originalCompiledCount + 1);
        // Find the RegExp in the compiled list (list is sorted, so position varies)
        const regexItem = result.current.compiledIgnores.find(item => item instanceof RegExp && item.source === 'new-regex');
        expect(regexItem).toBeInstanceOf(RegExp);
        expect((regexItem as RegExp).ignoreCase).toBe(true);
      });
    });
  });
});

