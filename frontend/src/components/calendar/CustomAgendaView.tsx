import React from 'react';
import { format, isToday, isTomorrow, isYesterday, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { Event } from '../../api/calendar.api';
import EmptyState from '../common/EmptyState';

interface CustomAgendaViewProps {
  date: Date;
  events: Event[];
  onSelectEvent: (event: Event) => void;
}

const CustomAgendaView: React.FC<CustomAgendaViewProps> = ({ date, events, onSelectEvent }) => {
  // Show events for the current week
  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    const eventDate = format(new Date(event.eventDate), 'yyyy-MM-dd');
    if (!acc[eventDate]) {
      acc[eventDate] = [];
    }
    acc[eventDate].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  // Sort events by time within each day
  Object.keys(eventsByDate).forEach((dateKey) => {
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

  const getDateLabel = (day: Date): string => {
    if (isToday(day)) return 'Today';
    if (isTomorrow(day)) return 'Tomorrow';
    if (isYesterday(day)) return 'Yesterday';
    return format(day, 'EEEE');
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <h2 className="text-xl font-semibold text-gray-900">
          Agenda - {format(weekStart, 'MMM d')} to {format(weekEnd, 'MMM d, yyyy')}
        </h2>
      </div>

      {/* Agenda List */}
      <div className="divide-y divide-gray-200 max-h-[700px] overflow-y-auto">
        {daysInWeek.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateKey] || [];
          const isTodayDate = isToday(day);

          if (dayEvents.length === 0) return null;

          return (
            <div key={dateKey} className={isTodayDate ? 'bg-blue-50 bg-opacity-30' : ''}>
              {/* Date Header */}
              <div className={`px-6 py-3 ${isTodayDate ? 'bg-blue-100' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {getDateLabel(day)}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {format(day, 'MMMM d, yyyy')}
                    </p>
                  </div>
                  <div className="text-sm text-gray-600">
                    {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
                  </div>
                </div>
              </div>

              {/* Events for this day */}
              <div className="px-6 py-4 space-y-3">
                {dayEvents.map((event) => {
                  const teacherName = event.teacher
                    ? `${event.teacher.firstName} ${event.teacher.lastName}`
                    : '';

                  return (
                    <button
                      key={event.id}
                      onClick={() => onSelectEvent(event)}
                      className={`w-full text-left p-4 rounded-lg border-l-4 hover:shadow-lg transition-all ${getEventColor(
                        event
                      )}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-medium bg-white bg-opacity-60 px-3 py-1 rounded">
                              {event.startTime} - {event.endTime}
                            </div>
                            <span className="text-xs px-2 py-1 rounded bg-white bg-opacity-40">
                              {event.classType}
                            </span>
                            <span className="text-xs px-2 py-1 rounded bg-white bg-opacity-40 capitalize">
                              {event.status}
                            </span>
                          </div>

                          <div className="mt-2">
                            <h4 className="font-semibold text-base">
                              {event.course.title}
                            </h4>
                          </div>

                          <div className="mt-2 text-sm space-y-1">
                            {teacherName && (
                              <div className="flex items-center gap-2">
                                <svg
                                  className="w-4 h-4 opacity-60"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                  />
                                </svg>
                                <span>{teacherName}</span>
                              </div>
                            )}
                            {event.room && (
                              <div className="flex items-center gap-2">
                                <svg
                                  className="w-4 h-4 opacity-60"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                  />
                                </svg>
                                <span>{event.room.name}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="ml-4">
                          <svg
                            className="w-5 h-5 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* No events message */}
        {Object.keys(eventsByDate).length === 0 && (
          <EmptyState
            icon={CalendarDaysIcon}
            title="No events found for this week"
          />
        )}
      </div>
    </div>
  );
};

export default CustomAgendaView;
