/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { DEFAULT_IGNORE_LIST } from '../constants';

/**
 * Custom hook to manage the ignore list state, including persistence to localStorage and server.
 */
export const useIgnoreList = () => {
  const [ignoreList, setIgnoreList] = useState<string[]>([]);

  // Fetch ignore list from server on mount
  useEffect(() => {
    const fetchIgnoreList = async () => {
      try {
        const response = await fetch('/api/ignore-list');
        if (response.ok) {
          const list = await response.json();
          if (Array.isArray(list)) {
            setIgnoreList(list.sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
            return;
          }
        }
      } catch (error) {
        console.error('Failed to fetch ignore list from server:', error);
      }

      // Fallback to localStorage if server fetch fails
      const saved = localStorage.getItem('concatenate-ignore');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setIgnoreList(parsed.sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
          }
        } catch (e) {
          console.error("Local storage 'concatenate-ignore' JSON is corrupted. Restoring default ignore list and overwriting old data.");
          window.alert("Your custom ignore list was corrupted and has been reset to defaults.");
          setIgnoreList([...DEFAULT_IGNORE_LIST].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
        }
      } else {
        setIgnoreList([...DEFAULT_IGNORE_LIST].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
      }
    };

    fetchIgnoreList();
  }, []);

  // Save ignore list to server and localStorage when it changes
  useEffect(() => {
    if (ignoreList.length === 0) return;

    localStorage.setItem('concatenate-ignore', JSON.stringify(ignoreList));
    
    const saveToServer = async () => {
      try {
        await fetch('/api/ignore-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ignoreList)
        });
      } catch (error) {
        console.error('Failed to save ignore list to server:', error);
      }
    };
    
    saveToServer();
  }, [ignoreList]);

  const compiledIgnores = useMemo(() => {
    return ignoreList.map(pattern => {
      if (pattern.startsWith('/')) {
        const lastSlash = pattern.lastIndexOf('/');
        if (lastSlash > 0) {
          const body = pattern.slice(1, lastSlash);
          const flags = pattern.slice(lastSlash + 1);
          try {
            return new RegExp(body, flags);
          } catch (e) {
            return pattern; // Fall back to literal match without lowercasing
          }
        }
      }
      return pattern; // String matches are exact and case-sensitive now
    });
  }, [ignoreList]);

  const addIgnoreItem = (item: string) => {
    const trimmed = item.trim();
    if (trimmed && !ignoreList.includes(trimmed)) {
      const next = [...ignoreList, trimmed].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      setIgnoreList(next);
    }
  };

  const removeIgnoreItem = (item: string) => {
    setIgnoreList(prev => prev.filter(i => i !== item));
  };

  return {
    ignoreList,
    compiledIgnores,
    addIgnoreItem,
    removeIgnoreItem
  };
};
