import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { assessmentsApi, AssessmentResult, SubmissionFile } from '../api/assessments.api';
import { studentCourseTitle } from '../utils/course';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import PDFViewerWithAnnotations from '../components/assessments/PDFViewerWithAnnotations';

const MyResults: React.FC = () => {
  const { user: _user } = useAuth();
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<AssessmentResult | null>(null);
  const [viewingSubmission, setViewingSubmission] = useState<{ resultId: string; file: SubmissionFile } | null>(null);

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    try {
      setLoading(true);
      const fetchedResults = await assessmentsApi.getStudentResults();
      setResults(fetchedResults);
    } catch (error: any) {
      console.error('Error loading results:', error);
      toast.error(error.response?.data?.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const getScorePercentage = (score: string, maxScore: string): number => {
    return (parseFloat(score) / parseFloat(maxScore)) * 100;
  };

  const getScoreColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 80) return 'text-blue-600';
    if (percentage >= 70) return 'text-yellow-600';
    if (percentage >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const handleViewAnnotatedSubmission = async (resultId: string) => {
    try {
      const file = await assessmentsApi.getSubmissionFile(resultId);
      setViewingSubmission({ resultId, file });
    } catch (error: any) {
      console.error('Error loading submission:', error);
      toast.error('Failed to load submission file');
    }
  };

  if (loading && results.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">My Results</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Assessments</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{results.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Graded</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {results.filter((r) => r.score).length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Pending</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {results.filter((r) => !r.score && r.submittedAt).length}
            </p>
          </div>
        </div>

        {/* Results List */}
        {results.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">No assessment results yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result) => (
              <div key={result.id} className="bg-white rounded-lg shadow hover:shadow-md transition">
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {/* Assessment Info */}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {result.assessment?.title}
                        </h3>
                        {result.course && (
                          <p className="text-sm text-gray-600 mt-1">{studentCourseTitle(result.course.title, result.course.subject)}</p>
                        )}
                      </div>

                      {/* Description */}
                      {result.assessment?.description && (
                        <p className="text-sm text-gray-600 mt-3 line-clamp-2">
                          {result.assessment.description}
                        </p>
                      )}

                      {/* Dates */}
                      <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                        {result.assessment?.startTime && (
                          <span>
                            <span className="font-medium">Start:</span>{' '}
                            {format(new Date(result.assessment.startTime), 'PPp')}
                          </span>
                        )}
                        {result.assessment?.endTime && (
                          <span>
                            <span className="font-medium">End:</span>{' '}
                            {format(new Date(result.assessment.endTime), 'PPp')}
                          </span>
                        )}
                        {result.submittedAt && (
                          <span>
                            <span className="font-medium">Submitted:</span>{' '}
                            {format(new Date(result.submittedAt), 'PPp')}
                          </span>
                        )}
                        {result.gradedAt && (
                          <span>
                            <span className="font-medium">Graded:</span>{' '}
                            {format(new Date(result.gradedAt), 'PPp')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right ml-4">
                      {result.score ? (
                        <div>
                          <p
                            className={`text-3xl font-bold ${getScoreColor(
                              getScorePercentage(result.score, result.assessment?.maxScore || '100')
                            )}`}
                          >
                            {result.score}
                          </p>
                          <p className="text-sm text-gray-600">
                            out of {result.assessment?.maxScore}
                          </p>
                          <p className="text-sm font-medium text-gray-700 mt-1">
                            {getScorePercentage(
                              result.score,
                              result.assessment?.maxScore || '100'
                            ).toFixed(1)}
                            %
                          </p>
                        </div>
                      ) : result.submittedAt ? (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                          Pending Grade
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                          Not Submitted
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions and Feedback */}
                  {result.submittedAt && (
                    <div className="mt-4 border-t pt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleViewAnnotatedSubmission(result.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                      >
                        View Annotated Submission
                      </button>
                      {result.feedback && (
                        <button
                          onClick={() =>
                            setSelectedResult(selectedResult?.id === result.id ? null : result)
                          }
                          className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm"
                        >
                          {selectedResult?.id === result.id ? 'Hide' : 'View'} Text Feedback
                        </button>
                      )}
                    </div>
                  )}

                  {/* Feedback Expanded */}
                  {result.feedback && selectedResult?.id === result.id && (
                    <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-blue-900 mb-2">Teacher Feedback:</p>
                      <p className="text-sm text-blue-800 whitespace-pre-wrap">
                        {result.feedback}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Annotated Submission Viewer */}
      {viewingSubmission && (
        <PDFViewerWithAnnotations
          fileUrl={`${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace('/api', '')}${viewingSubmission.file.fileUrl}`}
          resultId={viewingSubmission.resultId}
          onClose={() => setViewingSubmission(null)}
        />
      )}
    </div>
  );
};

export default MyResults;
