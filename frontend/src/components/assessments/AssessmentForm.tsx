import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { assessmentsApi, Assessment, AssessmentFile, CreateAssessmentInput } from '../../api/assessments.api';
import { coursesApi, Course } from '../../api/courses.api';
import { usersApi, User } from '../../api/users.api';
import { useAuth } from '../../context/AuthContext';
import SearchableSelect from '../common/SearchableSelect';

const assessmentSchema = z.object({
  courseId: z.string().uuid('Please select a course'),
  teacherId: z.string().uuid('Please select a teacher').optional(),
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  description: z.string().max(5000, 'Description must be less than 5000 characters').optional(),
  maxScore: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid score format'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
});

type AssessmentFormData = z.infer<typeof assessmentSchema>;

interface AssessmentFormProps {
  assessment?: Assessment;
  onClose: () => void;
  onSuccess: () => void;
}

const AssessmentForm: React.FC<AssessmentFormProps> = ({ assessment, onClose, onSuccess }) => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'sudo';
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedMarkingSchemes, setSelectedMarkingSchemes] = useState<File[]>([]);
  const [existingQuestionPapers, setExistingQuestionPapers] = useState<AssessmentFile[]>([]);
  const [existingMarkingSchemes, setExistingMarkingSchemes] = useState<AssessmentFile[]>([]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AssessmentFormData>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: assessment
      ? {
          courseId: assessment.courseId,
          title: assessment.title,
          description: assessment.description || '',
          maxScore: assessment.maxScore,
          startTime: assessment.startTime ? new Date(assessment.startTime).toISOString().slice(0, 16) : '',
          endTime: assessment.endTime ? new Date(assessment.endTime).toISOString().slice(0, 16) : '',
        }
      : {
          maxScore: '100',
          startTime: '',
          endTime: '',
        },
  });

  useEffect(() => {
    loadCourses();
    if (isAdmin) {
      loadTeachers();
    }
    if (assessment) {
      loadExistingFiles();
    }
  }, [isAdmin, assessment]);

  const loadExistingFiles = async () => {
    if (!assessment) return;
    try {
      const [papers, schemes] = await Promise.all([
        assessmentsApi.getAssessmentFiles(assessment.id, 'question_paper'),
        assessmentsApi.getAssessmentFiles(assessment.id, 'marking_scheme'),
      ]);
      setExistingQuestionPapers(papers);
      setExistingMarkingSchemes(schemes);
    } catch (error: any) {
      console.error('Error loading existing files:', error);
    }
  };

  const loadCourses = async () => {
    try {
      const fetchedCourses = await coursesApi.getCourses({ isActive: true });
      if (!isAdmin && currentUser) {
        setCourses(fetchedCourses.filter(course =>
          course.teachers?.some(t => t.teacherId === currentUser.id)
        ));
      } else {
        setCourses(fetchedCourses);
      }
    } catch (error: any) {
      console.error('Error loading courses:', error);
      toast.error('Failed to load courses');
    }
  };

  const loadTeachers = async () => {
    try {
      const fetchedTeachers = await usersApi.getUsers({ role: 'teacher', limit: 10000 });
      setTeachers(fetchedTeachers);
    } catch (error: any) {
      console.error('Error loading teachers:', error);
      toast.error('Failed to load teachers');
    }
  };

  const onSubmit = async (data: AssessmentFormData) => {
    try {
      setLoading(true);

      const input: CreateAssessmentInput = {
        courseId: data.courseId,
        teacherId: data.teacherId, // Include teacherId for admins
        title: data.title,
        description: data.description,
        maxScore: data.maxScore,
        startTime: new Date(data.startTime).toISOString(),
        endTime: new Date(data.endTime).toISOString(),
      };

      if (assessment) {
        await assessmentsApi.updateAssessment(assessment.id, input);

        // Upload question papers if any were selected during edit
        if (selectedFiles.length > 0) {
          await assessmentsApi.uploadAssessmentFiles(assessment.id, selectedFiles);
        }

        // Upload marking schemes if any were selected during edit
        if (selectedMarkingSchemes.length > 0) {
          await assessmentsApi.uploadAssessmentFiles(assessment.id, selectedMarkingSchemes, 'marking_scheme');
        }

        toast.success('Assessment updated successfully');
      } else {
        const createdAssessment = await assessmentsApi.createAssessment(input);

        try {
          // Upload question papers if any were selected
          if (selectedFiles.length > 0) {
            await assessmentsApi.uploadAssessmentFiles(createdAssessment.id, selectedFiles);
          }

          // Upload marking schemes if any were selected
          if (selectedMarkingSchemes.length > 0) {
            await assessmentsApi.uploadAssessmentFiles(createdAssessment.id, selectedMarkingSchemes, 'marking_scheme');
          }
        } catch (uploadError: any) {
          // Rollback: delete the created assessment if file upload fails
          try {
            await assessmentsApi.deleteAssessment(createdAssessment.id);
          } catch {
            // Ignore rollback failure
          }
          throw uploadError;
        }

        toast.success('Assessment created successfully');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving assessment:', error);
      toast.error(error.response?.data?.message || 'Failed to save assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      const pdfFiles = fileArray.filter(file => file.type === 'application/pdf');

      if (pdfFiles.length !== fileArray.length) {
        toast.error('Only PDF files are allowed');
      }

      if (pdfFiles.length > 5) {
        toast.error('Maximum 5 files allowed');
        setSelectedFiles(pdfFiles.slice(0, 5));
      } else {
        setSelectedFiles(pdfFiles);
      }
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleMarkingSchemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      const pdfFiles = fileArray.filter(file => file.type === 'application/pdf');

      if (pdfFiles.length !== fileArray.length) {
        toast.error('Only PDF files are allowed');
      }

      if (pdfFiles.length > 5) {
        toast.error('Maximum 5 files allowed');
        setSelectedMarkingSchemes(pdfFiles.slice(0, 5));
      } else {
        setSelectedMarkingSchemes(pdfFiles);
      }
    }
  };

  const removeMarkingScheme = (index: number) => {
    setSelectedMarkingSchemes(prev => prev.filter((_, i) => i !== index));
  };

  const deleteExistingMarkingScheme = async (fileId: string) => {
    try {
      await assessmentsApi.deleteAssessmentFile(fileId);
      setExistingMarkingSchemes(prev => prev.filter(f => f.id !== fileId));
      toast.success('Marking scheme deleted');
    } catch (error: any) {
      toast.error('Failed to delete marking scheme');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {assessment ? 'Edit Assessment' : 'Create Assessment'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Course Selection */}
            <Controller
              name="courseId"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  options={courses.map((course) => ({
                    value: course.id,
                    label: course.title,
                    sublabel: course.subject,
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                  label="Course"
                  placeholder="Search and select a course"
                  required
                  disabled={!!assessment}
                  error={errors.courseId?.message}
                />
              )}
            />

            {/* Teacher Selection (Admin Only) */}
            {isAdmin && (
              <Controller
                name="teacherId"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={teachers.map((teacher) => ({
                      value: teacher.id,
                      label: `${teacher.firstName} ${teacher.lastName}`,
                      sublabel: teacher.email,
                    }))}
                    value={field.value || ''}
                    onChange={field.onChange}
                    label="Teacher"
                    placeholder="Search and select a teacher (optional)"
                    required={false}
                    disabled={!!assessment}
                    error={errors.teacherId?.message}
                  />
                )}
              />
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('title')}
                placeholder="e.g., Chapter 5 Assessment"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.title && (
                <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
              )}
            </div>

            {/* Max Score */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Score <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('maxScore')}
                placeholder="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.maxScore && (
                <p className="text-red-500 text-sm mt-1">{errors.maxScore.message}</p>
              )}
            </div>

            {/* Start Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                {...register('startTime')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.startTime && (
                <p className="text-red-500 text-sm mt-1">{errors.startTime.message}</p>
              )}
            </div>

            {/* End Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                {...register('endTime')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.endTime && (
                <p className="text-red-500 text-sm mt-1">{errors.endTime.message}</p>
              )}
            </div>

            {/* Question Papers Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upload Question Papers (PDF, max 5 files)
              </label>

              {/* Show existing question papers when editing */}
              {assessment && existingQuestionPapers.length > 0 && (
                <div className="mb-2 space-y-2">
                  <p className="text-xs font-medium text-gray-600">Existing question papers:</p>
                  {existingQuestionPapers.map((file) => (
                    <div key={file.id} className="flex items-center justify-between bg-blue-50 p-2 rounded">
                      <span className="text-sm text-gray-700 truncate">{file.originalName}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await assessmentsApi.deleteAssessmentFile(file.id);
                            setExistingQuestionPapers(prev => prev.filter(f => f.id !== file.id));
                            toast.success('Question paper deleted');
                          } catch {
                            toast.error('Failed to delete question paper');
                          }
                        }}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {selectedFiles.length > 0 && (
                <div className="mt-2 space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Marking Scheme Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upload Marking Scheme (PDF, max 5 files)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Marking schemes will be visible to students only after the submission deadline.
              </p>

              {/* Show existing marking schemes when editing */}
              {assessment && existingMarkingSchemes.length > 0 && (
                <div className="mb-2 space-y-2">
                  <p className="text-xs font-medium text-gray-600">Existing marking schemes:</p>
                  {existingMarkingSchemes.map((file) => (
                    <div key={file.id} className="flex items-center justify-between bg-green-50 p-2 rounded">
                      <span className="text-sm text-gray-700 truncate">{file.originalName}</span>
                      <button
                        type="button"
                        onClick={() => deleteExistingMarkingScheme(file.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleMarkingSchemeChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {selectedMarkingSchemes.length > 0 && (
                <div className="mt-2 space-y-2">
                  {selectedMarkingSchemes.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeMarkingScheme(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                {...register('description')}
                rows={4}
                placeholder="Provide instructions or details about this assessment..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.description && (
                <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end border-t pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:bg-gray-400"
              >
                {loading ? 'Saving...' : assessment ? 'Update Assessment' : 'Create Assessment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AssessmentForm;
