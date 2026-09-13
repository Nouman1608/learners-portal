import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { assessmentsApi, Assessment, AssessmentResult, SubmissionFile } from '../api/assessments.api';
import { format } from 'date-fns';
import PDFAnnotator from '../components/assessments/PDFAnnotator';
import { useFullscreen } from '../hooks/useFullscreen';
import { FullscreenToggle } from '../components/common/FullscreenToggle';
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, XCircleIcon, PencilSquareIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';

const gradeSchema = z.object({
  score: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid score format'),
  feedback: z.string().max(5000, 'Feedback must be less than 5000 characters').optional(),
});

type GradeFormData = z.infer<typeof gradeSchema>;

const GradeAssessment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<AssessmentResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [submissionFile, setSubmissionFile] = useState<SubmissionFile | null>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [showPDFView, setShowPDFView] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GradeFormData>({
    resolver: zodResolver(gradeSchema),
  });

  useEffect(() => {
    if (id) {
      loadAssessmentAndResults();
    }
  }, [id]);

  const loadAssessmentAndResults = async () => {
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

      // Load results
      const fetchedResults = await assessmentsApi.getAssessmentResults(id);
      setResults(fetchedResults);
    } catch (error: any) {
      console.error('Error loading assessment:', error);
      toast.error(error.response?.data?.message || 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleGrade = async (data: GradeFormData) => {
    if (!selectedStudent || !id) return;

    try {
      setGrading(true);
      await assessmentsApi.gradeResult(id, {
        studentId: selectedStudent.studentId,
        score: data.score,
        feedback: data.feedback,
      });
      toast.success('Grade submitted successfully');

      // Go back to student list
      setSelectedStudent(null);
      setSubmissionFile(null);
      setShowPDFView(false);
      reset();

      await loadAssessmentAndResults();
    } catch (error: any) {
      console.error('Error grading:', error);
      toast.error(error.response?.data?.message || 'Failed to submit grade');
    } finally {
      setGrading(false);
    }
  };

  const selectStudent = async (result: AssessmentResult) => {
    setSelectedStudent(result);
    setSubmissionFile(null);
    setShowPDFView(false);
    reset({
      score: result.score || '',
      feedback: result.feedback || '',
    });

    // Load submission file if student has submitted
    if (result.submittedAt) {
      try {
        setLoadingSubmission(true);
        const file = await assessmentsApi.getSubmissionFile(result.id);
        setSubmissionFile(file);
      } catch (error) {
        console.error('Error loading submission:', error);
        // If no submission file found, continue without it
      } finally {
        setLoadingSubmission(false);
      }
    }
  };

  const handleBackToStudentList = () => {
    setSelectedStudent(null);
    setSubmissionFile(null);
    setShowPDFView(false);
    reset();
  };

  const handleClose = () => {
    navigate('/assessments');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading submissions..." />
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

  // STEP 1: Student Selection View
  if (!selectedStudent) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={handleClose}
                  className="sm:hidden p-1 text-gray-500 hover:text-gray-700 flex-shrink-0"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{assessment.title}</h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                    {assessment.course.title} | Max: {assessment.maxScore}
                  </p>
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

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Select a Student to Grade</h2>
            <p className="text-sm text-gray-600 mt-1">
              {results.length} submission{results.length !== 1 ? 's' : ''} total
            </p>
          </div>

          {results.length === 0 ? (
            <div className="bg-white rounded-lg shadow">
              <EmptyState icon={ClipboardDocumentCheckIcon} title="No submissions yet" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => selectStudent(result)}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-all p-6 text-left"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {result.student?.firstName} {result.student?.lastName}
                      </h3>
                      <p className="text-sm text-gray-600">{result.student?.email}</p>
                    </div>
                    {result.score ? (
                      <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 ml-2" />
                    ) : result.submittedAt ? (
                      <ClockIcon className="h-6 w-6 text-yellow-600 flex-shrink-0 ml-2" />
                    ) : (
                      <XCircleIcon className="h-6 w-6 text-gray-400 flex-shrink-0 ml-2" />
                    )}
                  </div>

                  <div className="space-y-2">
                    {/* Status Badge */}
                    <div>
                      {result.score ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                          Graded: {result.score}/{assessment.maxScore}
                        </span>
                      ) : result.submittedAt ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                          Pending Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                          Not Submitted
                        </span>
                      )}
                    </div>

                    {/* Submission Date */}
                    {result.submittedAt && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Submitted:</span>{' '}
                        {format(new Date(result.submittedAt), 'MMM dd, yyyy h:mm a')}
                      </p>
                    )}

                    {/* Graded Date */}
                    {result.gradedAt && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Graded:</span>{' '}
                        {format(new Date(result.gradedAt), 'MMM dd, yyyy h:mm a')}
                      </p>
                    )}
                  </div>

                  {/* Action Hint */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-blue-600 font-medium">
                      {result.score ? 'View & Update Grade →' : 'Grade Submission →'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // STEP 2: PDF Annotation & Grading View
  return (
    <div ref={containerRef} className="min-h-screen bg-gray-50">
      {/* Header - hidden in fullscreen */}
      {!isFullscreen && (
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex justify-between items-center gap-2">
              <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <button
                  onClick={handleBackToStudentList}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                  title="Back to Student List"
                >
                  <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
                </button>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
                    <span className="hidden sm:inline">Grading: </span>{selectedStudent.student?.firstName} {selectedStudent.student?.lastName}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 truncate">
                    {assessment.title} | Max: {assessment.maxScore}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {submissionFile && (
                  <button
                    onClick={() => setShowPDFView(!showPDFView)}
                    className="px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs sm:text-sm"
                  >
                    {showPDFView ? 'Form' : 'PDF'}
                    <span className="hidden sm:inline"> {showPDFView ? '' : 'View'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Content */}
      <main className={`${isFullscreen ? 'h-screen' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
        {showPDFView && submissionFile ? (
          /* PDF Annotation View */
          <div className="bg-white rounded-lg shadow">
            <div className="p-2 sm:p-4 border-b bg-gray-50 flex justify-between items-center gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">
                  {selectedStudent.student?.firstName} {selectedStudent.student?.lastName}<span className="hidden sm:inline">'s Submission</span>
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 truncate">
                  <span className="hidden sm:inline">Submitted on </span>{format(new Date(selectedStudent.submittedAt!), 'PP')}
                </p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {!isFullscreen && (
                  <button
                    onClick={() => setShowPDFView(false)}
                    className="px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-xs sm:text-sm"
                  >
                    <span className="hidden sm:inline">Back to </span>Form
                  </button>
                )}
                <FullscreenToggle
                  isFullscreen={isFullscreen}
                  onToggle={toggleFullscreen}
                  size="sm"
                />
              </div>
            </div>

            <div className={isFullscreen ? 'h-[calc(100vh-4rem)]' : 'h-[calc(100vh-16rem)]'}>
              <PDFAnnotator
                fileUrl={`${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace('/api', '')}${submissionFile.fileUrl}`}
                resultId={selectedStudent.id}
                onSave={() => toast.success('Annotations saved')}
                className="h-full"
                inFullscreen={isFullscreen}
              />
            </div>
          </div>
        ) : (
          /* Grading Form View */
          <div className="bg-white rounded-lg shadow p-6 max-w-3xl mx-auto">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Student Information
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Name:</span>{' '}
                  {selectedStudent.student?.firstName} {selectedStudent.student?.lastName}
                </p>
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Email:</span>{' '}
                  {selectedStudent.student?.email}
                </p>
                {selectedStudent.submittedAt && (
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Submitted:</span>{' '}
                    {format(new Date(selectedStudent.submittedAt), 'PPP p')}
                  </p>
                )}
                {selectedStudent.gradedAt && (
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Last Graded:</span>{' '}
                    {format(new Date(selectedStudent.gradedAt), 'PPP p')}
                  </p>
                )}
              </div>
            </div>

            {/* PDF Submission Section */}
            {loadingSubmission ? (
              <div className="mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <LoadingSpinner size="sm" message="Loading submission..." />
              </div>
            ) : submissionFile ? (
              <div className="mb-6 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-blue-900">PDF Submission Available</p>
                    <p className="text-xs text-blue-700 mt-1 truncate">{submissionFile.originalName}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setShowPDFView(true)}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs sm:text-sm flex items-center justify-center gap-1"
                    >
                      <PencilSquareIcon className="w-4 h-4 sm:hidden" />
                      <span className="hidden sm:inline">View & Annotate PDF</span>
                      <span className="sm:hidden">Annotate</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : selectedStudent.submittedAt ? (
              <div className="mb-6 p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs sm:text-sm text-yellow-800">Submission recorded but no PDF file found</p>
              </div>
            ) : (
              <div className="mb-6 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-600">Student has not submitted yet</p>
              </div>
            )}

            {/* Grading Form */}
            <form onSubmit={handleSubmit(handleGrade)} className="space-y-6">
              {/* Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Score <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    {...register('score')}
                    placeholder="0.00"
                    className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-gray-600">/ {assessment.maxScore}</span>
                </div>
                {errors.score && (
                  <p className="text-red-500 text-sm mt-1">{errors.score.message}</p>
                )}
              </div>

              {/* Feedback */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Text Feedback (Optional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {submissionFile
                    ? 'You can use the PDF annotator above for detailed feedback, or provide additional comments here.'
                    : 'Provide textual feedback for the student.'}
                </p>
                <textarea
                  {...register('feedback')}
                  rows={6}
                  placeholder="Provide feedback for the student..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.feedback && (
                  <p className="text-red-500 text-sm mt-1">{errors.feedback.message}</p>
                )}
              </div>

              {/* Previous Feedback (if exists) */}
              {selectedStudent.feedback && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Previous Feedback:</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {selectedStudent.feedback}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={grading}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 font-medium"
                >
                  {grading ? 'Submitting...' : selectedStudent.score ? 'Update Grade' : 'Submit Grade'}
                </button>
                <button
                  type="button"
                  onClick={handleBackToStudentList}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};

export default GradeAssessment;
