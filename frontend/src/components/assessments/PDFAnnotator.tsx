import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { assessmentsApi } from '../../api/assessments.api';
import * as pdfjsLib from 'pdfjs-dist';
import { useAutoHide } from '../../hooks/useAutoHide';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { PencilIcon, ChatBubbleLeftIcon, SwatchIcon, ArrowUturnLeftIcon, TrashIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import ConfirmDialog from '../common/ConfirmDialog';
import LoadingSpinner from '../common/LoadingSpinner';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

type AnnotationTool = 'none' | 'draw' | 'text' | 'highlight';

interface LocalAnnotation {
  pageNumber: number;
  annotationType: string;
  annotationData: any;
  id?: string;
}

interface PDFAnnotatorProps {
  fileUrl: string;
  resultId: string;
  onSave?: () => void;
  className?: string;
  inFullscreen?: boolean;
}

// Detect if device has touch capability
const isTouchDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// Get initial scale based on screen size
const getInitialScale = () => {
  if (typeof window === 'undefined') return 1.5;
  const width = window.innerWidth;
  if (width < 640) return 0.8; // Mobile
  if (width < 1024) return 1.0; // Tablet
  return 1.5; // Desktop
};

const PDFAnnotator: React.FC<PDFAnnotatorProps> = ({ fileUrl, resultId, onSave, className = '', inFullscreen = false }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [selectedTool, setSelectedTool] = useState<AnnotationTool>('none');
  const [currentColor, setCurrentColor] = useState<string>('#FF0000');
  const [annotations, setAnnotations] = useState<LocalAnnotation[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [scale, setScale] = useState<number>(getInitialScale());
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isTouch, setIsTouch] = useState<boolean>(false);
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs for optimized drawing (avoid state updates on every touchmove)
  const currentDrawingRef = useRef<string>('');
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Detect touch device on mount
  useEffect(() => {
    setIsTouch(isTouchDevice());
  }, []);

  // Auto-hide for toolbar and bottom bar (disabled on touch devices)
  const { isVisible: toolbarVisible, hideAfterDelay: hideToolbarAfterDelay } = useAutoHide({ delay: 3000 });
  const { isVisible: bottomBarVisible, hideAfterDelay: hideBottomBarAfterDelay } = useAutoHide({ delay: 3000 });

  // On touch devices, controls are always visible
  const showToolbar = isTouch || toolbarVisible;
  const showBottomBar = isTouch || bottomBarVisible;

  // Handle mouse movement to track position and show/hide controls (only on non-touch devices)
  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouch || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;

    // Show toolbar if mouse is near top (within 50px)
    if (y < 50) {
      hideToolbarAfterDelay();
    }

    // Show bottom bar if mouse is near bottom (within 50px)
    if (y > rect.height - 50) {
      hideBottomBarAfterDelay();
    }
  };

  const absoluteFileUrl = fileUrl.startsWith('http') ? fileUrl : window.location.origin + fileUrl;

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
        toast.error('Failed to load PDF');
        setLoading(false);
      }
    };

    loadPDF();
  }, [absoluteFileUrl]);

  // Render current page
  useEffect(() => {
    if (!pdfDocument || !pdfCanvasRef.current || !containerRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(currentPage);

        // Calculate scale to fit container width while maintaining aspect ratio
        const containerWidth = containerRef.current!.clientWidth - 32; // Subtract padding
        const pageViewport = page.getViewport({ scale: 1 });
        const calculatedScale = Math.min(scale, containerWidth / pageViewport.width);
        const viewport = page.getViewport({ scale: calculatedScale });

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
        console.log('Page rendered:', currentPage, 'at scale:', calculatedScale);

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

  // Helper: Normalize path from canvas pixels to 0-1 range
  const normalizePath = (path: string, width: number, height: number): string => {
    return path.replace(/([ML])\s*([\d.]+)\s+([\d.]+)/g, (_match, cmd, x, y) => {
      return `${cmd} ${parseFloat(x) / width} ${parseFloat(y) / height}`;
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
        ctx.strokeStyle = annotation.annotationData.strokeColor || currentColor;
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

  // Helper to get coordinates from pointer event
  const getPointerCoordinates = (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
    rect: DOMRect
  ) => {
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    return { x, y };
  };

  // Unified pointer event handlers (works for mouse, touch, and pen/stylus)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (selectedTool === 'draw') {
      // Prevent default to avoid scrolling and ensure we capture the pointer
      e.preventDefault();
      e.stopPropagation();

      // Capture pointer to receive events even if pointer leaves canvas
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

      setIsDrawing(true);
      const canvas = annotationCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (rect && canvas) {
        const { x, y } = getPointerCoordinates(e, canvas, rect);
        currentDrawingRef.current = `M ${x} ${y}`;
        lastPointRef.current = { x, y };
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawing && selectedTool === 'draw') {
      e.preventDefault();
      e.stopPropagation();

      const canvas = annotationCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (rect && canvas) {
        const { x, y } = getPointerCoordinates(e, canvas, rect);

        // Cancel any pending animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        // Use requestAnimationFrame for smooth drawing
        animationFrameRef.current = requestAnimationFrame(() => {
          const ctx = canvas.getContext('2d');
          if (ctx && lastPointRef.current) {
            // Draw only the new segment (from last point to current point)
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
            ctx.lineTo(x, y);
            ctx.stroke();
          }

          // Update refs (not state) for performance
          currentDrawingRef.current += ` L ${x} ${y}`;
          lastPointRef.current = { x, y };
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Release pointer capture
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);

    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (isDrawing && currentDrawingRef.current) {
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;

      // Normalize path coordinates to 0-1 range
      const normalizedPath = normalizePath(currentDrawingRef.current, canvas.width, canvas.height);

      const newAnnotation: LocalAnnotation = {
        pageNumber: currentPage,
        annotationType: 'drawing',
        annotationData: {
          type: 'drawing',
          path: normalizedPath,
          strokeColor: currentColor,
          strokeWidth: 3,
        },
      };
      setAnnotations(prev => [...prev, newAnnotation]);

      // Reset drawing state
      currentDrawingRef.current = '';
      lastPointRef.current = null;

      // Redraw all annotations to ensure consistency
      redrawAnnotationCanvas();
    }
    setIsDrawing(false);
  };

  // Prevent context menu (long press) on touch devices
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  };

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === 'text') {
      const canvas = annotationCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (rect && canvas) {
        // Scale mouse coordinates to match canvas internal dimensions
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const comment = await confirmDialog({
          title: 'Add Comment',
          message: 'Enter your comment:',
          confirmLabel: 'Add',
          variant: 'info',
          showInput: true,
          inputLabel: 'Comment',
          inputPlaceholder: 'Type your comment here...',
        });
        if (comment && typeof comment === 'string') {
          // Normalize coordinates to 0-1 range
          const newAnnotation: LocalAnnotation = {
            pageNumber: currentPage,
            annotationType: 'text',
            annotationData: {
              type: 'text',
              position: {
                x: x / canvas.width,
                y: y / canvas.height
              },
              content: comment,
              fontSize: 16,
              color: currentColor,
            },
          };
          setAnnotations(prev => [...prev, newAnnotation]);
        }
      }
      setSelectedTool('none');
    } else if (selectedTool === 'highlight') {
      const canvas = annotationCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (rect && canvas) {
        // Scale mouse coordinates to match canvas internal dimensions
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Normalize coordinates to 0-1 range
        const newAnnotation: LocalAnnotation = {
          pageNumber: currentPage,
          annotationType: 'highlight',
          annotationData: {
            type: 'highlight',
            position: {
              x: x / canvas.width,
              y: y / canvas.height
            },
            width: 200 / canvas.width,
            height: 30 / canvas.height,
            color: currentColor,
          },
        };
        setAnnotations(prev => [...prev, newAnnotation]);
      }
      setSelectedTool('none');
    }
  };

  const handleSaveAnnotations = async () => {
    try {
      setSaving(true);
      await assessmentsApi.saveAnnotations(
        resultId,
        annotations.map(ann => ({
          pageNumber: ann.pageNumber,
          annotationType: ann.annotationType,
          annotationData: ann.annotationData,
        }))
      );
      toast.success('Annotations saved successfully');
      onSave?.();
    } catch (error) {
      console.error('Error saving annotations:', error);
      toast.error('Failed to save annotations');
    } finally {
      setSaving(false);
    }
  };

  const clearAllAnnotations = async () => {
    const confirmed = await confirmDialog({
      title: 'Clear Annotations',
      message: 'Are you sure you want to clear ALL annotations?',
      confirmLabel: 'Clear All',
      variant: 'danger',
    });
    if (confirmed) {
      setAnnotations([]);
    }
  };

  const undoLastAnnotation = () => {
    setAnnotations(prev => prev.slice(0, -1));
  };

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= numPages) {
      setCurrentPage(pageNum);
    }
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));

  const swipeHandlers = useSwipeGesture(
    () => { if (selectedTool === 'none') goToPage(currentPage + 1); },
    () => { if (selectedTool === 'none') goToPage(currentPage - 1); }
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedTool !== 'none') return;
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
  }, [currentPage, numPages, selectedTool]);

  return (
    <div className={`flex flex-col h-full ${className}`} onMouseMove={handleContainerMouseMove}>
      {/* Toolbar - with auto-hide and fade transition (always visible on touch) */}
      <div
        className={`
          bg-gray-100 border-b border-gray-300 p-2 sm:p-3 flex-shrink-0
          transition-opacity duration-200
          ${showToolbar ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        {/* Mobile: Two rows. Desktop: Single row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {/* Tools Row */}
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-medium text-gray-700 hidden sm:inline">Tools:</span>
            <button
              onClick={() => setSelectedTool(t => t === 'draw' ? 'none' : 'draw')}
              className={`p-2 sm:px-3 sm:py-1 rounded text-sm flex items-center gap-1 ${
                selectedTool === 'draw' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'
              }`}
              title="Draw"
            >
              <PencilIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Draw</span>
            </button>
            <button
              onClick={() => setSelectedTool(t => t === 'text' ? 'none' : 'text')}
              className={`p-2 sm:px-3 sm:py-1 rounded text-sm flex items-center gap-1 ${
                selectedTool === 'text' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'
              }`}
              title="Text"
            >
              <ChatBubbleLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Text</span>
            </button>
            <button
              onClick={() => setSelectedTool(t => t === 'highlight' ? 'none' : 'highlight')}
              className={`p-2 sm:px-3 sm:py-1 rounded text-sm flex items-center gap-1 ${
                selectedTool === 'highlight' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'
              }`}
              title="Highlight"
            >
              <SwatchIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Highlight</span>
            </button>

            <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>

            <input
              type="color"
              value={currentColor}
              onChange={(e) => setCurrentColor(e.target.value)}
              className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
              title="Color"
            />

            <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>

            <button
              onClick={undoLastAnnotation}
              disabled={annotations.length === 0}
              className="p-2 sm:px-3 sm:py-1 bg-gray-200 text-gray-700 border border-gray-300 rounded hover:bg-gray-300 text-sm disabled:opacity-50 flex items-center gap-1"
              title="Undo"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              onClick={clearAllAnnotations}
              disabled={annotations.length === 0}
              className="p-2 sm:px-3 sm:py-1 bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200 text-sm disabled:opacity-50 flex items-center gap-1"
              title="Clear All"
            >
              <TrashIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button
              onClick={handleSaveAnnotations}
              disabled={saving}
              className="p-2 sm:px-4 sm:py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 text-sm flex items-center gap-1"
              title="Save"
            >
              <CheckIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>

          {/* Zoom and Count Row */}
          <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto justify-between sm:justify-end">
            <div className="text-xs sm:text-sm text-gray-600">
              {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
            </div>
            <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
            <div className="flex items-center gap-1">
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
        </div>
      </div>

      {/* PDF and Canvas Container */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-auto bg-gray-200 ${isTouch ? 'touch-scrollbar' : ''}`}
        style={isTouch ? { WebkitOverflowScrolling: 'touch' } : undefined}
        {...swipeHandlers}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-30">
            <LoadingSpinner message="Loading PDF..." />
          </div>
        )}

        {!loading && (
          <div className={`flex items-center justify-center ${inFullscreen ? 'p-2' : 'p-4'}`}>
            <div className="relative inline-block shadow-lg">
              {/* PDF Canvas */}
              <canvas
                ref={pdfCanvasRef}
                className="block"
              />

              {/* Annotation Canvas Overlay */}
              <canvas
                ref={annotationCanvasRef}
                className="absolute top-0 left-0"
                style={{
                  pointerEvents: selectedTool !== 'none' ? 'auto' : 'none',
                  cursor: selectedTool === 'draw' ? 'crosshair' : selectedTool === 'text' ? 'text' : selectedTool === 'highlight' ? 'cell' : 'default',
                  touchAction: selectedTool === 'draw' ? 'none' : 'auto', // Disable touch scrolling when drawing
                  WebkitTouchCallout: 'none', // Disable iOS callout
                  WebkitUserSelect: 'none', // Disable text selection
                  userSelect: 'none',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onClick={handleCanvasClick}
                onContextMenu={handleContextMenu}
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

      {/* Bottom Bar with Page Navigation - with auto-hide and fade transition (always visible on touch) */}
      <div
        className={`
          bg-blue-50 border-t border-blue-200 p-2 flex-shrink-0
          transition-opacity duration-200
          ${showBottomBar ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          {/* Page Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-2 sm:px-3 sm:py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeftIcon className="h-4 w-4" />
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
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Tool hint - hidden on mobile */}
          <p className="text-xs text-blue-800 hidden md:block text-center flex-1">
            {selectedTool === 'none' && 'Select a tool to start annotating'}
            {selectedTool === 'draw' && 'Draw mode: Click and drag to draw'}
            {selectedTool === 'text' && 'Text mode: Click to add a comment'}
            {selectedTool === 'highlight' && 'Highlight mode: Click to highlight'}
          </p>

          {/* Open PDF link - icon on mobile */}
          <a
            href={absoluteFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <span className="hidden sm:inline">Open PDF in New Tab</span>
            <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default PDFAnnotator;
