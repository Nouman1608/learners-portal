import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { coursesApi, roomsApi, Timeslot, Room, CreateTimeslotInput } from '../../api/courses.api';
import { usersApi, User } from '../../api/users.api';
import { calendarApi, Event } from '../../api/calendar.api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, XMarkIcon, VideoCameraIcon, MapPinIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import AttendanceView from '../attendance/AttendanceView';
import { format } from 'date-fns';
import ConfirmDialog from '../common/ConfirmDialog';
import LoadingSpinner from '../common/LoadingSpinner';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

const timeslotSchema = z.object({
  classType: z.enum(['online', 'local', 'hybrid', '1-to-1']),
  teacherId: z.string().optional(),
  roomId: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Select at least one day'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  recurrenceType: z.enum(['weekly', 'biweekly', 'monthly']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.preprocess(
    (val) => val === '' || val === undefined || val === null ? undefined : val,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional()
  ),
}).refine(
  (data) => {
    // Online, hybrid, and 1-to-1 classes require a teacher
    if ((data.classType === 'online' || data.classType === 'hybrid' || data.classType === '1-to-1') && !data.teacherId) {
      return false;
    }
    return true;
  },
  {
    message: 'Online, hybrid, and 1-to-1 classes require a teacher with Teams connection',
    path: ['classType'],
  }
);

type TimeslotFormData = z.infer<typeof timeslotSchema>;

