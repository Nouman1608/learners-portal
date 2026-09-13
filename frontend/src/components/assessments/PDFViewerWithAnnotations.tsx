import React, { useState, useEffect, useRef } from 'react';
import { assessmentsApi } from '../../api/assessments.api';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../common/LoadingSpinner';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFViewerWithAnnotationsProps {
  fileUrl: string;
  resultId: string;
  onClose: () => void;
}

interface LocalAnnotation {
  pageNumber: number;
  annotationType: string;
  annotationData: any;
  id?: string;
}

// Get initial scale based on screen size
const getInitialScale = () => {
  if (typeof window === 'undefined') return 1.5;
  const width = window.innerWidth;
  if (width < 640) return 0.8; // Mobile
  if (width < 1024) return 1.0; // Tablet
  return 1.5; // Desktop
};

const PDFViewerWithAnnotations: React.FC<PDFViewerWithAnnotationsProps> = ({ fileUrl, resultId, onClose }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [annotations, setAnnotations] = useState<LocalAnnotation[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [scale, setScale] = useState<number>(getInitialScale());
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);

  const absoluteFileUrl = fileUrl.startsWith('http') ? fileUrl : window.location.origin + fileUrl;

  console.log('PDFViewerWithAnnotations rendering with fileUrl:', fileUrl);

  // Load PDF document
  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true);
        console.log('Loading PDF from:', absoluteFileUrl);

        const loadingTask = pdfjsLib.getDocument(absoluteFileUrl);
        const pdf = await loadingTask.promise;

        console.log('PDF loaded successfully. Pages:', pdf.numPages);
        setPdfDocument(pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (error) {
        console.error('Error loading PDF:', error);
        setLoading(false);
      }
    };

    loadPDF();
  }, [absoluteFileUrl]);

  // Render current page
  useEffect(() => {
    if (!pdfDocument || !pdfCanvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(currentPage);

        // Use consistent scale calculation - matching PDFAnnotator
        const viewport = page.getViewport({ scale });

        const canvas = pdfCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Update annotation canvas to match
        if (annotationCanvasRef.current) {
          annotationCanvasRef.current.height = viewport.height;
          annotationCanvasRef.current.width = viewport.width;
        }

        // Store canvas dimensions (use internal dimensions since we're not CSS scaling)
        setCanvasDimensions({ width: viewport.width, height: viewport.height });

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        console.log('Page rendered:', currentPage, 'at scale:', scale);

        // Redraw annotations after page renders
        redrawAnnotationCanvas();
      } catch (error) {
        console.error('Error rendering page:', error);
      }
    };

    renderPage();
  }, [pdfDocument, currentPage, scale]);

  // Load annotations
  useEffect(() => {
    loadAnnotations();
  }, [resultId]);

  const loadAnnotations = async () => {
    try {
      const loadedAnnotations = await assessmentsApi.getAnnotations(resultId);
      setAnnotations(loadedAnnotations.map(ann => ({
        pageNumber: ann.pageNumber,
        annotationType: ann.annotationType,
        annotationData: ann.annotationData,
        id: ann.id,
      })));
      console.log('Loaded annotations:', loadedAnnotations.length);
    } catch (error) {
      console.error('Error loading annotations:', error);
    }
  };

  // Helper: Denormalize path from 0-1 range to canvas pixels
  const denormalizePath = (normalizedPath: string, width: number, height: number): string => {
    return normalizedPath.replace(/([ML])\s*([\d.]+)\s+([\d.]+)/g, (_match, cmd, x, y) => {
      return `${cmd} ${parseFloat(x) * width} ${parseFloat(y) * height}`;
    });
  };

  const redrawAnnotationCanvas = () => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw annotations for current page only
    const pageAnnotations = annotations.filter(ann => ann.pageNumber === currentPage);

    pageAnnotations.forEach((annotation) => {
      if (annotation.annotationType === 'drawing') {
        ctx.strokeStyle = annotation.annotationData.strokeColor || '#FF0000';
        ctx.lineWidth = annotation.annotationData.strokeWidth || 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Denormalize path coordinates
        const denormalizedPath = denormalizePath(
          annotation.annotationData.path,
          canvas.width,
          canvas.height
        );
        drawPath(ctx, denormalizedPath);
      } else if (annotation.annotationType === 'highlight') {
        // Denormalize highlight coordinates
        const denormalized = {
          ...annotation.annotationData,
          position: {
            x: annotation.annotationData.position.x * canvas.width,
            y: annotation.annotationData.position.y * canvas.height,
          },
          width: annotation.annotationData.width * canvas.width,
          height: annotation.annotationData.height * canvas.height,
        };
        drawHighlight(ctx, denormalized);
      }
    });
  };

  // Redraw annotations when they change
  useEffect(() => {
    redrawAnnotationCanvas();
  }, [annotations, currentPage]);

  const drawPath = (ctx: CanvasRenderingContext2D, pathData: string) => {
    const path = new Path2D(pathData);
    ctx.stroke(path);
  };

  const drawHighlight = (ctx: CanvasRenderingContext2D, data: any) => {
    ctx.fillStyle = data.color;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(data.position.x, data.position.y, data.width, data.height);
    ctx.globalAlpha = 1.0;
  };

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= numPages) {
      setCurrentPage(pageNum);
    }
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));

  const swipeHandlers = useSwipeGesture(
    () => goToPage(currentPage + 1),
    () => goToPage(currentPage - 1)
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPage(currentPage - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToPage(currentPage + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, numPages]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[95vh] sm:h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-2 sm:p-4 border-b bg-gray-50">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-base sm:text-xl font-semibold text-gray-900 truncate">Annotated Submission</h2>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Page Navigation and Zoom Controls */}
        <div className="px-2 sm:px-4 py-2 border-b bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-2">
          {/* Page Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-2 sm:px-3 sm:py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <span className="text-sm text-gray-700">
              {currentPage} / {numPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= numPages}
              className="p-2 sm:px-3 sm:py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={zoomOut}
              className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              −
            </button>
            <span className="text-xs sm:text-sm text-gray-700 w-12 text-center">{Math.round(scale * 100)}%</span>
            <button
              onClick={zoomIn}
              className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              +
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div className="flex-1 overflow-auto bg-gray-200 relative" {...swipeHandlers}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-30">
              <LoadingSpinner message="Loading PDF..." />
            </div>
          )}

          {!loading && (
            <div className="flex items-center justify-center p-4">
              <div className="relative inline-block shadow-lg">
                {/* PDF Canvas */}
                <canvas
                  ref={pdfCanvasRef}
                  className="block"
                />

                {/* Annotation Canvas Overlay (read-only) */}
                <canvas
                  ref={annotationCanvasRef}
                  className="absolute top-0 left-0 pointer-events-none"
                />

                {/* Text annotations overlay */}
                {canvasDimensions.width > 0 && annotations
                  .filter(ann => ann.annotationType === 'text' && ann.pageNumber === currentPage)
                  .map((ann, idx) => (
                    <div
                      key={ann.id || idx}
                      className="absolute pointer-events-none"
                      style={{
                        left: ann.annotationData.position.x * canvasDimensions.width,
                        top: ann.annotationData.position.y * canvasDimensions.height,
                        fontSize: ann.annotationData.fontSize,
                        color: ann.annotationData.color,
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: `2px solid ${ann.annotationData.color}`,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        fontWeight: 500,
                      }}
                    >
                      {ann.annotationData.content}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {annotations.length === 0 && !loading && (
          <div className="p-4 bg-yellow-50 border-t border-yellow-200">
            <p className="text-sm text-yellow-800 text-center">
              No annotations from teacher yet
            </p>
          </div>
        )}

        {annotations.length > 0 && (
          <div className="p-4 bg-blue-50 border-t border-blue-200">
            <p className="text-sm text-blue-800 text-center">
              This submission has {annotations.length} annotation{annotations.length > 1 ? 's' : ''} from your teacher
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFViewerWithAnnotations;
