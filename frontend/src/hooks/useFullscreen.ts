import { useState, useEffect, useCallback, useRef } from 'react';

interface UseFullscreenReturn {
  isFullscreen: boolean;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
}

/**
 * Hook to manage fullscreen state using the browser Fullscreen API
 * @param elementRef Optional ref to element to make fullscreen (defaults to document.documentElement)
 * @returns Object with fullscreen state and control functions
 */
export function useFullscreen(elementRef?: React.RefObject<HTMLElement>): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const requestedFullscreenRef = useRef(false);

  // Update fullscreen state based on document state
  const updateFullscreenState = useCallback(() => {
    const fullscreenElement =
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement;

    setIsFullscreen(!!fullscreenElement);
  }, []);

  // Enter fullscreen mode
  const enterFullscreen = useCallback(async () => {
    try {
      const element = elementRef?.current || document.documentElement;
      requestedFullscreenRef.current = true;

      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) {
        await (element as any).mozRequestFullScreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      }
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
      requestedFullscreenRef.current = false;
    }
  }, [elementRef]);

  // Exit fullscreen mode
  const exitFullscreen = useCallback(async () => {
    try {
      requestedFullscreenRef.current = false;

      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.error('Failed to exit fullscreen:', error);
    }
  }, []);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Listen for fullscreen changes
  useEffect(() => {
    const events = [
      'fullscreenchange',
      'webkitfullscreenchange',
      'mozfullscreenchange',
      'MSFullscreenChange',
    ];

    events.forEach(event => {
      document.addEventListener(event, updateFullscreenState);
    });

    // Initial state check
    updateFullscreenState();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateFullscreenState);
      });
    };
  }, [updateFullscreenState]);

  return {
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
