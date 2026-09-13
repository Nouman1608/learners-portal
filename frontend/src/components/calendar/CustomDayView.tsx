import React from 'react';
import { format, isToday } from 'date-fns';
import { Event } from '../../api/calendar.api';

interface CustomDayViewProps {
  date: Date;
  events: Event[];
  onSelectEvent: (event: Event) => void;
}

const CustomDayView: React.FC<CustomDayViewProps> = ({ date, events, onSelectEvent }) => {
  // Time slots for all 24 hours (0-23)
  const timeSlots = Array.from({ length: 24 }, (_, i) => i);

  const dateKey = format(date, 'yyyy-MM-dd');
  const isTodayDate = isToday(date);

  // Filter events for this specific day
  const dayEvents = events.filter(
    (event) => format(new Date(event.eventDate), 'yyyy-MM-dd') === dateKey
  );

  // Group events by hour
  const eventsByHour = dayEvents.reduce((acc, event) => {
    const startHour = parseInt(event.startTime.split(':')[0]);
    if (!acc[startHour]) {
      acc[startHour] = [];
    }
    acc[startHour].push(event);
    return acc;
  }, {} as Record<number, Event[]>);

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
      {/* Day Header */}
      <div className={`px-6 py-4 border-b ${isTodayDate ? 'bg-blue-50' : 'bg-gray-50'}`}>
        <h2 className="text-2xl font-semibold text-gray-900">
          {format(date, 'EEEE, MMMM d, yyyy')}
        </h2>
        {isTodayDate && (
          <p className="text-sm text-blue-600 mt-1">Today</p>
        )}
      </div>

      {/* Day Schedule */}
      <div className="overflow-y-auto max-h-[700px]">
        {timeSlots.map((hour) => {
          const hourEvents = eventsByHour[hour] || [];

          return (
            <div key={hour} className="flex border-b min-h-[100px]">
              {/* Time Label */}
              <div className="w-24 flex-shrink-0 p-4 text-right border-r bg-gray-50">
                <div className="text-sm font-medium text-gray-900">
                  {format(new Date().setHours(hour, 0, 0, 0), 'h:mm')}
                </div>
                <div className="text-xs text-gray-500">
                  {format(new Date().setHours(hour, 0, 0, 0), 'a')}
                </div>
              </div>

              {/* Events for this hour */}
              <div className="flex-1 p-4">
                {hourEvents.length === 0 ? (
                  <div className="text-gray-400 text-sm">No events</div>
                ) : (
                  <div className="space-y-2">
                    {hourEvents.map((event) => {
                      const teacherName = event.teacher
                        ? `${event.teacher.firstName} ${event.teacher.lastName}`
                        : '';

                      return (
                        <button
                          key={event.id}
                          onClick={() => onSelectEvent(event)}
                          className={`w-full text-left px-4 py-3 rounded-lg border-l-4 hover:shadow-lg transition-all ${getEventColor(
                            event
                          )}`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-semibold text-base">
                                {event.course.title}
                              </div>
                              <div className="text-sm mt-1">
                                {event.startTime} - {event.endTime}
                              </div>
                              {teacherName && (
                                <div className="text-sm opacity-75 mt-1">
                                  Teacher: {teacherName}
                                </div>
                              )}
                              {event.room && (
                                <div className="text-xs opacity-75 mt-1">
                                  Room: {event.room.name}
                                </div>
                              )}
                            </div>
                            <div className="flex-shrink-0 ml-4">
                              <span className="text-xs px-2 py-1 rounded bg-white bg-opacity-60">
                                {event.classType}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="px-6 py-4 bg-gray-50 border-t">
        <p className="text-sm text-gray-600">
          {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'} scheduled
        </p>
      </div>
    </div>
  );
};

export default CustomDayView;
