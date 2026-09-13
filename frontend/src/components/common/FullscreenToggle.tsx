import React from 'react';
import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';

interface FullscreenToggleProps {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Reusable button component for toggling fullscreen mode
 */
export const FullscreenToggle: React.FC<FullscreenToggleProps> = ({
  isFullscreen,
  onToggle,
  className = '',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <button
      onClick={onToggle}
      className={`
        ${sizeClasses[size]}
        bg-gray-800 hover:bg-gray-700 text-white rounded-lg
        shadow-lg transition-all duration-200 hover:scale-105
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
        ${className}
      `}
      title={isFullscreen ? 'Exit fullscreen (ESC)' : 'Enter fullscreen'}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {isFullscreen ? (
        <ArrowsPointingInIcon className={iconSizes[size]} />
      ) : (
        <ArrowsPointingOutIcon className={iconSizes[size]} />
      )}
    </button>
  );
};
