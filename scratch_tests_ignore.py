import re

with open("c:/Projects/Kolla-Engineering-Labs/concatenator/tests/useIgnoreList.test.ts", "r", encoding="utf-8") as f:
    original_content = f.read()

lines = original_content.rstrip().split("\n")
if lines[-1] == "});":
    base_content = "\n".join(lines[:-1])
else:
    print("Format not as expected")
    exit(1)

new_tests = """
  describe('Category 5: Ignore List Edge Cases', () => {
    it('safely handles regex look-arounds without crashing', async () => {
      localStorage.setItem('concatenate-ignore', JSON.stringify(['/(?<=src\\\\/)secret/']));
      const { result } = renderHook(() => useIgnoreList());

      await waitFor(() => {
        expect(result.current.compiledIgnores.length).toBeGreaterThan(0);
      });

      const regex = result.current.compiledIgnores[0] as RegExp;
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.source).toContain('(?<=src\\\\/)secret');
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
      expect(literal).toBe('file[A-Z].js'.toLowerCase()); 
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
"""

final_content = base_content + new_tests + "\n});\n"

with open("c:/Projects/Kolla-Engineering-Labs/concatenator/tests/useIgnoreList.test.ts", "w", encoding="utf-8") as f:
    f.write(final_content)

print("Injected new tests into useIgnoreList.test.ts")
