/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DEFAULT_IGNORE_LIST } from '../constants';
import { logger } from '../lib/logger';

/**
 * Custom hook to manage the ignore list state, including persistence to localStorage and server.
 */
export const useIgnoreList = () => {
  const [ignoreList, setIgnoreList] = useState<string[]>([]);
  const isUserModified = useRef(false);

  // Fetch ignore list from server on mount
  useEffect(() => {
    const fetchIgnoreList = async () => {
      try {
        const response = await fetch('/api/ignore-list');
        if (response.ok) {
          const list = await response.json();
          if (Array.isArray(list)) {
            // Don't overwrite if user has already modified the list
            if (!isUserModified.current) {
              setIgnoreList(list.sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
            }
            return;
          }
        }
      } catch (error) {
        logger.error('Failed to fetch ignore list from server:', error);
      }

      // Fallback to localStorage if server fetch fails
      const saved = localStorage.getItem('concatenate-ignore');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            // Don't overwrite if user has already modified the list
            if (!isUserModified.current) {
              setIgnoreList(parsed.sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
            }
          }
        } catch (e) {
          logger.error("Local storage 'concatenate-ignore' JSON is corrupted. Restoring default ignore list and overwriting old data.");
          window.alert("Your custom ignore list was corrupted and has been reset to defaults.");
          setIgnoreList([...DEFAULT_IGNORE_LIST].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
        }
      } else {
        // Only set defaults if user hasn't modified and no saved data exists
        if (!isUserModified.current) {
          setIgnoreList([...DEFAULT_IGNORE_LIST].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
        }
      }
    };

    fetchIgnoreList();
  }, []);

  // Save ignore list to server and localStorage when it changes
  useEffect(() => {
    if (ignoreList.length === 0) return;
    if (!isUserModified.current) return;

    localStorage.setItem('concatenate-ignore', JSON.stringify(ignoreList));
    
    const saveToServer = async () => {
      try {
        await fetch('/api/ignore-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ignoreList)
        });
      } catch (error) {
        logger.error('Failed to save ignore list to server:', error);
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

  const addIgnoreItem = useCallback((item: string) => {
    const trimmed = item.trim();
    if (!trimmed) return;
    
    isUserModified.current = true;
    setIgnoreList(prev => {
      if (prev.includes(trimmed)) {
        return prev;
      }
      const next = [...prev, trimmed].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return next;
    });
  }, []);

  const removeIgnoreItem = (item: string) => {
    isUserModified.current = true;
    setIgnoreList(prev => prev.filter(i => i !== item));
  };

  return {
    ignoreList,
    compiledIgnores,
    addIgnoreItem,
    removeIgnoreItem
  };
};
