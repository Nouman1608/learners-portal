import React from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isToday } from 'date-fns';
import { Event } from '../../api/calendar.api';

interface CustomWeekViewProps {
  date: Date;
  events: Event[];
  onSelectEvent: (event: Event) => void;
}

const CustomWeekView: React.FC<CustomWeekViewProps> = ({ date, events, onSelectEvent }) => {
  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Time slots for all 24 hours (0-23)
  const timeSlots = Array.from({ length: 24 }, (_, i) => i);

  // Group events by date and hour
  const eventsByDateAndHour = events.reduce((acc, event) => {
    const eventDate = format(new Date(event.eventDate), 'yyyy-MM-dd');
    const startHour = parseInt(event.startTime.split(':')[0]);

    const key = `${eventDate}-${startHour}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  const getEventColor = (event: Event): string => {
    switch (event.status) {
      case 'completed':
        return 'border-green-400 bg-green-50 text-green-700';
      case 'cancelled':
        return 'border-red-400 bg-red-50 text-red-700';
      case 'rescheduled':
        return 'border-orange-400 bg-orange-50 text-orange-700';
      default:
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
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Week Header */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <h2 className="text-xl font-semibold text-gray-900">
          {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
        </h2>
      </div>

      {/* Week Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Day Headers */}
          <div className="grid grid-cols-8 border-b sticky top-0 bg-white z-10">
            <div className="p-4 text-sm font-medium text-gray-500">Time</div>
            {daysInWeek.map((day) => {
              const isTodayDate = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`p-4 text-center border-l ${
                    isTodayDate ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="text-xs text-gray-500 uppercase">
                    {format(day, 'EEE')}
                  </div>
                  <div
                    className={`text-lg font-semibold mt-1 ${
                      isTodayDate
                        ? 'bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto'
                        : 'text-gray-900'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time Slots */}
          {timeSlots.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b min-h-[80px]">
              {/* Time Label */}
              <div className="p-2 text-xs text-gray-500 text-right pr-4">
                {format(new Date().setHours(hour, 0, 0, 0), 'h:mm a')}
              </div>

              {/* Day Cells */}
              {daysInWeek.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const cellKey = `${dateKey}-${hour}`;
                const cellEvents = eventsByDateAndHour[cellKey] || [];
                const isTodayDate = isToday(day);

                return (
                  <div
                    key={cellKey}
                    className={`border-l p-2 ${
                      isTodayDate ? 'bg-blue-50 bg-opacity-30' : ''
                    }`}
                  >
                    <div className="space-y-1">
                      {cellEvents.map((event) => {
                        const teacherName = event.teacher
                          ? `${event.teacher.firstName} ${event.teacher.lastName}`
                          : '';

                        return (
                          <button
                            key={event.id}
                            onClick={() => onSelectEvent(event)}
                            className={`w-full text-left px-2 py-1 rounded border-l-4 text-xs hover:shadow-md transition-all ${getEventColor(
                              event
                            )}`}
                          >
                            <div className="font-semibold truncate">
                              {event.startTime} - {event.endTime}
                            </div>
                            <div className="truncate">{event.course.title}</div>
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
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomWeekView;
