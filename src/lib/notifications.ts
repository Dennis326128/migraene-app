import type { Reminder } from '@/types/reminder.types';

export class NotificationService {
  private static instance: NotificationService;
  private permission: NotificationPermission = 'default';

  private constructor() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    if (this.permission === 'granted') {
      return true;
    }

    const permission = await Notification.requestPermission();
    this.permission = permission;
    return permission === 'granted';
  }

  hasPermission(): boolean {
    return this.permission === 'granted';
  }

  scheduleReminder(reminder: Reminder): void {
    if (!reminder.notification_enabled || !this.hasPermission()) {
      return;
    }

    const reminderDate = new Date(reminder.date_time);
    const now = new Date();
    const timeUntilReminder = reminderDate.getTime() - now.getTime();

    if (timeUntilReminder <= 0) {
      // Already past, don't schedule
      return;
    }

    setTimeout(() => {
      this.showNotification(reminder);
    }, timeUntilReminder);
  }

  private showNotification(reminder: Reminder): void {
    const title = 'Erinnerung';
    let body = '';

    if (reminder.type === 'medication') {
      body = `Zeit für dein Medikament: ${reminder.title}`;
    } else {
      const time = new Date(reminder.date_time).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });
      body = `Termin: ${reminder.title} um ${time}`;
    }

    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: reminder.id,
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = `/reminders?id=${reminder.id}`;
      notification.close();
    };
  }

  cancelReminder(reminderId: string): void {
    // Note: setTimeout IDs are not easily stored/retrieved
    // In a production app, you'd use a more robust scheduling system
    // For now, this is a placeholder
  }
}

export const notificationService = NotificationService.getInstance();
