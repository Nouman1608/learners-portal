import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { assessmentsApi, Assessment, AssessmentFile } from '../../api/assessments.api';
import PDFViewer from './PDFViewer';
import LoadingSpinner from '../common/LoadingSpinner';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface StudentAssessmentViewProps {
  assessment: Assessment;
  onClose: () => void;
  onSubmitSuccess?: () => void;
}

const StudentAssessmentView: React.FC<StudentAssessmentViewProps> = ({
  assessment,
  onClose,
  onSubmitSuccess,
}) => {
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

  useEffect(() => {
    checkAccessAndLoadFiles();
  }, [assessment.id]);

  const checkAccessAndLoadFiles = async () => {
    try {
      setLoading(true);

      // Check if student can access
      const accessGranted = await assessmentsApi.checkAccess(assessment.id);
      setCanAccess(accessGranted);

      if (accessGranted) {
        // Load question papers
        const files = await assessmentsApi.getAssessmentFiles(assessment.id, 'question_paper');
        setQuestionPapers(files);

        // Load marking schemes (backend returns empty if deadline hasn't passed)
        const schemes = await assessmentsApi.getAssessmentFiles(assessment.id, 'marking_scheme');
        setMarkingSchemes(schemes);
      }
    } catch (error: any) {
      console.error('Error checking access:', error);
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
    if (!selectedFile) {
      toast.error('Please select a file to submit');
      return;
    }

    try {
      setSubmitting(true);
      await assessmentsApi.submitAssessmentWithPdf(assessment.id, selectedFile);
      toast.success('Assessment submitted successfully');
      setSubmitted(true);
      onSubmitSuccess?.();
    } catch (error: any) {
      console.error('Error submitting assessment:', error);
      toast.error(error.response?.data?.message || 'Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
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

  const isBeforeStart = new Date() < new Date(assessment.startTime);
  const isAfterEnd = new Date() > new Date(assessment.endTime);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{assessment.title}</h2>
              {assessment.description && (
                <p className="text-gray-600 mt-2">{assessment.description}</p>
              )}
              <div className="mt-2 flex gap-4 text-sm text-gray-600">
                <span>Max Score: {assessment.maxScore}</span>
                <span>Start: {new Date(assessment.startTime).toLocaleString()}</span>
                <span>End: {new Date(assessment.endTime).toLocaleString()}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner message="Loading..." />
            </div>
          ) : !canAccess ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 className="mt-4 text-xl font-semibold text-gray-900">Assessment Not Available</h3>
                <p className="mt-2 text-gray-600">
                  {isBeforeStart
                    ? `This assessment will be available on ${new Date(assessment.startTime).toLocaleString()}`
                    : 'You do not have access to this assessment'}
                </p>
              </div>
            </div>
          ) : submitted ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="mt-4 text-xl font-semibold text-gray-900">Submission Successful!</h3>
                <p className="mt-2 text-gray-600">Your assessment has been submitted successfully.</p>
                <button
                  onClick={onClose}
                  className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full">
              {/* Left Panel: Question Papers / Marking Scheme */}
              <div className="flex-1 border-r border-gray-200">
                <div className="h-full flex flex-col">
                  {/* Tabs for questions vs marking scheme */}
                  {markingSchemes.length > 0 && (
                    <div className="flex border-b border-gray-200">
                      <button
                        onClick={() => setViewMode('questions')}
                        className={`px-4 py-2 text-sm font-medium ${viewMode === 'questions' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Question Papers
                      </button>
                      <button
                        onClick={() => setViewMode('marking_scheme')}
                        className={`px-4 py-2 text-sm font-medium ${viewMode === 'marking_scheme' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
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
                        <div className="p-3 bg-gray-50 border-b border-gray-200">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {questionPapers.length > 1 ? (
                                <>
                                  <label className="text-sm font-medium text-gray-700">Paper:</label>
                                  <select
                                    value={currentPaperIndex}
                                    onChange={(e) => setCurrentPaperIndex(Number(e.target.value))}
                                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                                  >
                                    {questionPapers.map((paper, idx) => (
                                      <option key={paper.id} value={idx}>
                                        {paper.originalName}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <span className="text-sm font-medium text-gray-700 truncate">
                                  {questionPapers[0]?.originalName}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => questionPapers[currentPaperIndex] && handleDownload(questionPapers[currentPaperIndex])}
                              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex-shrink-0"
                              title="Download PDF"
                            >
                              <ArrowDownTrayIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex-1">
                          <PDFViewer
                            fileUrl={getFileUrl(questionPapers[currentPaperIndex]?.fileUrl)}
                          />
                        </div>
                      </>
                    )
                  ) : (
                    <>
                      <div className="p-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {markingSchemes.length > 1 ? (
                              <>
                                <label className="text-sm font-medium text-gray-700">Scheme:</label>
                                <select
                                  value={currentSchemeIndex}
                                  onChange={(e) => setCurrentSchemeIndex(Number(e.target.value))}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                                >
                                  {markingSchemes.map((scheme, idx) => (
                                    <option key={scheme.id} value={idx}>
                                      {scheme.originalName}
                                    </option>
                                  ))}
                                </select>
                              </>
                            ) : (
                              <span className="text-sm font-medium text-gray-700 truncate">
                                {markingSchemes[0]?.originalName}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => markingSchemes[currentSchemeIndex] && handleDownload(markingSchemes[currentSchemeIndex])}
                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex-shrink-0"
                            title="Download PDF"
                          >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1">
                        <PDFViewer
                          fileUrl={getFileUrl(markingSchemes[currentSchemeIndex]?.fileUrl)}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Right Panel: Submission */}
              <div className="w-80 p-6 flex flex-col">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Submit Your Work</h3>

                {isAfterEnd && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm text-yellow-800">
                      The submission deadline has passed. You can still submit, but it may be marked as late.
                    </p>
                  </div>
                )}

                <div className="flex-1">
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
                  className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Submit Assessment'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentAssessmentView;
