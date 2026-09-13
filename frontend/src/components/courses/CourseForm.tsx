import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { coursesApi, roomsApi, Course, CreateCourseInput, UpdateCourseInput, CreateTimeslotInput } from '../../api/courses.api';
import { usersApi } from '../../api/users.api';
import SearchableSelect from '../common/SearchableSelect';
import toast from 'react-hot-toast';

const courseSchema = z.object({
  courseCategory: z.enum(['senior', 'junior']),
  courseLevel: z.enum(['ig', 'alevel']).optional().or(z.literal('')),
  subject: z.string().max(100).optional().or(z.literal('')),
  teacherName: z.string().min(1, 'Teacher name is required').max(100),
  studentName: z.string().max(100).optional().or(z.literal('')),
  description: z.string().optional(),
  duration: z.number().int().positive('Duration must be a positive number'),
  whatsappGroupLink: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  teacherId: z.preprocess((val) => val === '' ? undefined : val, z.string().uuid('Please select a teacher').optional()),
  isActive: z.boolean().optional(),
});

type CourseFormData = z.infer<typeof courseSchema>;

interface CourseFormProps {
  course: Course | null;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface TimeslotFormData {
  classType: 'online' | 'local' | 'hybrid';
  teacherId?: string;
  roomId?: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  recurrenceType: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  endDate?: string;
}

export default function CourseForm({ course, onClose, onSuccess }: CourseFormProps) {
  const isEditing = !!course;
  const [teachers, setTeachers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [timeslots, setTimeslots] = useState<TimeslotFormData[]>([]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
    defaultValues: isEditing
      ? {
          courseCategory: course.courseCategory || 'senior',
          courseLevel: course.courseLevel || '',
          subject: course.subject || '',
          teacherName: course.teacherName || '',
          studentName: course.studentName || '',
          description: course.description || '',
          duration: course.duration,
          whatsappGroupLink: course.whatsappGroupLink || '',
          teacherId: course.teachers && course.teachers.length > 0 ? course.teachers[0].teacherId : '',
          isActive: course.isActive,
        }
      : {
          courseCategory: 'senior' as 'senior' | 'junior',
          courseLevel: 'ig' as 'ig' | 'alevel' | '',
          subject: '',
          teacherName: '',
          studentName: '',
          description: '',
          duration: 1,
          whatsappGroupLink: '',
          teacherId: '',
          isActive: true,
        },
  });

  const watchCategory = watch('courseCategory');
  const watchLevel = watch('courseLevel');
  const watchSubject = watch('subject');
  const watchTeacherName = watch('teacherName');
  const watchStudentName = watch('studentName');

  const categoryMap: Record<string, string> = { senior: 'S', junior: 'J' };
  const levelMap: Record<string, string> = { ig: 'IG', alevel: 'A Level' };
  const generatedTitle = [
    watchCategory ? categoryMap[watchCategory] || '' : '',
    watchLevel ? levelMap[watchLevel] || '' : '',
    watchSubject || '',
    watchTeacherName || '',
    watchStudentName || '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    // Fetch teachers and rooms
    const fetchData = async () => {
      try {
        const [teachersData, roomsData] = await Promise.all([
          usersApi.getUsers({ role: 'teacher', isActive: true, limit: 10000 }), // Fetch all teachers
          roomsApi.getRooms(true),
        ]);
        console.log('Loaded teachers:', teachersData);
        console.log('Loaded rooms:', roomsData);
        setTeachers(teachersData);
        setRooms(roomsData);

        if (teachersData.length === 0) {
          toast('No active teachers found. Please create a teacher user first.', {
            icon: 'ℹ️',
          });
        }
      } catch (error: any) {
        console.error('Failed to fetch data:', error);
        toast.error('Failed to load teachers and rooms: ' + (error.response?.data?.error || error.message));
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (course) {
      reset({
        courseCategory: course.courseCategory || 'senior',
        courseLevel: course.courseLevel || '',
        subject: course.subject || '',
        teacherName: course.teacherName || '',
        studentName: course.studentName || '',
        description: course.description || '',
        duration: course.duration,
        whatsappGroupLink: course.whatsappGroupLink || '',
        teacherId: course.teachers && course.teachers.length > 0 ? course.teachers[0].teacherId : '',
        isActive: course.isActive,
      });
    }
  }, [course, reset]);

  const addTimeslot = () => {
    const newTimeslot: TimeslotFormData = {
      classType: 'local',
      daysOfWeek: [1], // Monday
      startTime: '09:00',
      endTime: '10:00',
      recurrenceType: 'weekly',
      startDate: new Date().toISOString().split('T')[0],
    };
    setTimeslots([...timeslots, newTimeslot]);
  };

  const removeTimeslot = (index: number) => {
    setTimeslots(timeslots.filter((_, i) => i !== index));
  };

  const updateTimeslot = (index: number, field: keyof TimeslotFormData, value: any) => {
    const updated = [...timeslots];
    updated[index] = { ...updated[index], [field]: value };
    setTimeslots(updated);
  };

  const toggleDay = (timeslotIndex: number, day: number) => {
    const timeslot = timeslots[timeslotIndex];
    const currentDays = timeslot.daysOfWeek || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort((a, b) => a - b);
    updateTimeslot(timeslotIndex, 'daysOfWeek', newDays);
  };

  const onSubmit = async (data: CourseFormData) => {
    try {
      let courseId: string;

      if (isEditing) {
        // Update course basic info — cleared fields are sent as '' so the
        // backend can null them out (|| undefined would drop the key entirely
        // and make clearing a silent no-op)
        const updateData: UpdateCourseInput = {
          courseCategory: data.courseCategory,
          courseLevel: data.courseLevel ?? '',
          subject: data.subject ?? '',
          teacherName: data.teacherName,
          studentName: data.studentName ?? '',
          description: data.description,
          duration: data.duration,
          whatsappGroupLink: data.whatsappGroupLink ?? '',
          isActive: data.isActive,
        };
        await coursesApi.updateCourse(course.id, updateData);
        courseId = course.id;
      } else {
        // Create new course
        const createData: CreateCourseInput = {
          courseCategory: data.courseCategory,
          courseLevel: data.courseLevel || undefined,
          subject: data.subject || undefined,
          teacherName: data.teacherName,
          studentName: data.studentName || undefined,
          description: data.description,
          duration: data.duration,
          whatsappGroupLink: data.whatsappGroupLink || undefined,
        };
        const newCourse = await coursesApi.createCourse(createData);
        courseId = newCourse.id;
      }

      // Handle teacher assignment separately
      if (data.teacherId) {
        try {
          // Get current teachers for this course
          const currentTeachers = await coursesApi.getCourseTeachers(courseId);
          const isAlreadyAssigned = currentTeachers.some(t => t.teacherId === data.teacherId);

          if (!isAlreadyAssigned) {
            // Assign teacher with default 100% cut
            await coursesApi.assignTeacher(courseId, {
              teacherId: data.teacherId,
              percentageCut: '100.00',
            });
          }
        } catch (teacherError: any) {
          console.error('Teacher assignment error:', teacherError);
          // Don't fail the whole operation if teacher assignment fails
          toast('Course saved but teacher assignment may have failed. Please check teacher assignments.', {
            icon: '⚠️',
          });
        }
      }

      // Create timeslots if any
      console.log('Checking timeslots:', { isEditing, timeslotsLength: timeslots.length, timeslots });
      if (timeslots.length > 0) {
        console.log('Creating timeslots for course:', courseId);
        try {
          let successCount = 0;
          for (const timeslot of timeslots) {
            // Validate timeslot has required fields
            if (timeslot.daysOfWeek.length === 0) {
              toast.error('Each timeslot must have at least one day selected');
              continue;
            }
            console.log('Creating timeslot:', timeslot);

            const timeslotInput: CreateTimeslotInput = {
              classType: timeslot.classType,
              teacherId: timeslot.teacherId || undefined,
              roomId: timeslot.roomId || undefined,
              daysOfWeek: timeslot.daysOfWeek,
              startTime: timeslot.startTime,
              endTime: timeslot.endTime,
              recurrenceType: timeslot.recurrenceType,
              startDate: timeslot.startDate,
              endDate: timeslot.endDate || undefined,
            };

            console.log('Sending timeslot request:', timeslotInput);
            await coursesApi.createTimeslot(courseId, timeslotInput);
            successCount++;
            console.log('Timeslot created successfully');
          }

          if (successCount > 0) {
            toast.success(isEditing
              ? `Course updated with ${successCount} new timeslot(s)`
              : `Course created with ${successCount} timeslot(s)`);
          } else {
            toast.success(isEditing ? 'Course updated successfully' : 'Course created successfully');
          }
        } catch (timeslotError: any) {
          console.error('Timeslot creation error:', timeslotError);
          toast(isEditing
            ? 'Course updated but some timeslots may have failed. Please check timeslots.'
            : 'Course created but some timeslots may have failed. Please check timeslots.', {
            icon: '⚠️',
          });
        }
      } else {
        toast.success(isEditing ? 'Course updated successfully' : 'Course created successfully');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Course creation error:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save course';
      toast.error(errorMessage);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditing ? 'Edit Course' : 'Create New Course'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 p-6">
            <div className="space-y-6">
            {/* Course Name Parts */}
            <div className="grid grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <label htmlFor="courseCategory" className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  {...register('courseCategory')}
                  id="courseCategory"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="senior">Senior</option>
                  <option value="junior">Junior</option>
                </select>
                {errors.courseCategory && (
                  <p className="mt-1 text-sm text-red-600">{errors.courseCategory.message}</p>
                )}
              </div>

              {/* Level */}
              <div>
                <label htmlFor="courseLevel" className="block text-sm font-medium text-gray-700 mb-1">
                  Level {watchCategory === 'senior' ? '*' : ''}
                </label>
                <select
                  {...register('courseLevel')}
                  id="courseLevel"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">None</option>
                  <option value="ig">IG</option>
                  <option value="alevel">A Level</option>
                </select>
                {errors.courseLevel && (
                  <p className="mt-1 text-sm text-red-600">{errors.courseLevel.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Subject */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                  Subject {watchCategory === 'senior' ? '*' : ''}
                </label>
                <input
                  {...register('subject')}
                  type="text"
                  id="subject"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., Physics, Maths"
                />
                {errors.subject && (
                  <p className="mt-1 text-sm text-red-600">{errors.subject.message}</p>
                )}
              </div>

              {/* Teacher Name */}
              <div>
                <label htmlFor="teacherName" className="block text-sm font-medium text-gray-700 mb-1">
                  Teacher Name *
                </label>
                <input
                  {...register('teacherName')}
                  type="text"
                  id="teacherName"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., Sir Ahmad"
                />
                {errors.teacherName && (
                  <p className="mt-1 text-sm text-red-600">{errors.teacherName.message}</p>
                )}
              </div>
            </div>

            {/* Student Name (for 1-to-1) */}
            <div>
              <label htmlFor="studentName" className="block text-sm font-medium text-gray-700 mb-1">
                Student Name (1-to-1 only)
              </label>
              <input
                {...register('studentName')}
                type="text"
                id="studentName"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Leave empty for group classes"
              />
            </div>

            {/* Generated Title Preview */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Generated Course Title</label>
              <p className="text-sm font-medium text-gray-900">{generatedTitle || 'Fill in the fields above'}</p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                {...register('description')}
                id="description"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Brief description of the course..."
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>

            {/* Teams Link (only shown when editing) */}
            {isEditing && course?.teamsLink && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-blue-900 mb-2">
                  Microsoft Teams Meeting Link
                </label>
                <div className="flex items-center gap-2">
                  <a
                    href={course.teamsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-3 py-2 bg-white border border-blue-300 rounded-md text-sm text-blue-700 hover:bg-blue-100 transition-colors break-all"
                  >
                    {course.teamsLink}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(course.teamsLink || '');
                      toast.success('Teams link copied to clipboard');
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
                  >
                    Copy Link
                  </button>
                </div>
                <p className="mt-2 text-xs text-blue-700">
                  This link is auto-generated from Teams settings. Students will see this when viewing the course.
                </p>
              </div>
            )}

            {/* WhatsApp Group Link */}
            <div>
              <label htmlFor="whatsappGroupLink" className="block text-sm font-medium text-gray-700 mb-1">
                WhatsApp Group Link
              </label>
              <input
                {...register('whatsappGroupLink')}
                type="url"
                id="whatsappGroupLink"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="https://chat.whatsapp.com/..."
              />
              {errors.whatsappGroupLink && (
                <p className="mt-1 text-sm text-red-600">{errors.whatsappGroupLink.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Optional WhatsApp group link for student communication
              </p>
            </div>

            {/* Teacher */}
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
                  label="Assign Teacher"
                  placeholder="Search and select a teacher"
                  error={errors.teacherId?.message}
                />
              )}
            />
            {isEditing && course.teachers && course.teachers.length > 1 && (
              <p className="mt-1 text-xs text-blue-600">
                Note: This course has multiple teachers assigned. Use the Manage Timeslots view to see all teachers.
              </p>
            )}

            {/* Duration */}
            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
                Duration (months) *
              </label>
              <input
                {...register('duration', { valueAsNumber: true })}
                type="number"
                id="duration"
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., 12"
              />
              {errors.duration && (
                <p className="mt-1 text-sm text-red-600">{errors.duration.message}</p>
              )}
            </div>


            {/* Active Status (only for editing) */}
            {isEditing && (
              <div className="flex items-center">
                <input
                  {...register('isActive')}
                  type="checkbox"
                  id="isActive"
                  className="h-4 w-4 text-blue-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
                  Active
                </label>
              </div>
            )}

            {/* Timeslots */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {isEditing ? 'Add New Timeslots' : 'Add Timeslots (Optional)'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {isEditing
                      ? 'Add new class schedules. Use "Manage Timeslots" to edit existing ones.'
                      : 'Define class schedules for this course. Events will be auto-generated.'}
                  </p>
                </div>
                  <button
                    type="button"
                    onClick={addTimeslot}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Timeslot
                  </button>
                </div>

                {timeslots.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <p className="text-sm text-gray-500">No timeslots added yet. Click "Add Timeslot" to create a schedule.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {timeslots.map((timeslot, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-sm font-medium text-gray-900">Timeslot {index + 1}</h4>
                          <button
                            type="button"
                            onClick={() => removeTimeslot(index)}
                            className="text-red-600 hover:text-red-700 transition-colors"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          {/* Class Type */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Class Type *
                            </label>
                            <select
                              value={timeslot.classType}
                              onChange={(e) => updateTimeslot(index, 'classType', e.target.value as 'online' | 'local' | 'hybrid' | '1-to-1')}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            >
                              <option value="local">Local (In-person)</option>
                              <option value="online">Online</option>
                              <option value="hybrid">Hybrid</option>
                              <option value="1-to-1">1-to-1</option>
                            </select>
                          </div>

                          {/* Teacher Selection */}
                          <SearchableSelect
                            options={teachers.map((teacher) => ({
                              value: teacher.id,
                              label: `${teacher.firstName} ${teacher.lastName}`,
                              sublabel: teacher.email,
                            }))}
                            value={timeslot.teacherId || ''}
                            onChange={(value) => updateTimeslot(index, 'teacherId', value || undefined)}
                            label={`Teacher ${timeslot.classType !== 'local' ? '*' : ''}`}
                            placeholder="Search and select a teacher"
                          />

                          {/* Room Selection */}
                          {timeslot.classType !== 'online' && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Room
                              </label>
                              <select
                                value={timeslot.roomId || ''}
                                onChange={(e) => updateTimeslot(index, 'roomId', e.target.value || undefined)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              >
                                <option value="">No room assigned</option>
                                {rooms.map((room) => (
                                  <option key={room.id} value={room.id}>
                                    {room.name} (Capacity: {room.capacity})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Days of Week */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Days of Week *
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {DAYS_OF_WEEK.map((day, dayIndex) => (
                                <button
                                  key={dayIndex}
                                  type="button"
                                  onClick={() => toggleDay(index, dayIndex)}
                                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    timeslot.daysOfWeek.includes(dayIndex)
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {day.substring(0, 3)}
                                </button>
                              ))}
                            </div>
                            {timeslot.daysOfWeek.length === 0 && (
                              <p className="mt-1 text-sm text-red-600">Select at least one day</p>
                            )}
                          </div>

                          {/* Time Range */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Start Time *
                              </label>
                              <input
                                type="time"
                                value={timeslot.startTime}
                                onChange={(e) => updateTimeslot(index, 'startTime', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                End Time *
                              </label>
                              <input
                                type="time"
                                value={timeslot.endTime}
                                onChange={(e) => updateTimeslot(index, 'endTime', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              />
                            </div>
                          </div>

                          {/* Recurrence Type */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Recurrence *
                            </label>
                            <select
                              value={timeslot.recurrenceType}
                              onChange={(e) => updateTimeslot(index, 'recurrenceType', e.target.value as 'weekly' | 'biweekly' | 'monthly')}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            >
                              <option value="weekly">Weekly</option>
                              <option value="biweekly">Biweekly (Every 2 weeks)</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>

                          {/* Date Range */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Start Date *
                              </label>
                              <input
                                type="date"
                                value={timeslot.startDate}
                                onChange={(e) => updateTimeslot(index, 'startDate', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                End Date (Optional)
                              </label>
                              <div className="relative">
                                <input
                                  type="date"
                                  value={timeslot.endDate || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    updateTimeslot(index, 'endDate', value ? value : undefined);
                                  }}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                                {timeslot.endDate && (
                                  <button
                                    type="button"
                                    onClick={() => updateTimeslot(index, 'endDate', undefined)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    title="Clear end date"
                                  >
                                    <XMarkIcon className="h-5 w-5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 flex-shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Course' : 'Create Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
