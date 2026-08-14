// src/lib/reminders.ts
// -----------------------------------------------------------------------------
// Local-notification scheduling for reminders.
//
// A reminder repeats weekly on chosen days at a set time. If all 7 days are
// selected we use a single DAILY trigger; otherwise one WEEKLY trigger per day.
// Note: in Expo Go notification support is limited — for guaranteed delivery a
// development build is recommended. Local scheduling works on iOS for testing.
// -----------------------------------------------------------------------------

import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

import { Reminder, setReminderNotifIds } from './db';

// Show notifications even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

export async function cancelNotifIds(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
}

/** Cancel any previous schedule, then (re)schedule. Returns new notif ids. */
export async function scheduleReminder(r: Reminder): Promise<string[]> {
  await cancelNotifIds(r.notifIds);
  if (!r.enabled || r.days.length === 0) return [];

  const content: Notifications.NotificationContentInput = {
    title: 'Voice Log',
    body: r.label,
    sound: true,
  };

  const ids: string[] = [];
  if (r.days.length === 7) {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute },
    });
    ids.push(id);
  } else {
    for (const day of r.days) {
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1, // our days are 0=Sun..6=Sat; expo wants 1=Sun..7=Sat
          hour: r.hour,
          minute: r.minute,
        },
      });
      ids.push(id);
    }
  }
  return ids;
}

/** Schedule (or clear) a reminder and persist its notification ids. */
export async function applyReminder(r: Reminder): Promise<void> {
  const ids = await scheduleReminder(r);
  setReminderNotifIds(r.id, ids);
}
