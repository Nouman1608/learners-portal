import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { calendarApi, CreateEventInput, UpdateEventInput, Event } from '../../api/calendar.api';
import { coursesApi, Course } from '../../api/courses.api';
import { usersApi, User } from '../../api/users.api';
import SearchableSelect from '../common/SearchableSelect';

const eventSchema = z.object({
  courseId: z.string().uuid('Please select a course'),
  teacherId: z.string().uuid('Please select a teacher').optional(),
  roomId: z.string().uuid().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
  // Teams meeting link is inherited from timeslot (for online classes)
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventFormProps {
  event?: Event; // If provided, we're editing
  onClose: () => void;
  onSuccess: () => void;
}

const EventForm: React.FC<EventFormProps> = ({ event, onClose, onSuccess }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: event
      ? {
          courseId: event.courseId,
          teacherId: event.teacherId || '',
          roomId: event.roomId || '',
          eventDate: event.eventDate,
          startTime: event.startTime,
          endTime: event.endTime,
          notes: event.notes || '',
        }
      : {
          eventDate: new Date().toISOString().split('T')[0],
          startTime: '09:00',
          endTime: '10:00',
        },
  });

  const watchedValues = watch();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [fetchedCourses, fetchedTeachers] = await Promise.all([
        coursesApi.getCourses({ isActive: true }),
        usersApi.getUsers({ role: 'teacher', isActive: true, limit: 10000 }),
      ]);

      setCourses(fetchedCourses);
      setTeachers(fetchedTeachers);
    } catch (error: any) {
      console.error('Error loading form data:', error);
      toast.error('Failed to load form data');
    }
  };

  const checkConflicts = async () => {
    if (!watchedValues.eventDate || !watchedValues.startTime || !watchedValues.endTime) {
      return;
    }

    setCheckingConflicts(true);
    try {
      const result = await calendarApi.checkConflicts({
        eventDate: watchedValues.eventDate,
        startTime: watchedValues.startTime,
        endTime: watchedValues.endTime,
        teacherId: watchedValues.teacherId || undefined,
        roomId: watchedValues.roomId || undefined,
        excludeEventId: event?.id,
      });

      if (result.hasConflict) {
        const messages = result.conflicts.map((c) => c.message).join(', ');
        toast.error(`Conflicts detected: ${messages}`);
      } else {
        toast.success('No conflicts detected');
      }
    } catch (error: any) {
      console.error('Error checking conflicts:', error);
      toast.error('Failed to check conflicts');
    } finally {
      setCheckingConflicts(false);
    }
  };

  const onSubmit = async (data: EventFormData) => {
    try {
      setLoading(true);

      if (event) {
        // Update existing event
        const updateInput: UpdateEventInput = {
          eventDate: data.eventDate,
          startTime: data.startTime,
          endTime: data.endTime,
          teacherId: data.teacherId || undefined,
          roomId: data.roomId || undefined,
          notes: data.notes || undefined,
        };

        await calendarApi.updateEvent(event.id, updateInput);
        toast.success('Event updated successfully');
      } else {
        // Create new event
        // Note: Manual event creation is discouraged. Use timeslots for recurring classes.
        // Teams meeting link will be inherited from the timeslot for online classes.

        const createInput: CreateEventInput = {
          timeslotId: '00000000-0000-0000-0000-000000000000', // Placeholder - would need actual timeslot selection
          courseId: data.courseId,
          teacherId: data.teacherId || undefined,
          roomId: data.roomId || undefined,
          eventDate: data.eventDate,
          startTime: data.startTime,
          endTime: data.endTime,
          notes: data.notes || undefined,
        };

        await calendarApi.createEvent(createInput);
        toast.success('Event created successfully');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving event:', error);
      toast.error(error.response?.data?.message || 'Failed to save event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {event ? 'Edit Event' : 'Create Event'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
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
                  disabled={!!event}
                  error={errors.courseId?.message}
                />
              )}
            />

            {/* Teacher Selection */}
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
                  error={errors.teacherId?.message}
                />
              )}
            />

            {/* Date and Time */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  {...register('eventDate')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.eventDate && (
                  <p className="text-red-500 text-sm mt-1">{errors.eventDate.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  {...register('startTime')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.startTime && (
                  <p className="text-red-500 text-sm mt-1">{errors.startTime.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  {...register('endTime')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.endTime && (
                  <p className="text-red-500 text-sm mt-1">{errors.endTime.message}</p>
                )}
              </div>
            </div>

            {/* Conflict Check Button */}
            <div>
              <button
                type="button"
                onClick={checkConflicts}
                disabled={checkingConflicts}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition disabled:bg-gray-400"
              >
                {checkingConflicts ? 'Checking...' : 'Check for Conflicts'}
              </button>
            </div>

            {/* Info about Teams meeting */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-800">
                <strong>Microsoft Teams:</strong> For online classes, the Teams meeting link is automatically
                generated when you create a timeslot and will be inherited by all events in that timeslot.
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                {...register('notes')}
                rows={3}
                placeholder="Additional notes about this event..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.notes && (
                <p className="text-red-500 text-sm mt-1">{errors.notes.message}</p>
              )}
            </div>

            {!event && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> This is a manual event creation. For recurring events,
                  please use the timeslot system in course management.
                </p>
              </div>
            )}

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
                {loading ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EventForm;
