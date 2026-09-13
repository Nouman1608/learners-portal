import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { assessmentsApi, Assessment, AssessmentResult, SubmissionFile } from '../../api/assessments.api';
import { format } from 'date-fns';
import PDFAnnotator from './PDFAnnotator';
import { ChevronLeftIcon, XMarkIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../common/LoadingSpinner';
import EmptyState from '../common/EmptyState';

const gradeSchema = z.object({
  score: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid score format'),
  feedback: z.string().max(5000, 'Feedback must be less than 5000 characters').optional(),
});

type GradeFormData = z.infer<typeof gradeSchema>;

interface GradingInterfaceProps {
  assessment: Assessment;
  onClose: () => void;
  onSuccess: () => void;
}

const GradingInterface: React.FC<GradingInterfaceProps> = ({ assessment, onClose, onSuccess }) => {
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<AssessmentResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [submissionFile, setSubmissionFile] = useState<SubmissionFile | null>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [showPDFAnnotator, setShowPDFAnnotator] = useState(false);
  const [mobileShowList, setMobileShowList] = useState(true); // On mobile: true = show list, false = show grading form

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GradeFormData>({
    resolver: zodResolver(gradeSchema),
  });

  useEffect(() => {
    loadResults();
  }, [assessment.id]);

  const loadResults = async () => {
    try {
      setLoading(true);
      const fetchedResults = await assessmentsApi.getAssessmentResults(assessment.id);
      setResults(fetchedResults);
    } catch (error: any) {
      console.error('Error loading results:', error);
      toast.error(error.response?.data?.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const handleGrade = async (data: GradeFormData) => {
    if (!selectedStudent) return;

    try {
      setGrading(true);
      await assessmentsApi.gradeResult(assessment.id, {
        studentId: selectedStudent.studentId,
        score: data.score,
        feedback: data.feedback,
      });
      toast.success('Grade submitted successfully');
      setSelectedStudent(null);
      reset();
      loadResults();
      onSuccess();
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
    setShowPDFAnnotator(false);
    setMobileShowList(false); // Show grading form on mobile
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

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
        <div className="bg-white rounded-xl shadow-xl p-8 animate-scale-in">
          <LoadingSpinner message="Loading submissions..." />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="p-3 sm:p-6 border-b">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{assessment.title}</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                {assessment.course.title} | Max: {assessment.maxScore}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-1">
              <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Students List - Full width on mobile, 1/3 on desktop */}
          <div className={`w-full md:w-1/3 border-r overflow-y-auto ${!mobileShowList ? 'hidden md:block' : ''}`}>
            <div className="p-3 sm:p-4">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">
                Students ({results.length})
              </h3>
              {results.length === 0 ? (
                <EmptyState icon={ClipboardDocumentCheckIcon} title="No submissions yet" />
              ) : (
                <div className="space-y-2">
                  {results.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => selectStudent(result)}
                      className={`w-full text-left p-2 sm:p-3 rounded-lg border transition ${
                        selectedStudent?.id === result.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                            {result.student?.firstName} {result.student?.lastName}
                          </p>
                          <p className="text-xs text-gray-600 truncate">{result.student?.email}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {result.score ? (
                            <span className="text-xs sm:text-sm font-semibold text-green-600">
                              {result.score}/{assessment.maxScore}
                            </span>
                          ) : result.submittedAt ? (
                            <span className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-yellow-100 text-yellow-800 rounded">
                              Submitted
                            </span>
                          ) : (
                            <span className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-100 text-gray-600 rounded">
                              Not Submitted
                            </span>
                          )}
                        </div>
                      </div>
                      {result.submittedAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          Submitted: {format(new Date(result.submittedAt), 'PPp')}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grading Form - Hidden on mobile when showing list */}
          <div className={`flex-1 overflow-hidden flex flex-col ${mobileShowList ? 'hidden md:flex' : ''}`}>
            {selectedStudent ? (
              showPDFAnnotator && submissionFile ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* PDF Annotator Header */}
                  <div className="p-2 sm:p-4 border-b bg-gray-50 flex-shrink-0">
                    <div className="flex justify-between items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">
                          <span className="hidden sm:inline">Annotating: </span>{selectedStudent.student?.firstName} {selectedStudent.student?.lastName}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600 truncate">
                          <span className="hidden sm:inline">Submitted on </span>{format(new Date(selectedStudent.submittedAt!), 'PP')}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowPDFAnnotator(false)}
                        className="px-2 sm:px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-xs sm:text-sm flex-shrink-0"
                      >
                        <span className="hidden sm:inline">Back to </span>Form
                      </button>
                    </div>
                  </div>

                  {/* PDF Annotator */}
                  <div className="flex-1 overflow-hidden">
                    <PDFAnnotator
                      fileUrl={`${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace('/api', '')}${submissionFile.fileUrl}`}
                      resultId={selectedStudent.id}
                      onSave={() => toast.success('Annotations saved')}
                      className="h-full"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 sm:p-6 overflow-y-auto">
                  {/* Mobile back button */}
                  <button
                    onClick={() => setMobileShowList(true)}
                    className="md:hidden flex items-center gap-1 text-blue-600 hover:text-blue-700 mb-3 text-sm"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                    Back to Students
                  </button>

                  <div className="mb-4 sm:mb-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">
                      <span className="hidden sm:inline">Grading: </span>{selectedStudent.student?.firstName} {selectedStudent.student?.lastName}
                    </h3>
                    {selectedStudent.submittedAt && (
                      <p className="text-xs sm:text-sm text-gray-600">
                        Submitted: {format(new Date(selectedStudent.submittedAt), 'PP')}
                      </p>
                    )}
                    {selectedStudent.gradedAt && (
                      <p className="text-xs sm:text-sm text-green-600">
                        Graded: {format(new Date(selectedStudent.gradedAt), 'PP')}
                      </p>
                    )}
                  </div>

                  {/* Show PDF Annotator Button if submission exists */}
                  {loadingSubmission ? (
                    <div className="mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                      <LoadingSpinner size="sm" message="Loading submission..." />
                    </div>
                  ) : submissionFile ? (
                    <div className="mb-4 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-blue-900">Submission Available</p>
                          <p className="text-xs text-blue-700 truncate">{submissionFile.originalName}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setShowPDFAnnotator(true)}
                            className="flex-1 sm:flex-none px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs sm:text-sm"
                          >
                            Annotate
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : selectedStudent.submittedAt ? (
                    <div className="mb-4 p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs sm:text-sm text-yellow-800">Submission recorded but no PDF file found</p>
                    </div>
                  ) : (
                    <div className="mb-4 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs sm:text-sm text-gray-600">Student has not submitted yet</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit(handleGrade)} className="space-y-4 sm:space-y-6">
                    {/* Score */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                        Score <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          {...register('score')}
                          placeholder="0.00"
                          className="w-24 sm:w-32 px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                        <span className="text-gray-600 text-sm">/ {assessment.maxScore}</span>
                      </div>
                      {errors.score && (
                        <p className="text-red-500 text-xs sm:text-sm mt-1">{errors.score.message}</p>
                      )}
                    </div>

                    {/* Feedback */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                        Additional Feedback <span className="text-gray-400">(Optional)</span>
                      </label>
                      <p className="text-xs text-gray-500 mb-2 hidden sm:block">
                        Use the PDF annotator for detailed feedback, or add text here.
                      </p>
                      <textarea
                        {...register('feedback')}
                        rows={4}
                        placeholder="Provide feedback for the student..."
                        className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                      {errors.feedback && (
                        <p className="text-red-500 text-xs sm:text-sm mt-1">{errors.feedback.message}</p>
                      )}
                    </div>

                    {/* Previous Feedback (if exists) */}
                    {selectedStudent.feedback && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                        <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Previous Feedback:</p>
                        <p className="text-xs sm:text-sm text-gray-600 whitespace-pre-wrap">
                          {selectedStudent.feedback}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={grading}
                        className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:bg-gray-400 text-sm"
                      >
                        {grading ? 'Submitting...' : 'Submit Grade'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudent(null);
                          setSubmissionFile(null);
                          setMobileShowList(true);
                          reset();
                        }}
                        className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 p-4">
                <p className="text-sm sm:text-base text-center">Select a student to grade</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GradingInterface;
