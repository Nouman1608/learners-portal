import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface CollapsibleSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  position: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
  width?: string;
}

/**
 * Collapsible sidebar component with animated slide transition
 */
export const CollapsibleSidebar: React.FC<CollapsibleSidebarProps> = ({
  isOpen,
  onToggle,
  position,
  children,
  className = '',
  width = 'w-full lg:w-1/3',
}) => {
  const isLeft = position === 'left';
  const slideClass = isOpen
    ? 'translate-x-0'
    : isLeft
    ? '-translate-x-full'
    : 'translate-x-full';

  return (
    <>
      {/* Sidebar */}
      <div
        className={`
          ${width}
          ${slideClass}
          transition-transform duration-300 ease-in-out
          ${className}
        `}
      >
        {children}
      </div>

      {/* Toggle button - positioned absolutely when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className={`
            fixed ${isLeft ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2
            z-50 p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg
            shadow-lg transition-all duration-200 hover:scale-105
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
          `}
          title={`Show ${isLeft ? 'student list' : 'submission form'}`}
          aria-label={`Show ${isLeft ? 'student list' : 'submission form'}`}
        >
          {isLeft ? (
            <ChevronRightIcon className="h-5 w-5" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5" />
          )}
        </button>
      )}

      {/* Toggle button inside sidebar when open */}
      {isOpen && (
        <button
          onClick={onToggle}
          className={`
            absolute ${isLeft ? 'left-2' : 'right-2'} top-4
            z-10 p-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg
            shadow-md transition-all duration-200 hover:scale-105
            focus:outline-none focus:ring-2 focus:ring-indigo-500
          `}
          title={`Hide ${isLeft ? 'student list' : 'submission form'}`}
          aria-label={`Hide ${isLeft ? 'student list' : 'submission form'}`}
        >
          {isLeft ? (
            <ChevronLeftIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </button>
      )}
    </>
  );
};
