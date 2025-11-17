import type { Reminder } from '@/types/reminder.types';
import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = 'BJL-6aGQ4jn1vukG-xIB6u6TDjC4L9aeJozvTBB7lV1A1f7jR40tlQgrcskFFCvIm7TcsVkLCw1uEAHB_tySPwg';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export class NotificationService {
  private static instance: NotificationService;
  private permission: NotificationPermission = 'default';
  private pushSubscription: PushSubscription | null = null;

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
      await this.subscribeToPush();
      return true;
    }

    const permission = await Notification.requestPermission();
    this.permission = permission;
    
    if (permission === 'granted') {
      await this.subscribeToPush();
    }
    
    return permission === 'granted';
  }

  hasPermission(): boolean {
    return this.permission === 'granted';
  }

  async subscribeToPush(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Subscribe to push notifications
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      this.pushSubscription = subscription;

      // Save subscription to database
      await this.savePushSubscription(subscription);
      
      console.log('Push subscription successful');
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
    }
  }

  private async savePushSubscription(subscription: PushSubscription): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn('No user logged in');
      return;
    }

    const subscriptionJson = subscription.toJSON();
    const keys = subscriptionJson.keys;
    
    if (!keys || !keys.p256dh || !keys.auth) {
      throw new Error('Invalid subscription keys');
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }, {
        onConflict: 'endpoint',
      });

    if (error) {
      console.error('Error saving push subscription:', error);
    }
  }

  async unsubscribeFromPush(): Promise<void> {
    if (!this.pushSubscription) {
      return;
    }

    try {
      await this.pushSubscription.unsubscribe();
      
      // Remove from database
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', this.pushSubscription.endpoint);
      }
      
      this.pushSubscription = null;
      console.log('Unsubscribed from push notifications');
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
    }
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
