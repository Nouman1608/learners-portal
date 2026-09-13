import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { useAutoHide } from '../../hooks/useAutoHide';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import LoadingSpinner from '../common/LoadingSpinner';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  fileUrl: string;
  className?: string;
  inFullscreen?: boolean;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ fileUrl, className = '', inFullscreen = false }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(0.5);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-hide controls
  const { isVisible: controlsVisible, hideAfterDelay } = useAutoHide({ delay: 3000 });

  const swipeHandlers = useSwipeGesture(
    () => setCurrentPage(prev => Math.min(prev + 1, numPages)),
    () => setCurrentPage(prev => Math.max(prev - 1, 1))
  );

  // Handle mouse movement to show controls
  const handleMouseMove = () => {
    hideAfterDelay();
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    setError('Failed to load PDF. Please try again.');
    setLoading(false);
  };

  const goToPreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, numPages));
  };

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 2.0));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const resetZoom = () => {
    setScale(0.5);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage(prev => Math.max(prev - 1, 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage(prev => Math.min(prev + 1, numPages));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages]);

  return (
    <div className={`flex flex-col h-full ${className}`} onMouseMove={handleMouseMove} onTouchStart={handleMouseMove}>
      {/* Controls - with auto-hide and fade transition */}
      <div
        className={`
          bg-gray-100 border-b border-gray-300 p-2 sm:p-3 flex items-center justify-between flex-shrink-0 gap-2
          transition-opacity duration-200
          ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        {/* Page Navigation */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={goToPreviousPage}
            disabled={currentPage <= 1}
            className="px-2 sm:px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Previous</span>
            <span className="sm:hidden">&lt;</span>
          </button>
          <span className="text-xs sm:text-sm text-gray-700 whitespace-nowrap">
            {currentPage}/{numPages || '...'}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="px-2 sm:px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Next</span>
            <span className="sm:hidden">&gt;</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="px-2 sm:px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            -
          </button>
          <span className="text-xs sm:text-sm text-gray-700 w-10 sm:w-16 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 2.0}
            className="px-2 sm:px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            +
          </button>
          <button
            onClick={resetZoom}
            className="hidden sm:inline-block px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm"
          >
            Reset
          </button>
        </div>
      </div>

      {/* PDF Content - scrollable both directions */}
      <div className={`flex-1 overflow-auto bg-gray-200 ${inFullscreen ? 'p-2' : 'p-2 sm:p-4'}`} {...swipeHandlers}>
        {loading && (
          <div className="flex items-center justify-center min-h-[200px]">
            <LoadingSpinner message="Loading PDF..." />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <div className="text-red-500 mb-2">
                <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        )}

        {!error && (
          <div className="inline-block min-w-full text-center">
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading=""
            >
              <Page
                pageNumber={currentPage}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-lg inline-block"
              />
            </Document>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFViewer;