interface TimeslotManagerProps {
  courseId: string;
  onClose: () => void;
}

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export default function TimeslotManager({ courseId, onClose }: TimeslotManagerProps) {
  const { user } = useAuth();
  const [timeslots, setTimeslots] = useState<Timeslot[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedEventForAttendance, setSelectedEventForAttendance] = useState<Event | null>(null);
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();
  const [expandedTimeslots, setExpandedTimeslots] = useState<Set<string>>(new Set());

  const isTeacher = user?.role === 'teacher';
  const canMarkAttendance = isTeacher || user?.role === 'admin' || user?.role === 'sudo';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TimeslotFormData>({
    resolver: zodResolver(timeslotSchema),
    defaultValues: {
      classType: 'local',
      teacherId: '',
      roomId: '',
      daysOfWeek: [1], // Monday by default
      startTime: '09:00',
      endTime: '10:00',
      recurrenceType: 'weekly',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
    },
  });

  const classType = watch('classType');
  const selectedDays = watch('daysOfWeek');

  const toggleDay = (day: number) => {
    const currentDays = selectedDays || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort((a, b) => a - b);
    setValue('daysOfWeek', newDays, { shouldValidate: true });
  };

  useEffect(() => {
    loadData();
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [timeslotsData, roomsData, teachersData, eventsData] = await Promise.all([
        coursesApi.getCourseTimeslots(courseId),
        roomsApi.getRooms(true), // Only active rooms
        usersApi.getUsers({ role: 'teacher', isActive: true, limit: 10000 }), // Fetch all teachers
        calendarApi.getEvents({
          courseId,
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), // Next 30 days
        }),
      ]);
      setTimeslots(timeslotsData);
      setRooms(roomsData);
      setTeachers(teachersData);
      setEvents(eventsData);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load timeslots');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: TimeslotFormData) => {
    try {
      const input: CreateTimeslotInput = {
        classType: data.classType,
        teacherId: data.teacherId || undefined,
        roomId: data.roomId || undefined,
        daysOfWeek: data.daysOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        recurrenceType: data.recurrenceType,
        startDate: data.startDate,
        endDate: data.endDate || undefined,
      };

      await coursesApi.createTimeslot(courseId, input);

      if (data.classType === 'online') {
        toast.success('Online timeslot created with Teams meeting link!');
      } else if (data.classType === 'hybrid') {
        toast.success('Hybrid timeslot created with Teams meeting link!');
      } else if (data.classType === '1-to-1') {
        toast.success('1-to-1 timeslot created with Teams meeting link!');
      } else {
        toast.success('Local timeslot created successfully');
      }

      reset();
      setShowForm(false);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to create timeslot');
    }
  };

  const handleDelete = async (timeslotId: string) => {
    const confirmed = await confirmDialog({
      title: 'Delete Timeslot',
      message: 'Are you sure you want to delete this timeslot?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await coursesApi.deleteTimeslot(courseId, timeslotId);
      toast.success('Timeslot deleted successfully');
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete timeslot');
    }
  };

  const toggleTimeslotExpansion = (timeslotId: string) => {
    const newExpanded = new Set(expandedTimeslots);
    if (newExpanded.has(timeslotId)) {
      newExpanded.delete(timeslotId);
    } else {
      newExpanded.add(timeslotId);
    }
    setExpandedTimeslots(newExpanded);
  };

  const getEventsForTimeslot = (timeslot: Timeslot) => {
    return events
      .filter(event => event.timeslotId === timeslot.id)
      .sort((a, b) => {
        // Sort by date first (ascending - closest first)
        const dateCompare = new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
        if (dateCompare !== 0) return dateCompare;
        // If same date, sort by start time
        return a.startTime.localeCompare(b.startTime);
      });
  };

  const formatEventDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return format(date, 'EEE, MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatTime = (time: string) => {
    try {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return time;
    }
  };

  const getEventStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Manage Timeslots</h2>
            <p className="text-sm text-gray-500 mt-1">Create recurring schedules for this course</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Add Timeslot Button */}
          <div className="mb-6">
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Add Timeslot
            </button>
          </div>

          {/* Timeslot Form */}
          {showForm && (
            <form onSubmit={handleSubmit(onSubmit)} className="mb-6 p-6 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">New Timeslot</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Class Type */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Class Type *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <label className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      classType === 'online'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        {...register('classType')}
                        value="online"
                        className="sr-only"
                      />
                      <VideoCameraIcon className="h-5 w-5 mr-2" />
                      <span className="font-medium">Online</span>
                    </label>

                    <label className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      classType === 'local'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        {...register('classType')}
                        value="local"
                        className="sr-only"
                      />
                      <MapPinIcon className="h-5 w-5 mr-2" />
                      <span className="font-medium">Local</span>
                    </label>

                    <label className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      classType === 'hybrid'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        {...register('classType')}
                        value="hybrid"
                        className="sr-only"
                      />
                      <div className="flex items-center">
                        <VideoCameraIcon className="h-4 w-4 mr-1" />
                        <MapPinIcon className="h-4 w-4 mr-2" />
                      </div>
                      <span className="font-medium">Hybrid</span>
                    </label>

                    <label className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      classType === '1-to-1'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        {...register('classType')}
                        value="1-to-1"
                        className="sr-only"
                      />
                      <VideoCameraIcon className="h-5 w-5 mr-2" />
                      <span className="font-medium">1-to-1</span>
                    </label>
                  </div>
                  {errors.classType && (
                    <p className="mt-1 text-sm text-red-600">{errors.classType.message}</p>
                  )}
                </div>

                {/* Teacher (for online, hybrid, and 1-to-1 classes) */}
                {(classType === 'online' || classType === 'hybrid' || classType === '1-to-1') && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teacher * <span className="text-xs text-gray-500">(Must have Teams connected)</span>
                    </label>
                    <select
                      {...register('teacherId')}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">Select a teacher</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.firstName} {teacher.lastName} ({teacher.email})
                        </option>
                      ))}
                    </select>
                    {errors.teacherId && (
                      <p className="mt-1 text-sm text-red-600">{errors.teacherId.message}</p>
                    )}
                    {classType === 'online' && (
                      <p className="mt-1 text-xs text-blue-600">
                        Teams meeting link will be auto-generated for this timeslot
                      </p>
                    )}
                    {classType === 'hybrid' && (
                      <p className="mt-1 text-xs text-purple-600">
                        Teams meeting link will be auto-generated. Local students attend in-person, online students join via Teams.
                      </p>
                    )}
                    {classType === '1-to-1' && (
                      <p className="mt-1 text-xs text-orange-600">
                        Teams meeting link will be auto-generated for individual tutoring sessions
                      </p>
                    )}
                  </div>
                )}

                {/* Room (optional for all classes) */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Room (Optional)
                  </label>
                  <select
                    {...register('roomId')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">No room assigned</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} (Capacity: {room.capacity})
                      </option>
                    ))}
                  </select>
                  {errors.roomId && (
                    <p className="mt-1 text-sm text-red-600">{errors.roomId.message}</p>
                  )}
                </div>

                {/* Days of Week */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Days of Week * (Select one or more)
                  </label>
                  <div className="grid grid-cols-7 gap-2">
                    {DAYS_OF_WEEK.map((day, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => toggleDay(index)}
                        className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          (selectedDays || []).includes(index)
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {day.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                  {errors.daysOfWeek && (
                    <p className="mt-1 text-sm text-red-600">{errors.daysOfWeek.message}</p>
                  )}
                </div>

                {/* Recurrence Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recurrence *
                  </label>
                  <select
                    {...register('recurrenceType')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {/* Start Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time *
                  </label>
                  <input
                    {...register('startTime')}
                    type="time"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {errors.startTime && (
                    <p className="mt-1 text-sm text-red-600">{errors.startTime.message}</p>
                  )}
                </div>

                {/* End Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time *
                  </label>
                  <input
                    {...register('endTime')}
                    type="time"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {errors.endTime && (
                    <p className="mt-1 text-sm text-red-600">{errors.endTime.message}</p>
                  )}
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    {...register('startDate')}
                    type="date"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {errors.startDate && (
                    <p className="mt-1 text-sm text-red-600">{errors.startDate.message}</p>
                  )}
                </div>

                {/* End Date */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date (Optional)
                  </label>
                  <input
                    {...register('endDate')}
                    type="date"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {errors.endDate && (
                    <p className="mt-1 text-sm text-red-600">{errors.endDate.message}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">Leave empty for ongoing schedule</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Timeslot'}
                </button>
              </div>
            </form>
          )}

          {/* Timeslots List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Existing Timeslots</h3>

            {loading ? (
              <LoadingSpinner message="Loading timeslots..." className="py-8" />
            ) : timeslots.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No timeslots created yet. Click "Add Timeslot" to create one.
              </div>
            ) : (
              <div className="space-y-3">
                {timeslots.map((timeslot) => {
                  const timeslotEvents = getEventsForTimeslot(timeslot);
                  const isExpanded = expandedTimeslots.has(timeslot.id);

                  return (
                    <div
                      key={timeslot.id}
                      className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                    >
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            {/* Class Type Badge */}
                            {(timeslot as any).classType === 'online' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                <VideoCameraIcon className="h-3 w-3 mr-1" />
                                Online
                              </span>
                            ) : (timeslot as any).classType === 'hybrid' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                <VideoCameraIcon className="h-3 w-3 mr-0.5" />
                                <MapPinIcon className="h-3 w-3 mr-1" />
                                Hybrid
                              </span>
                            ) : (timeslot as any).classType === '1-to-1' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                <VideoCameraIcon className="h-3 w-3 mr-1" />
                                1-to-1
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <MapPinIcon className="h-3 w-3 mr-1" />
                                Local
                              </span>
                            )}

                            {/* Days of Week */}
                            <div className="flex flex-wrap gap-1">
                              {timeslot.daysOfWeek.sort((a, b) => a - b).map((day) => (
                                <span key={day} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  {DAYS_OF_WEEK[day].substring(0, 3)}
                                </span>
                              ))}
                            </div>

                            {/* Time */}
                            <span className="text-sm font-medium text-gray-900">
                              {timeslot.startTime} - {timeslot.endTime}
                            </span>

                            {/* Recurrence */}
                            <span className="text-sm text-gray-500 capitalize">
                              ({timeslot.recurrenceType})
                            </span>
                          </div>

                          <button
                            onClick={() => handleDelete(timeslot.id)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>

                        <div className="space-y-2">
                          {/* Date Range */}
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>From: {timeslot.startDate}</span>
                            {timeslot.endDate && <span>To: {timeslot.endDate}</span>}
                          </div>

                          {/* Room or Teams Info */}
                          {((timeslot as any).classType === 'online' || (timeslot as any).classType === 'hybrid' || (timeslot as any).classType === '1-to-1') && (timeslot as any).teamsMeetingUrl && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-600">Teams Meeting:</span>
                              <a
                                href={(timeslot as any).teamsMeetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                              >
                                Join Meeting
                              </a>
                            </div>
                          )}
                          {timeslot.room && (
                            <div className="text-sm text-gray-600">
                              Room: {timeslot.room.name} (Capacity: {timeslot.room.capacity})
                            </div>
                          )}

                          {/* Upcoming Events Toggle */}
                          {timeslotEvents.length > 0 && (
                            <button
                              onClick={() => toggleTimeslotExpansion(timeslot.id)}
                              className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                            >
                              {isExpanded ? '▼' : '▶'} {timeslotEvents.length} Upcoming Event{timeslotEvents.length !== 1 ? 's' : ''}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Events Section */}
                      {isExpanded && timeslotEvents.length > 0 && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-3">
                          {timeslotEvents.map((event) => (
                            <div
                              key={event.id}
                              className="bg-white border border-gray-200 rounded-lg p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatEventDate(event.eventDate)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {formatTime(event.startTime)} - {formatTime(event.endTime)}
                                  </div>
                                </div>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEventStatusColor(event.status)}`}>
                                  {event.status}
                                </span>
                              </div>

                              {event.teacher && (
                                <div className="text-xs text-gray-600">
                                  Teacher: {event.teacher.firstName} {event.teacher.lastName}
                                </div>
                              )}

                              {canMarkAttendance && event.status === 'scheduled' && (
                                <button
                                  onClick={() => setSelectedEventForAttendance(event)}
                                  className="w-full mt-2 inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                  <ClipboardDocumentCheckIcon className="h-4 w-4" />
                                  Mark Attendance
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Attendance Modal */}
      {selectedEventForAttendance && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setSelectedEventForAttendance(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Event Attendance - {selectedEventForAttendance.course.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {formatEventDate(selectedEventForAttendance.eventDate)} at {formatTime(selectedEventForAttendance.startTime)} - {formatTime(selectedEventForAttendance.endTime)}
                </p>
              </div>
              <button
                onClick={() => setSelectedEventForAttendance(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Attendance View */}
            <div className="p-6">
              <AttendanceView
                event={selectedEventForAttendance}
                canSync={canMarkAttendance}
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={() => setSelectedEventForAttendance(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
