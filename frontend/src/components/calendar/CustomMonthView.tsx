import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, startOfWeek, endOfWeek } from 'date-fns';
import { Event } from '../../api/calendar.api';

interface CustomMonthViewProps {
  date: Date;
  events: Event[];
  onSelectEvent: (event: Event) => void;
}

const CustomMonthView: React.FC<CustomMonthViewProps> = ({ date, events, onSelectEvent }) => {
  // Get calendar month grid (including days from prev/next month)
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const daysInCalendar = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    const eventDate = format(new Date(event.eventDate), 'yyyy-MM-dd');
    if (!acc[eventDate]) {
      acc[eventDate] = [];
    }
    acc[eventDate].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  // Sort events by start time within each day
  Object.keys(eventsByDate).forEach(dateKey => {
    eventsByDate[dateKey].sort((a, b) => {
      const timeA = a.startTime.split(':').map(Number);
      const timeB = b.startTime.split(':').map(Number);
      return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
    });
  });

  const getEventColor = (event: Event): string => {
    switch (event.status) {
      case 'completed':
        return 'border-green-400 bg-green-50 text-green-700';
      case 'cancelled':
        return 'border-red-400 bg-red-50 text-red-700';
      case 'rescheduled':
        return 'border-orange-400 bg-orange-50 text-orange-700';
      default:
        // Different colors based on class type
        if (event.classType === 'online') {
          return 'border-blue-400 bg-blue-50 text-blue-700';
        } else if (event.classType === 'local') {
          return 'border-purple-400 bg-purple-50 text-purple-700';
        } else if (event.classType === '1-to-1') {
          return 'border-yellow-400 bg-yellow-50 text-yellow-700';
        } else {
          return 'border-teal-400 bg-teal-50 text-teal-700';
        }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Month/Year Header */}
      <div className="px-6 py-4 border-b">
        <h2 className="text-xl font-semibold text-gray-900">
          {format(date, 'MMMM yyyy')}
        </h2>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-px mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div
              key={day}
              className="text-center text-sm font-semibold text-gray-600 py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {daysInCalendar.map((day, index) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDate[dateKey] || [];
            const isCurrentMonth = isSameMonth(day, date);
            const isTodayDate = isToday(day);

            return (
              <div
                key={index}
                className={`min-h-[140px] max-h-[180px] bg-white p-2 flex flex-col ${
                  !isCurrentMonth ? 'bg-gray-50' : ''
                }`}
              >
                {/* Day Number */}
                <div className="flex justify-between items-start mb-1 flex-shrink-0">
                  <span
                    className={`text-sm font-medium ${
                      isTodayDate
                        ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs'
                        : isCurrentMonth
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {dayEvents.length} events
                    </span>
                  )}
                </div>

                {/* Events List - Scrollable if many events */}
                <div className="space-y-1 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                  {dayEvents.map((event) => {
                    const teacherName = event.teacher
                      ? `${event.teacher.firstName} ${event.teacher.lastName}`
                      : '';

                    return (
                      <button
                        key={event.id}
                        onClick={() => onSelectEvent(event)}
                        className={`w-full text-left px-2 py-1 rounded border-l-3 text-xs hover:shadow-md transition-all hover:scale-[1.02] ${getEventColor(
                          event
                        )}`}
                      >
                        <div className="font-semibold truncate">
                          {event.startTime} {event.course.title}
                        </div>
                        {teacherName && (
                          <div className="text-[10px] opacity-75 truncate">
                            {teacherName}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CustomMonthView;
