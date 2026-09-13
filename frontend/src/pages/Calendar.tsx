import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { calendarApi, Event } from '../api/calendar.api';
import { usersApi } from '../api/users.api';
import EventForm from '../components/calendar/EventForm';
import AttendanceView from '../components/attendance/AttendanceView';
import BackButton from '../components/common/BackButton';
import CustomMonthView from '../components/calendar/CustomMonthView';
import CustomWeekView from '../components/calendar/CustomWeekView';
import CustomDayView from '../components/calendar/CustomDayView';
import CustomAgendaView from '../components/calendar/CustomAgendaView';
import { ArrowDownTrayIcon, PrinterIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import { teacherCourseTitle, studentCourseTitle } from '../utils/course';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SearchableSelect from '../components/common/SearchableSelect';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

type CalendarView = 'month' | 'week' | 'day' | 'agenda';

// Utility function to export events as CSV (timetable format without duplicates)
const exportToCSV = (events: Event[], filename: string) => {
  // Group events by unique timetable slot to remove recurring duplicates
  const timetableMap = new Map<string, Event>();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  events.forEach(event => {
    const eventDate = new Date(event.eventDate);
    const dayOfWeek = eventDate.getDay();
    const key = `${dayOfWeek}-${event.startTime}-${event.endTime}-${event.course.id}-${event.teacher?.id || 'none'}-${event.classType}`;

    if (!timetableMap.has(key)) {
      timetableMap.set(key, event);
    }
  });

  const uniqueEvents = Array.from(timetableMap.values());

  // Sort by day of week, then by time
  const sortedEvents = uniqueEvents.sort((a, b) => {
    const dayA = new Date(a.eventDate).getDay();
    const dayB = new Date(b.eventDate).getDay();
    if (dayA !== dayB) return dayA - dayB;
    return a.startTime.localeCompare(b.startTime);
  });

  const headers = ['Day', 'Start Time', 'End Time', 'Course', 'Teacher', 'Type', 'Location'];
  const rows = sortedEvents.map(event => [
    dayNames[new Date(event.eventDate).getDay()],
    event.startTime,
    event.endTime,
    event.course.title,
    event.teacher ? `${event.teacher.firstName} ${event.teacher.lastName}` : 'TBA',
    event.classType.toUpperCase(),
    event.room?.name || (event.classType === 'online' || event.classType === 'hybrid' ? 'Teams' : '-'),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

// Utility function to export events as iCal (.ics)
const exportToICal = (events: Event[], filename: string) => {
  const formatICalDate = (date: string, time: string) => {
    const datetime = new Date(`${date}T${time}:00`);
    return datetime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escapeICalText = (text: string) => {
    return text.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
  };

  const icalEvents = events.map(event => {
    const startDateTime = formatICalDate(event.eventDate, event.startTime);
    const endDateTime = formatICalDate(event.eventDate, event.endTime);
    const teacherName = event.teacher ? `${event.teacher.firstName} ${event.teacher.lastName}` : 'TBA';
    const location = event.classType === 'online' || event.classType === 'hybrid'
      ? 'Microsoft Teams'
      : event.room?.name || 'TBA';
    const description = [
      `Course: ${event.course.title}`,
      `Teacher: ${teacherName}`,
      `Type: ${event.classType}`,
      event.teamsMeetingUrl ? `Teams Link: ${event.teamsMeetingUrl}` : '',
      event.notes ? `Notes: ${event.notes}` : '',
    ].filter(Boolean).join('\\n');

    return [
      'BEGIN:VEVENT',
      `UID:${event.id}@learners-academy`,
      `DTSTAMP:${formatICalDate(new Date().toISOString().split('T')[0], '00:00')}`,
      `DTSTART:${startDateTime}`,
      `DTEND:${endDateTime}`,
      `SUMMARY:${escapeICalText(event.course.title)}`,
      `DESCRIPTION:${escapeICalText(description)}`,
      `LOCATION:${escapeICalText(location)}`,
      `STATUS:${event.status.toUpperCase()}`,
      event.teamsMeetingUrl ? `URL:${event.teamsMeetingUrl}` : '',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  }).join('\r\n');

  const icalContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Learners Academy//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    icalEvents,
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const CalendarPage: React.FC = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarView>('month');
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [showPdfFilters, setShowPdfFilters] = useState(false);
  const [pdfFilters, setPdfFilters] = useState({
    online: true,
    local: true,
    hybrid: true,
    '1-to-1': true,
  });
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('all');
  const [teachers, setTeachers] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();
  // Calendar view filters (admin/sudo only)
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterClassType, setFilterClassType] = useState<string>('all');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');

  // Close PDF filters dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showPdfFilters && !target.closest('.pdf-filter-dropdown')) {
        setShowPdfFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPdfFilters]);

  // Load events
  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);

      // Calculate date range based on current view - always use full month
      const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const startDate = format(firstDayOfMonth, 'yyyy-MM-dd');
      const endDate = format(lastDayOfMonth, 'yyyy-MM-dd');

      const filters: any = {
        startDate,
        endDate,
      };

      // Role-based filtering is handled by backend
      // Teachers automatically see only their events
      // Students see events for courses they're enrolled in

      const fetchedEvents = await calendarApi.getEvents(filters);
      setEvents(fetchedEvents);
    } catch (error: any) {
      console.error('Error loading events:', error);
      toast.error(error.response?.data?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';

  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';

  // Transform course titles based on role and apply filters
  const displayEvents = useMemo(() => {
    let filtered = events;

    // Apply admin/sudo filters
    if (isAdmin) {
      if (filterCategory !== 'all') {
        filtered = filtered.filter(e => e.course.courseCategory === filterCategory);
      }
      if (filterClassType !== 'all') {
        filtered = filtered.filter(e => e.classType === filterClassType);
      }
      if (filterTeacher !== 'all') {
        filtered = filtered.filter(e => e.teacher?.id === filterTeacher);
      }
    }

    if (isTeacher) {
      return filtered.map(e => ({
        ...e,
        course: { ...e.course, title: teacherCourseTitle(e.course.title) },
      }));
    }
    if (isStudent) {
      return filtered.map(e => ({
        ...e,
        course: { ...e.course, title: studentCourseTitle(e.course.title, e.course.subject) },
      }));
    }
    return filtered;
  }, [events, isTeacher, isStudent, isAdmin, filterCategory, filterClassType, filterTeacher]);

  // Load teachers for filter (admin and sudo only)
  useEffect(() => {
    const loadTeachers = async () => {
      if (user?.role === 'admin' || user?.role === 'sudo') {
        try {
          const fetchedTeachers = await usersApi.getUsers({
            role: 'teacher',
            isActive: true,
            limit: 10000
          });
          setTeachers(fetchedTeachers);
        } catch (error) {
          console.error('Error loading teachers:', error);
        }
      }
    };

    loadTeachers();
  }, [user]);

  // Handle event selection
  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    setShowEventModal(true);
  };

  // Handle event status updates
  const handleCancelEvent = async (eventId: string) => {
    try {
      await calendarApi.cancelEvent(eventId);
      toast.success('Event cancelled successfully');
      setShowEventModal(false);
      loadEvents();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to cancel event');
    }
  };

  const handleCompleteEvent = async (eventId: string) => {
    try {
      await calendarApi.completeEvent(eventId);
      toast.success('Event marked as completed');
      setShowEventModal(false);
      loadEvents();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to complete event');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = await confirmDialog({
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event? This action cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await calendarApi.deleteEvent(eventId);
      toast.success('Event deleted successfully');
      setShowEventModal(false);
      loadEvents();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete event');
    }
  };

  const handleDeleteRecurringEvents = async (eventId: string) => {
    const confirmed = await confirmDialog({
      title: 'Delete All Recurring Events',
      message: 'Are you sure you want to delete ALL recurring instances of this event? This action cannot be undone.',
      confirmLabel: 'Delete All',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const result = await calendarApi.deleteRecurringEvents(eventId);
      toast.success(`${result.message} (${result.deletedCount} events deleted)`);
      setShowEventModal(false);
      loadEvents();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete recurring events');
    }
  };

  // Navigation handlers
  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setDate(new Date());
      return;
    }

    const isPrev = direction === 'prev';

    switch (view) {
      case 'month':
        setDate(isPrev ? subMonths(date, 1) : addMonths(date, 1));
        break;
      case 'week':
      case 'agenda':
        setDate(isPrev ? subWeeks(date, 1) : addWeeks(date, 1));
        break;
      case 'day':
        setDate(isPrev ? subDays(date, 1) : addDays(date, 1));
        break;
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    const filename = `calendar-${format(date, 'yyyy-MM')}.csv`;
    exportToCSV(displayEvents, filename);
    toast.success('Calendar exported as CSV');
  };

  const handleExportICal = () => {
    const filename = `calendar-${format(date, 'yyyy-MM')}.ics`;
    exportToICal(displayEvents, filename);
    toast.success('Calendar exported as iCal');
  };

  const handlePrint = async () => {
    try {
      toast.loading('Generating PDF...', { id: 'pdf-generation' });

      // Fetch all events for the current view
      let startDate: Date;
      let endDate: Date;

      switch (view) {
        case 'month':
          startDate = startOfMonth(date);
          endDate = endOfMonth(date);
          break;
        case 'week':
          startDate = startOfWeek(date);
          endDate = endOfWeek(date);
          break;
        case 'day':
          startDate = startOfDay(date);
          endDate = endOfDay(date);
          break;
        case 'agenda':
          startDate = startOfWeek(date);
          endDate = addWeeks(endOfWeek(date), 3); // 4 weeks ahead for agenda
          break;
      }

      // Fetch events for the date range
      const filters: any = {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
      };

      const fetchedEvents = await calendarApi.getEvents(filters);

      // Transform course titles based on role
      const processedEvents = isTeacher
        ? fetchedEvents.map(e => ({ ...e, course: { ...e.course, title: teacherCourseTitle(e.course.title) } }))
        : isStudent
        ? fetchedEvents.map(e => ({ ...e, course: { ...e.course, title: studentCourseTitle(e.course.title, e.course.subject) } }))
        : fetchedEvents;

      // Filter events by selected class types and teacher
      let filteredEvents = processedEvents.filter(event => {
        const matchesClassType = pdfFilters[event.classType as keyof typeof pdfFilters];
        const matchesTeacher = selectedTeacherFilter === 'all' || event.teacher?.id === selectedTeacherFilter;
        return matchesClassType && matchesTeacher;
      });

      // Check if any events match the filters
      if (filteredEvents.length === 0) {
        toast.error('No events match the selected filters', { id: 'pdf-generation' });
        return;
      }

      // Group events by unique timetable slot (to avoid duplicates from recurring events)
      // Key: dayOfWeek-startTime-endTime-courseId-teacherId-classType
      const timetableMap = new Map<string, Event>();

      filteredEvents.forEach(event => {
        const eventDate = new Date(event.eventDate);
        const dayOfWeek = eventDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const key = `${dayOfWeek}-${event.startTime}-${event.endTime}-${event.course.id}-${event.teacher?.id || 'none'}-${event.classType}`;

        // Only keep the first occurrence of each recurring slot
        if (!timetableMap.has(key)) {
          timetableMap.set(key, event);
        }
      });

      const uniqueEvents = Array.from(timetableMap.values());

      // Sort by day of week, then by time
      const sortedEvents = uniqueEvents.sort((a, b) => {
        const dayA = new Date(a.eventDate).getDay();
        const dayB = new Date(b.eventDate).getDay();
        if (dayA !== dayB) return dayA - dayB;
        return a.startTime.localeCompare(b.startTime);
      });

      // Generate PDF
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      // Add header
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Learners Academy - Weekly Timetable', 15, 15);

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      const filterText = selectedTeacherFilter !== 'all'
        ? `Teacher: ${teachers.find(t => t.id === selectedTeacherFilter)?.firstName} ${teachers.find(t => t.id === selectedTeacherFilter)?.lastName}`
        : 'All Teachers';
      pdf.text(filterText, 15, 23);

      // Prepare calendar grid data
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      // Group events by day of week
      const eventsByDay: { [key: number]: Event[] } = {};
      sortedEvents.forEach(event => {
        const dayOfWeek = new Date(event.eventDate).getDay();
        if (!eventsByDay[dayOfWeek]) {
          eventsByDay[dayOfWeek] = [];
        }
        eventsByDay[dayOfWeek].push(event);
      });

      // Get all unique time slots with their end times
      const timeSlotMap = new Map<string, string>(); // startTime -> endTime
      sortedEvents.forEach(event => {
        if (!timeSlotMap.has(event.startTime)) {
          timeSlotMap.set(event.startTime, event.endTime);
        }
      });
      const sortedTimeSlots = Array.from(timeSlotMap.keys()).sort();

      // Find which days have events
      const activeDays = Object.keys(eventsByDay).map(Number).sort();

      // Calendar grid dimensions
      const pageHeight = pdf.internal.pageSize.height;
      const marginTop = 35;
      const marginBottom = 20;
      const headerHeight = 12;
      const minRowHeight = 28; // Minimum row height
      const heightPerEvent = 18; // Height needed per event (increased for 2-line course titles)
      const timeColumnWidth = 28;
      const dayColumnWidth = (pdf.internal.pageSize.width - 30 - timeColumnWidth) / activeDays.length;

      // Function to calculate row height based on maximum events in any cell for that time slot
      const calculateRowHeight = (timeSlot: string): number => {
        let maxEvents = 1;
        activeDays.forEach((day) => {
          const eventsForSlot = (eventsByDay[day] || []).filter(e => e.startTime === timeSlot);
          maxEvents = Math.max(maxEvents, eventsForSlot.length);
        });
        // Calculate height: base padding + (events * height per event)
        // Base padding of 12mm provides room at top/bottom
        return Math.max(minRowHeight, 12 + (maxEvents * heightPerEvent));
      };

      // Function to draw header row
      const drawHeader = (yPosition: number) => {
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setFillColor(41, 128, 185);
        pdf.setDrawColor(41, 128, 185);

        // Draw time column header
        pdf.rect(15, yPosition, timeColumnWidth, headerHeight, 'FD');
        pdf.setTextColor(255, 255, 255);
        pdf.text('Time', 15 + timeColumnWidth / 2, yPosition + 8, { align: 'center' });

        // Draw day headers
        activeDays.forEach((day, index) => {
          const x = 15 + timeColumnWidth + (index * dayColumnWidth);
          pdf.setFillColor(41, 128, 185);
          pdf.rect(x, yPosition, dayColumnWidth, headerHeight, 'FD');
          pdf.setTextColor(255, 255, 255);
          pdf.text(dayNames[day], x + dayColumnWidth / 2, yPosition + 8, { align: 'center' });
        });
      };

      // Draw initial header
      let currentY = marginTop;
      drawHeader(currentY);
      currentY += headerHeight;

      // Draw grid rows for each time slot
      pdf.setFont('helvetica', 'normal');

      sortedTimeSlots.forEach((timeSlot) => {
        // Calculate dynamic row height for this time slot
        const rowHeight = calculateRowHeight(timeSlot);

        // Check if we need a new page
        if (currentY + rowHeight > pageHeight - marginBottom) {
          pdf.addPage();
          currentY = marginTop;
          drawHeader(currentY);
          currentY += headerHeight;
        }

        const y = currentY;
        const endTime = timeSlotMap.get(timeSlot) || '';

        // Draw time cell with time range
        pdf.setFillColor(245, 245, 245);
        pdf.setDrawColor(180, 180, 180);
        pdf.rect(15, y, timeColumnWidth, rowHeight, 'FD');
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(7);
        pdf.text(timeSlot, 15 + timeColumnWidth / 2, y + 10, { align: 'center' });
        pdf.text(endTime, 15 + timeColumnWidth / 2, y + 18, { align: 'center' });

        // Draw cells for each day
        activeDays.forEach((day, colIndex) => {
          const x = 15 + timeColumnWidth + (colIndex * dayColumnWidth);

          // Find events for this day and time slot
          const eventsForSlot = (eventsByDay[day] || []).filter(e => e.startTime === timeSlot);

          if (eventsForSlot.length > 0) {
            // Use light gray background if multiple events, otherwise use class type color
            if (eventsForSlot.length > 1) {
              pdf.setFillColor(240, 240, 240); // Light gray for multiple events
            } else {
              // Set background color based on class type for single event
              const event = eventsForSlot[0];
              switch (event.classType) {
                case 'online':
                  pdf.setFillColor(209, 231, 255); // Light blue
                  break;
                case 'local':
                  pdf.setFillColor(232, 218, 239); // Light purple
                  break;
                case 'hybrid':
                  pdf.setFillColor(214, 245, 239); // Light teal
                  break;
                case '1-to-1':
                  pdf.setFillColor(255, 236, 217); // Light orange
                  break;
                default:
                  pdf.setFillColor(255, 255, 255);
              }
            }

            pdf.rect(x, y, dayColumnWidth, rowHeight, 'FD');
            pdf.setDrawColor(150, 150, 150);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, dayColumnWidth, rowHeight, 'S');

            // Draw all events in this slot
            pdf.setTextColor(0, 0, 0);
            let eventY = y + 4; // Starting Y position for first event

            eventsForSlot.forEach((event, eventIndex) => {
              const teacherText = event.teacher
                ? `${event.teacher.firstName} ${event.teacher.lastName}`
                : 'TBA';
              const location = event.room?.name || (event.classType === 'online' || event.classType === 'hybrid' ? 'Teams' : '-');

              // Course title with text wrapping (bold, larger font)
              pdf.setFontSize(7);
              pdf.setFont('helvetica', 'bold');
              const courseLines = pdf.splitTextToSize(event.course.title, dayColumnWidth - 4);
              const maxLines = 2; // Allow up to 2 lines for course title
              const displayLines = courseLines.slice(0, maxLines);
              displayLines.forEach((line: string) => {
                pdf.text(line, x + 2, eventY);
                eventY += 3.5;
              });

              // Teacher name
              pdf.setFontSize(6);
              pdf.setFont('helvetica', 'normal');
              pdf.text(teacherText, x + 2, eventY);
              eventY += 3.5;

              // Type and location
              pdf.setFontSize(6);
              pdf.text(`${event.classType.toUpperCase()} | ${location}`, x + 2, eventY);
              eventY += 4.5;

              // Draw separator line between events (except after last event)
              if (eventIndex < eventsForSlot.length - 1) {
                pdf.setDrawColor(180, 180, 180);
                pdf.setLineWidth(0.1);
                pdf.line(x + 2, eventY - 1, x + dayColumnWidth - 2, eventY - 1);
                eventY += 1.5;
              }
            });
          } else {
            // Draw empty cell
            pdf.setFillColor(255, 255, 255);
            pdf.rect(x, y, dayColumnWidth, rowHeight, 'FD');
            pdf.setDrawColor(220, 220, 220);
            pdf.setLineWidth(0.2);
            pdf.rect(x, y, dayColumnWidth, rowHeight, 'S');
          }
        });

        currentY += rowHeight;
      });

      // Add legend for class types (check if there's space on current page)
      const legendHeight = 15;
      if (currentY + legendHeight > pageHeight - marginBottom) {
        pdf.addPage();
        currentY = marginTop;
      }

      const legendY = currentY + 10;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Class Types:', 15, legendY);

      const legendItems = [
        { type: 'Online', color: [209, 231, 255] },
        { type: 'Local', color: [232, 218, 239] },
        { type: 'Hybrid', color: [214, 245, 239] },
        { type: '1-to-1', color: [255, 236, 217] },
      ];

      pdf.setFont('helvetica', 'normal');
      legendItems.forEach((item, index) => {
        const x = 15 + (index * 35);
        pdf.setFillColor(item.color[0], item.color[1], item.color[2]);
        pdf.rect(x, legendY + 2, 5, 5, 'F');
        pdf.text(item.type, x + 7, legendY + 6);
      });

      // Add footer
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'italic');
        pdf.text(
          `Page ${i} of ${pageCount} - Generated on ${format(new Date(), 'MMM dd, yyyy HH:mm')}`,
          15,
          pdf.internal.pageSize.height - 10
        );
      }

      // Save PDF
      const filename = `calendar-${view}-${format(date, 'yyyy-MM-dd')}.pdf`;
      pdf.save(filename);

      toast.success('PDF generated successfully!', { id: 'pdf-generation' });
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF', { id: 'pdf-generation' });
    }
  };

  if (loading && events.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading calendar..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow print:shadow-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <BackButton to="/dashboard" />
              <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
            </div>
            <div className="flex gap-2">
              {(user?.role === 'admin' || user?.role === 'sudo' || user?.role === 'teacher') && (
                <button
                  onClick={() => {
                    setEditingEvent(null);
                    setShowEventForm(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                >
                  Create Event
                </button>
              )}
              {user?.role === 'admin' && (
                <button
                  onClick={async () => {
                    try {
                      const result = await calendarApi.generateUpcomingEvents(30);
                      toast.success(result.message);
                      loadEvents();
                    } catch (error: any) {
                      toast.error(error.response?.data?.message || 'Failed to generate events');
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
                >
                  Generate Events
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-wrap justify-between items-center gap-4">
            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-blue-500 rounded mr-2"></div>
                <span>Online</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-purple-500 rounded mr-2"></div>
                <span>Local</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-teal-500 rounded mr-2"></div>
                <span>Hybrid</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-yellow-500 rounded mr-2"></div>
                <span>1-to-1</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
                <span>Completed</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-red-500 rounded mr-2"></div>
                <span>Cancelled</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-orange-500 rounded mr-2"></div>
                <span>Rescheduled</span>
              </div>
            </div>

            {/* View Selector and Export/Print Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* View Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setView('month')}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    view === 'month'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setView('week')}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    view === 'week'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setView('day')}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    view === 'day'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Day
                </button>
                <button
                  onClick={() => setView('agenda')}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    view === 'agenda'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Agenda
                </button>
              </div>

              {/* Divider */}
              <div className="h-6 w-px bg-gray-300"></div>

              {/* Export/Print Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition flex items-center gap-1"
                  title="Export as CSV"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  CSV
                </button>
                <button
                  onClick={handleExportICal}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition flex items-center gap-1"
                  title="Export as iCal"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  iCal
                </button>

                {/* PDF Export with Filters */}
                <div className="relative pdf-filter-dropdown">
                  <button
                    onClick={() => setShowPdfFilters(!showPdfFilters)}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition flex items-center gap-1"
                    title="Generate PDF with Filters"
                  >
                    <PrinterIcon className="h-4 w-4" />
                    PDF
                  </button>

                  {/* Filter Dropdown */}
                  {showPdfFilters && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Filter by Class Type</h3>
                        <div className="space-y-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={pdfFilters.online}
                              onChange={(e) => setPdfFilters({ ...pdfFilters, online: e.target.checked })}
                              className="mr-2 h-4 w-4 text-blue-600 rounded"
                            />
                            <span className="text-sm text-gray-700">Online</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={pdfFilters.local}
                              onChange={(e) => setPdfFilters({ ...pdfFilters, local: e.target.checked })}
                              className="mr-2 h-4 w-4 text-blue-600 rounded"
                            />
                            <span className="text-sm text-gray-700">Local</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={pdfFilters.hybrid}
                              onChange={(e) => setPdfFilters({ ...pdfFilters, hybrid: e.target.checked })}
                              className="mr-2 h-4 w-4 text-blue-600 rounded"
                            />
                            <span className="text-sm text-gray-700">Hybrid</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={pdfFilters['1-to-1']}
                              onChange={(e) => setPdfFilters({ ...pdfFilters, '1-to-1': e.target.checked })}
                              className="mr-2 h-4 w-4 text-blue-600 rounded"
                            />
                            <span className="text-sm text-gray-700">1-to-1</span>
                          </label>
                        </div>
                      </div>

                      {/* Teacher Filter (admin and sudo only) */}
                      {(user?.role === 'admin' || user?.role === 'sudo') && teachers.length > 0 && (
                        <div className="mb-3 pt-3 border-t border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Filter by Teacher</h3>
                          <div className="w-full">
                            <SearchableSelect
                              options={[
                                { value: 'all', label: 'All Teachers' },
                                ...teachers.map((teacher) => ({
                                  value: teacher.id,
                                  label: `${teacher.firstName} ${teacher.lastName}`,
                                })),
                              ]}
                              value={selectedTeacherFilter}
                              onChange={(v) => setSelectedTeacherFilter(v || 'all')}
                              placeholder="All Teachers"
                              size="sm"
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-3 border-t border-gray-200">
                        <button
                          onClick={() => {
                            setPdfFilters({ online: true, local: true, hybrid: true, '1-to-1': true });
                          }}
                          className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => {
                            setShowPdfFilters(false);
                            handlePrint();
                          }}
                          className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                        >
                          Generate PDF
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters (admin/sudo only) */}
        {isAdmin && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Categories</option>
                  <option value="senior">Senior</option>
                  <option value="junior">Junior</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class Type</label>
                <select
                  value={filterClassType}
                  onChange={(e) => setFilterClassType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Types</option>
                  <option value="online">Online</option>
                  <option value="local">Local</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="1-to-1">1-to-1</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                <div className="w-full">
                  <SearchableSelect
                    options={[
                      { value: 'all', label: 'All Teachers' },
                      ...teachers.map((teacher) => ({
                        value: teacher.id,
                        label: `${teacher.firstName} ${teacher.lastName}`,
                      })),
                    ]}
                    value={filterTeacher}
                    onChange={(v) => setFilterTeacher(v || 'all')}
                    placeholder="All Teachers"
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Controls */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => handleNavigate('prev')}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
          >
            ← Previous
          </button>
          <button
            onClick={() => handleNavigate('today')}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
          >
            Today
          </button>
          <button
            onClick={() => handleNavigate('next')}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
          >
            Next →
          </button>
        </div>

        {/* Calendar Views */}
        {view === 'month' && (
          <CustomMonthView
            date={date}
            events={displayEvents}
            onSelectEvent={handleSelectEvent}
          />
        )}

        {view === 'week' && (
          <CustomWeekView
            date={date}
            events={displayEvents}
            onSelectEvent={handleSelectEvent}
          />
        )}

        {view === 'day' && (
          <CustomDayView
            date={date}
            events={displayEvents}
            onSelectEvent={handleSelectEvent}
          />
        )}

        {view === 'agenda' && (
          <CustomAgendaView
            date={date}
            events={displayEvents}
            onSelectEvent={handleSelectEvent}
          />
        )}
      </main>

      {/* Event Details Modal */}
      {showEventModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Event Details</h2>
                <button
                  onClick={() => setShowEventModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Course</p>
                  <p className="font-medium text-lg">{selectedEvent.course.title}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="font-medium">{format(new Date(selectedEvent.eventDate), 'PPP')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Time</p>
                    <p className="font-medium">{selectedEvent.startTime} - {selectedEvent.endTime}</p>
                  </div>
                </div>

                {selectedEvent.teacher && (
                  <div>
                    <p className="text-sm text-gray-600">Teacher</p>
                    <p className="font-medium">{selectedEvent.teacher.firstName} {selectedEvent.teacher.lastName}</p>
                  </div>
                )}

                {selectedEvent.room && (
                  <div>
                    <p className="text-sm text-gray-600">Room</p>
                    <p className="font-medium">{selectedEvent.room.name} (Capacity: {selectedEvent.room.capacity})</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    selectedEvent.status === 'completed' ? 'bg-green-100 text-green-800' :
                    selectedEvent.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    selectedEvent.status === 'rescheduled' ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}
                  </span>
                </div>

                {selectedEvent.notes && (
                  <div>
                    <p className="text-sm text-gray-600">Notes</p>
                    <p className="text-gray-900">{selectedEvent.notes}</p>
                  </div>
                )}

                {/* Teams Meeting Info */}
                {(selectedEvent.teamsMeetingId || selectedEvent.teamsMeetingUrl) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-900">Microsoft Teams Meeting</p>
                        {selectedEvent.attendanceSynced && (
                          <p className="text-xs text-blue-700 mt-1">
                            Attendance automatically synced from Teams
                          </p>
                        )}
                      </div>
                      {selectedEvent.teamsMeetingUrl && (
                        <a
                          href={selectedEvent.teamsMeetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Join Teams
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Attendance Section */}
              {(user?.role === 'admin' || user?.role === 'sudo' || user?.role === 'teacher') && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <AttendanceView
                    event={selectedEvent}
                    canSync={true}
                  />
                </div>
              )}

              {/* Actions */}
              {(user?.role === 'admin' || user?.role === 'sudo' || user?.role === 'teacher') && (
                <div className="mt-6 border-t pt-4">
                  <div className="flex gap-2 justify-end">
                    {selectedEvent.status === 'scheduled' && (
                      <>
                        <button
                          onClick={() => {
                            setEditingEvent(selectedEvent);
                            setShowEventModal(false);
                            setShowEventForm(true);
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                        >
                          Edit Event
                        </button>
                        <button
                          onClick={() => handleCompleteEvent(selectedEvent.id)}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
                        >
                          Mark as Completed
                        </button>
                        <button
                          onClick={() => handleCancelEvent(selectedEvent.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
                        >
                          Cancel Event
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setShowEventModal(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition"
                    >
                      Close
                    </button>
                  </div>

                  {/* Delete Actions (Sudo Only) */}
                  {user?.role === 'sudo' && (
                    <div className="flex gap-2 justify-end mt-3 pt-3 border-t border-gray-200">
                      <button
                        onClick={() => handleDeleteEvent(selectedEvent.id)}
                        className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 transition text-sm"
                      >
                        Delete Event
                      </button>
                      {selectedEvent.timeslotId && (
                        <button
                          onClick={() => handleDeleteRecurringEvents(selectedEvent.id)}
                          className="px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-800 transition text-sm"
                        >
                          Delete All Recurring
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Event Form Modal */}
      {showEventForm && (
        <EventForm
          event={editingEvent || undefined}
          onClose={() => {
            setShowEventForm(false);
            setEditingEvent(null);
          }}
          onSuccess={() => {
            loadEvents();
          }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default CalendarPage;
