import { useState, useEffect } from 'react';
import { studentPortalApi, AcademicResult } from '../../api/student-portal.api';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface AcademicReportProps {
  studentId: string;
}

export default function AcademicReport({ studentId }: AcademicReportProps) {
  const [results, setResults] = useState<AcademicResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string>('');

  useEffect(() => {
    fetchResults();
  }, [studentId, selectedCourse]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const data = await studentPortalApi.getAcademicPerformance(
        studentId,
        selectedCourse || undefined
      );
      setResults(data);
    } catch (error) {
      console.error('Failed to fetch academic results:', error);
      toast.error('Failed to load academic performance');
    } finally {
      setLoading(false);
    }
  };

  // Get unique courses for filter
  const courses = Array.from(
    new Set(results.map((r) => r.courseTitle))
  ).map((title) => ({ title }));

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-green-100 text-green-800';
    if (percentage >= 80) return 'bg-blue-100 text-blue-800';
    if (percentage >= 70) return 'bg-yellow-100 text-yellow-800';
    if (percentage >= 60) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const getGradeLetter = (percentage: number) => {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading academic results...</span>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <p className="text-gray-500">No academic results available yet</p>
      </div>
    );
  }

  // Calculate summary stats
  const avgScore =
    results.reduce((sum, r) => sum + r.scorePercentage, 0) / results.length;
  const passedCount = results.filter((r) => r.scorePercentage >= 60).length;
  const failedCount = results.filter((r) => r.scorePercentage < 60).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">
            Total Assessments
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {results.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Average Score</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">
            {avgScore.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Passed</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {passedCount}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Failed</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {failedCount}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Course
        </label>
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Courses</option>
          {courses.map((course) => (
            <option key={course.title} value={course.title}>
              {course.title}
            </option>
          ))}
        </select>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Assessment Results
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Course
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Assessment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Score
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Percentage
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Grade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((result) => (
                <tr key={result.assessmentId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="font-medium">{result.courseTitle}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div>
                      <div className="font-medium">{result.assessmentTitle}</div>
                      {result.feedback && (
                        <div className="text-gray-500 text-xs mt-1">
                          {result.feedback}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 capitalize">
                    {result.assessmentType}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    {result.score} / {result.maxScore}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                    {result.scorePercentage.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${getGradeColor(
                        result.scorePercentage
                      )}`}
                    >
                      {getGradeLetter(result.scorePercentage)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {result.gradedAt
                      ? new Date(result.gradedAt).toLocaleDateString()
                      : 'Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
