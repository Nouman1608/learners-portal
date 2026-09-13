import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAutoHideOptions {
  delay?: number; // Delay in ms before hiding (default: 3000)
  initialVisible?: boolean; // Initial visibility state (default: true)
}

interface UseAutoHideReturn {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  hideAfterDelay: () => void;
}

/**
 * Hook to manage auto-hide state for control bars
 * @param options Configuration options
 * @returns Object with visibility state and control functions
 */
export function useAutoHide(options: UseAutoHideOptions = {}): UseAutoHideReturn {
  const { delay = 3000, initialVisible = true } = options;
  const [isVisible, setIsVisible] = useState(initialVisible);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timeout
  const clearHideTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Show immediately
  const show = useCallback(() => {
    clearHideTimeout();
    setIsVisible(true);
  }, [clearHideTimeout]);

  // Hide immediately
  const hide = useCallback(() => {
    clearHideTimeout();
    setIsVisible(false);
  }, [clearHideTimeout]);

  // Hide after the specified delay
  const hideAfterDelay = useCallback(() => {
    clearHideTimeout();
    setIsVisible(true);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, delay);
  }, [delay, clearHideTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, [clearHideTimeout]);

  return {
    isVisible,
    show,
    hide,
    hideAfterDelay,
  };
}
