import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { assessmentsApi, Assessment, AssessmentFile } from '../api/assessments.api';
import PDFViewer from '../components/assessments/PDFViewer';
import { format } from 'date-fns';
import { useFullscreen } from '../hooks/useFullscreen';
import { FullscreenToggle } from '../components/common/FullscreenToggle';
import { CollapsibleSidebar } from '../components/common/CollapsibleSidebar';
import { ArrowLeftIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/common/LoadingSpinner';

const TakeAssessment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [canAccess, setCanAccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [questionPapers, setQuestionPapers] = useState<AssessmentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [currentPaperIndex, setCurrentPaperIndex] = useState<number>(0);
  const [markingSchemes, setMarkingSchemes] = useState<AssessmentFile[]>([]);
  const [currentSchemeIndex, setCurrentSchemeIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'questions' | 'marking_scheme'>('questions');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);

  useEffect(() => {
    if (id) {
      loadAssessmentAndCheckAccess();
    }
  }, [id]);

  const loadAssessmentAndCheckAccess = async () => {
    if (!id) return;

    try {
      setLoading(true);

      // Load assessment details
      const assessments = await assessmentsApi.getAssessments({ isActive: true });
      const foundAssessment = assessments.find((a) => a.id === id);

      if (!foundAssessment) {
        toast.error('Assessment not found');
        navigate('/assessments');
        return;
      }

      setAssessment(foundAssessment);

      // Check if student can access
      const accessGranted = await assessmentsApi.checkAccess(id);
      setCanAccess(accessGranted);

      if (accessGranted) {
        // Load question papers
        const files = await assessmentsApi.getAssessmentFiles(id, 'question_paper');
        setQuestionPapers(files);

        // Load marking schemes (backend returns empty if deadline hasn't passed)
        const schemes = await assessmentsApi.getAssessmentFiles(id, 'marking_scheme');
        setMarkingSchemes(schemes);
      }
    } catch (error: any) {
      console.error('Error loading assessment:', error);
      toast.error('Failed to load assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Only PDF files are allowed');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !id) {
      toast.error('Please select a file to submit');
      return;
    }

    try {
      setSubmitting(true);
      await assessmentsApi.submitAssessmentWithPdf(id, selectedFile);
      toast.success('Assessment submitted successfully');
      setSubmitted(true);
    } catch (error: any) {
      console.error('Error submitting assessment:', error);
      toast.error(error.response?.data?.message || 'Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    navigate('/assessments');
  };

  const getFileUrl = (fileUrl: string) =>
    `${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace('/api', '')}${fileUrl}`;

  const handleDownload = async (file: AssessmentFile) => {
    try {
      const response = await fetch(getFileUrl(file.fileUrl));
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch {
      toast.error('Failed to download file');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading assessment..." />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Assessment not found</p>
          <button
            onClick={handleClose}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  const isBeforeStart = new Date() < new Date(assessment.startTime);
  const isAfterEnd = new Date() > new Date(assessment.endTime);

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-50">
      {/* Header - hidden in fullscreen */}
      {!isFullscreen && (
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-0 sm:flex-col sm:items-start">
                  {/* Mobile back button */}
                  <button
                    onClick={handleClose}
                    className="sm:hidden p-1 text-gray-500 hover:text-gray-700 flex-shrink-0"
                  >
                    <ArrowLeftIcon className="w-5 h-5" />
                  </button>
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{assessment.title}</h1>
                </div>
                {assessment.description && (
                  <p className="text-gray-600 mt-1 sm:mt-2 text-sm line-clamp-2 sm:line-clamp-none">{assessment.description}</p>
                )}
                <div className="mt-1 sm:mt-2 flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-600">
                  <span>Max: {assessment.maxScore}</span>
                  <span>Start: {format(new Date(assessment.startTime), 'PP p')}</span>
                  <span>End: {format(new Date(assessment.endTime), 'PP p')}</span>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="hidden sm:block px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 flex-shrink-0 text-sm"
              >
                Back to Assessments
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Content */}
      <main className={`${isFullscreen ? 'h-screen' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
        {!canAccess ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3 className="mt-4 text-xl font-semibold text-gray-900">Assessment Not Available</h3>
            <p className="mt-2 text-gray-600">
              {isBeforeStart
                ? `This assessment will be available on ${format(new Date(assessment.startTime), 'PPp')}`
                : 'You do not have access to this assessment'}
            </p>
          </div>
        ) : submitted ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-4 text-xl font-semibold text-gray-900">Submission Successful!</h3>
            <p className="mt-2 text-gray-600">Your assessment has been submitted successfully.</p>
            <button
              onClick={handleClose}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Back to Assessments
            </button>
          </div>
        ) : (
          <div className={`flex flex-col lg:flex-row ${isFullscreen ? 'h-full' : 'gap-6'} relative`}>
            {/* Question Papers - flexible width */}
            <div className={`flex-1 min-w-0 ${sidebarOpen ? '' : 'w-full'}`}>
              <div className="bg-white rounded-lg shadow">
                <div className={`flex flex-col ${isFullscreen ? 'h-full' : 'h-[60vh] lg:h-[calc(100vh-12rem)]'}`}>
                  {/* Tabs for questions vs marking scheme */}
                  {markingSchemes.length > 0 && (
                    <div className="flex border-b border-gray-200 flex-shrink-0">
                      <button
                        onClick={() => setViewMode('questions')}
                        className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium ${viewMode === 'questions' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Question Papers
                      </button>
                      <button
                        onClick={() => setViewMode('marking_scheme')}
                        className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium ${viewMode === 'marking_scheme' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Marking Scheme
                      </button>
                    </div>
                  )}

                  {viewMode === 'questions' ? (
                    questionPapers.length === 0 ? (
                      <div className="flex items-center justify-center flex-1">
                        <p className="text-gray-500">No question papers available</p>
                      </div>
                    ) : (
                      <>
                        <div className="p-2 sm:p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {questionPapers.length > 1 ? (
                              <>
                                <label className="text-xs sm:text-sm font-medium text-gray-700 hidden sm:inline">Paper:</label>
                                <select
                                  value={currentPaperIndex}
                                  onChange={(e) => setCurrentPaperIndex(Number(e.target.value))}
                                  className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded text-xs sm:text-sm flex-1 min-w-0"
                                >
                                  {questionPapers.map((paper, idx) => (
                                    <option key={paper.id} value={idx}>
                                      {paper.originalName}
                                    </option>
                                  ))}
                                </select>
                              </>
                            ) : (
                              <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">
                                {questionPapers[0]?.originalName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                            <button
                              onClick={() => questionPapers[currentPaperIndex] && handleDownload(questionPapers[currentPaperIndex])}
                              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="Download PDF"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                            <FullscreenToggle
                              isFullscreen={isFullscreen}
                              onToggle={toggleFullscreen}
                              size="sm"
                            />
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto">
                          <PDFViewer
                            fileUrl={getFileUrl(questionPapers[currentPaperIndex]?.fileUrl)}
                            inFullscreen={isFullscreen}
                          />
                        </div>
                      </>
                    )
                  ) : (
                    <>
                      <div className="p-2 sm:p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {markingSchemes.length > 1 ? (
                            <>
                              <label className="text-xs sm:text-sm font-medium text-gray-700 hidden sm:inline">Scheme:</label>
                              <select
                                value={currentSchemeIndex}
                                onChange={(e) => setCurrentSchemeIndex(Number(e.target.value))}
                                className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded text-xs sm:text-sm flex-1 min-w-0"
                              >
                                {markingSchemes.map((scheme, idx) => (
                                  <option key={scheme.id} value={idx}>
                                    {scheme.originalName}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">
                              {markingSchemes[0]?.originalName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          <button
                            onClick={() => markingSchemes[currentSchemeIndex] && handleDownload(markingSchemes[currentSchemeIndex])}
                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Download PDF"
                          >
                            <ArrowDownTrayIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                          <FullscreenToggle
                            isFullscreen={isFullscreen}
                            onToggle={toggleFullscreen}
                            size="sm"
                          />
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <PDFViewer
                          fileUrl={getFileUrl(markingSchemes[currentSchemeIndex]?.fileUrl)}
                          inFullscreen={isFullscreen}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel: Submission - collapsible on desktop, always visible on mobile */}
            <div className="lg:hidden">
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Submit Your Work</h3>

                {isAfterEnd && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm text-yellow-800">
                      The submission deadline has passed. You can still submit, but it may be marked as late.
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload your answer PDF
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileSelect}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {selectedFile && (
                      <div className="mt-2 p-2 bg-gray-50 rounded">
                        <p className="text-sm text-gray-700 truncate">{selectedFile.name}</p>
                        <p className="text-xs text-gray-500">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      Maximum file size: 5MB. Only PDF files are accepted.
                    </p>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={!selectedFile || submitting}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit Assessment'}
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop collapsible sidebar */}
            <div className="hidden lg:block">
              <CollapsibleSidebar
                isOpen={sidebarOpen}
                onToggle={() => setSidebarOpen(!sidebarOpen)}
                position="right"
                width={isFullscreen ? 'w-96' : 'w-full lg:w-80 xl:w-96'}
                className={isFullscreen ? 'absolute right-0 top-0 h-full' : ''}
              >
                <div className={`bg-white ${isFullscreen ? 'h-full overflow-auto' : 'rounded-lg shadow'} p-6`}>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Submit Your Work</h3>

                  {isAfterEnd && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-800">
                        The submission deadline has passed. You can still submit, but it may be marked as late.
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload your answer PDF
                      </label>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileSelect}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {selectedFile && (
                        <div className="mt-2 p-2 bg-gray-50 rounded">
                          <p className="text-sm text-gray-700 truncate">{selectedFile.name}</p>
                          <p className="text-xs text-gray-500">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      )}
                      <p className="mt-2 text-xs text-gray-500">
                        Maximum file size: 5MB. Only PDF files are accepted.
                      </p>
                    </div>

                    <button
                      onClick={handleSubmit}
                      disabled={!selectedFile || submitting}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Submitting...' : 'Submit Assessment'}
                    </button>
                  </div>
                </div>
              </CollapsibleSidebar>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TakeAssessment;
