import { describe, it, expect } from 'vitest';
import {
  getReminderAttentionLevel,
  getEarliestAttentionStart,
  isReminderAttentionNeeded,
  isReminderOverdue,
  filterAttentionReminders,
  getAttentionCount,
  DEFAULT_APPOINTMENT_OFFSETS
} from '../attention';
import type { Reminder } from '@/types/reminder.types';

// Helper to create mock reminders
function createReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'test-id',
    user_id: 'user-id',
    title: 'Test Reminder',
    type: 'medication',
    date_time: new Date().toISOString(),
    repeat: 'none',
    status: 'pending',
    notification_enabled: true,
    follow_up_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    medications: [],
    notes: null,
    time_of_day: null,
    series_id: null,
    last_popup_date: null,
    follow_up_interval_value: null,
    follow_up_interval_unit: null,
    next_follow_up_date: null,
    notify_offsets_minutes: null,
    pre_notify_offset_minutes: null,
    ...overrides
  };
}

describe('getReminderAttentionLevel', () => {
  it('returns "none" for completed reminders', () => {
    const reminder = createReminder({ status: 'done' });
    expect(getReminderAttentionLevel(reminder)).toBe('none');
  });

  it('returns "none" for reminders with notifications disabled', () => {
    const reminder = createReminder({ notification_enabled: false });
    expect(getReminderAttentionLevel(reminder)).toBe('none');
  });

  it('returns "none" for future reminders', () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 2);
    const reminder = createReminder({ 
      date_time: futureDate.toISOString(),
      type: 'medication',
      repeat: 'daily'
    });
    expect(getReminderAttentionLevel(reminder)).toBe('none');
  });

  it('returns "due" for reminder at exact time', () => {
    const now = new Date();
    const reminder = createReminder({ date_time: now.toISOString() });
    expect(getReminderAttentionLevel(reminder, now)).toBe('due');
  });

  it('returns "overdue" for reminder more than 1 hour past', () => {
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
    const reminder = createReminder({ date_time: twoHoursAgo.toISOString() });
    expect(getReminderAttentionLevel(reminder)).toBe('overdue');
  });

  it('returns "due" for reminder less than 1 hour past', () => {
    const thirtyMinAgo = new Date();
    thirtyMinAgo.setMinutes(thirtyMinAgo.getMinutes() - 30);
    const reminder = createReminder({ date_time: thirtyMinAgo.toISOString() });
    expect(getReminderAttentionLevel(reminder)).toBe('due');
  });
});

describe('getEarliestAttentionStart - Monthly medication 08:00 rule', () => {
  it('returns 08:00 on due date for monthly medications', () => {
    const dueDate = new Date('2024-03-15T14:00:00');
    const reminder = createReminder({
      type: 'medication',
      repeat: 'monthly',
      date_time: dueDate.toISOString()
    });
    
    const attentionStart = getEarliestAttentionStart(reminder);
    expect(attentionStart.getHours()).toBe(8);
    expect(attentionStart.getMinutes()).toBe(0);
    expect(attentionStart.getDate()).toBe(15);
  });

  it('returns exact time for daily medications', () => {
    const dueDate = new Date('2024-03-15T14:30:00');
    const reminder = createReminder({
      type: 'medication',
      repeat: 'daily',
      date_time: dueDate.toISOString()
    });
    
    const attentionStart = getEarliestAttentionStart(reminder);
    expect(attentionStart.getHours()).toBe(14);
    expect(attentionStart.getMinutes()).toBe(30);
  });

  it('returns exact time for weekly medications', () => {
    const dueDate = new Date('2024-03-15T09:00:00');
    const reminder = createReminder({
      type: 'medication',
      repeat: 'weekly',
      date_time: dueDate.toISOString()
    });
    
    const attentionStart = getEarliestAttentionStart(reminder);
    expect(attentionStart.getTime()).toBe(dueDate.getTime());
  });
});

describe('getEarliestAttentionStart - Appointment offsets', () => {
  it('uses default offsets (1 day, 2 hours) when none specified', () => {
    const appointmentDate = new Date('2024-03-15T10:00:00');
    const reminder = createReminder({
      type: 'appointment',
      date_time: appointmentDate.toISOString()
    });
    
    const attentionStart = getEarliestAttentionStart(reminder);
    // Should be 1 day (1440 min) before = March 14 10:00
    const expectedStart = new Date(appointmentDate);
    expectedStart.setMinutes(expectedStart.getMinutes() - Math.max(...DEFAULT_APPOINTMENT_OFFSETS));
    
    expect(attentionStart.getTime()).toBe(expectedStart.getTime());
  });

  it('uses notify_offsets_minutes when specified', () => {
    const appointmentDate = new Date('2024-03-15T10:00:00');
    const reminder = createReminder({
      type: 'appointment',
      date_time: appointmentDate.toISOString(),
      notify_offsets_minutes: [60] // 1 hour before
    });
    
    const attentionStart = getEarliestAttentionStart(reminder);
    // Should be 60 min before (max of array)
    const expectedStart = new Date(appointmentDate);
    expectedStart.setMinutes(expectedStart.getMinutes() - 60);
    
    expect(attentionStart.getTime()).toBe(expectedStart.getTime());
  });
});

describe('isReminderAttentionNeeded', () => {
  it('returns true for due reminders', () => {
    const now = new Date();
    const reminder = createReminder({ date_time: now.toISOString() });
    expect(isReminderAttentionNeeded(reminder, now)).toBe(true);
  });

  it('returns false for future reminders', () => {
    const future = new Date();
    future.setHours(future.getHours() + 5);
    const reminder = createReminder({ 
      date_time: future.toISOString(),
      type: 'medication',
      repeat: 'daily'
    });
    expect(isReminderAttentionNeeded(reminder)).toBe(false);
  });
});

describe('isReminderOverdue', () => {
  it('returns true for overdue reminders', () => {
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
    const reminder = createReminder({ date_time: twoHoursAgo.toISOString() });
    expect(isReminderOverdue(reminder)).toBe(true);
  });

  it('returns true for due reminders', () => {
    const now = new Date();
    const reminder = createReminder({ date_time: now.toISOString() });
    expect(isReminderOverdue(reminder, now)).toBe(true);
  });

  it('returns false for upcoming reminders', () => {
    // Appointment with offset - should be upcoming, not overdue
    const appointmentDate = new Date();
    appointmentDate.setHours(appointmentDate.getHours() + 1);
    const reminder = createReminder({
      type: 'appointment',
      date_time: appointmentDate.toISOString(),
      notify_offsets_minutes: [120] // 2 hours before
    });
    expect(isReminderOverdue(reminder)).toBe(false);
  });
});

describe('filterAttentionReminders & getAttentionCount', () => {
  it('filters only reminders needing attention', () => {
    const now = new Date();
    const pastReminder = createReminder({ 
      id: '1',
      date_time: new Date(now.getTime() - 30 * 60000).toISOString() // 30 min ago
    });
    const futureReminder = createReminder({ 
      id: '2',
      date_time: new Date(now.getTime() + 60 * 60000).toISOString(), // 1 hour future
      type: 'medication',
      repeat: 'daily'
    });
    const doneReminder = createReminder({ 
      id: '3',
      date_time: now.toISOString(),
      status: 'done'
    });
    
    const reminders = [pastReminder, futureReminder, doneReminder];
    const filtered = filterAttentionReminders(reminders, now);
    
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
    expect(getAttentionCount(reminders, now)).toBe(1);
  });
});
