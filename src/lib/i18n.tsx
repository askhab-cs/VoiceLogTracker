// src/lib/i18n.tsx
// -----------------------------------------------------------------------------
// Lightweight, reactive i18n for English / Russian / Arabic.
// - Auto-detects the device language; the user can override it (persisted).
// - useI18n() exposes t(), the resolved language, the locale (for dates), and
//   the writing direction. Arabic flips the layout to RTL (needs an app reload).
// -----------------------------------------------------------------------------

import * as Localization from 'expo-localization';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { I18nManager } from 'react-native';

import { getSetting, setSetting } from './db';

export type Lang = 'en' | 'ru' | 'ar';
export type LangPref = 'auto' | Lang;

export const LANG_OPTIONS: { pref: LangPref; native: string }[] = [
  { pref: 'auto', native: 'Auto' },
  { pref: 'en', native: 'English' },
  { pref: 'ru', native: 'Русский' },
  { pref: 'ar', native: 'العربية' },
];

const LOCALES: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU', ar: 'ar' };

type Dict = Record<string, string>;

const en: Dict = {
  // tabs
  tabToday: 'Today',
  tabProgress: 'Progress',
  tabReminders: 'Reminders',
  tabSettings: 'Settings',
  // common
  cancel: 'Cancel',
  save: 'Save',
  add: 'Add',
  delete: 'Delete',
  remove: 'Remove',
  continue: 'Continue',
  done: 'Done',
  undo: 'Undo',
  today: 'Today',
  // home + mic
  appName: 'Voice Log',
  micIdleHint: 'Tap to log your workouts, goals, or habits.',
  micRecording: 'Recording {time} — tap to stop',
  micListening: 'Listening',
  micPermTitle: 'Microphone needed',
  micPermBody: 'Allow microphone access to record voice logs.',
  micProcessing: 'Processing…',
  startRecording: 'Start voice recording',
  stopRecording: 'Stop voice recording',
  todaysEntries: "Today's Entries",
  entriesLogged: '{n} logged',
  monthMeta: '{count} logs · {streak}-day streak',
  emptyToday: 'Nothing logged yet today. Tap the mic or + to add one.',
  emptyOtherDay: 'No entries on this day.',
  entryEditHint: 'Tap an entry to edit · hold to delete',
  nothingLoggedTitle: 'Nothing logged',
  nothingLoggedBody: "I couldn't pick out an activity — try again.",
  couldNotSaveTitle: 'Could not save log',
  voicePrivacyTitle: 'Before you continue',
  voicePrivacyBody:
    'Your recording will be sent to your private Supabase function and then to Google Gemini for transcription. The audio is not saved by this app.',
  reviewVoiceTitle: 'Save these entries?',
  voiceSavedTitle: 'Saved',
  voiceSavedBody: '{count} voice entries added.',
  deleteEntryTitle: 'Delete entry',
  deleteEntryBody: 'Remove "{name}"?',
  // add entry modal
  addEntryTitle: 'Add Entry',
  editEntryTitle: 'Edit Entry',
  activity: 'Activity',
  activityPlaceholder: 'e.g. Reading',
  amountOptional: 'Amount (optional)',
  qtyPlaceholder: '30',
  unitPlaceholder: 'minutes',
  // measures / details
  detailsLabel: 'Details (optional)',
  detailsHint: 'Add reps, weight, pages — whatever you tracked.',
  addDetail: 'Add',
  categoryLabel: 'Category (optional)',
  categoryPlaceholder: 'e.g. Gym, Study',
  otherCategory: 'Other',
  valuePlaceholder: '0',
  mDuration: 'Duration',
  mPages: 'pages',
  mDistance: 'Distance',
  mSets: 'sets',
  mReps: 'reps',
  mWeight: 'Weight',
  mCalories: 'Calories',
  mCount: 'Count',
  unitMin: 'min',
  unitHr: 'hr',
  unitKm: 'km',
  unitMi: 'mi',
  unitKg: 'kg',
  unitLb: 'lb',
  unitKcal: 'kcal',
  thisWeekShort: 'this week',
  allTimeBest: 'best',
  goalMetricHint: 'Goal tracks {metric}',
  goalNoMetric: 'Log an amount for this habit first to set an amount goal.',
  // goal modal
  weeklyGoal: 'Weekly Goal',
  daysPerWeek: 'Days / week',
  amountPerWeek: 'Amount / week',
  targetDays: 'Target days per week',
  targetAmount: 'Target amount per week',
  daysPerWeekSuffix: 'days / week',
  saveGoal: 'Save Goal',
  daysThisWeek: '{a} / {b} days this week',
  amountThisWeek: '{a} / {b} {unit} this week',
  // progress
  progressTitle: 'Progress',
  progressSubtitle: 'Your habits at a glance',
  noHabits: "No habits yet. Log something on the Today tab and it'll show up here.",
  setGoal: 'Set goal',
  dayStreak: 'day streak',
  thisWeek: 'this week',
  totalLogs: 'total logs',
  progressFootHint: 'Tap a habit to set or change its weekly goal.',
  // reminders
  remindersTitle: 'Reminders',
  remindersSubtitle: 'Nudges to keep your habits going',
  noReminders: 'No reminders yet. Tap the button below to add one.',
  addReminder: 'Add reminder',
  everyDay: 'Every day',
  weekdaysLabel: 'Weekdays',
  weekendsLabel: 'Weekends',
  remindersNote:
    'Reminders use local notifications. In Expo Go they work for testing on iPhone; a development build is recommended for reliable delivery later.',
  notifOffTitle: 'Notifications are off',
  notifOffBodySave:
    "Turn on notifications for Expo Go in iOS Settings to receive this reminder. It's saved either way.",
  notifOffBodyToggle: 'Enable notifications for Expo Go in iOS Settings.',
  newReminder: 'New Reminder',
  editReminder: 'Edit Reminder',
  remindMeTo: 'Remind me to…',
  reminderPlaceholder: 'e.g. Read a book',
  time: 'Time',
  // settings
  settingsTitle: 'Settings',
  language: 'Language',
  langAutoSub: 'Match device language',
  restartNeededTitle: 'Restart needed',
  restartNeededBody:
    'Arabic uses a right-to-left layout. Please fully close and reopen the app to apply it.',
  aboutVersion: 'Version {v}',
};

const ru: Dict = {
  tabToday: 'Сегодня',
  tabProgress: 'Прогресс',
  tabReminders: 'Напоминания',
  tabSettings: 'Настройки',
  cancel: 'Отмена',
  save: 'Сохранить',
  add: 'Добавить',
  delete: 'Удалить',
  remove: 'Убрать',
  continue: 'Продолжить',
  done: 'Готово',
  undo: 'Отменить',
  today: 'Сегодня',
  appName: 'Голосовой журнал',
  micIdleHint: 'Нажмите, чтобы записать тренировки, цели и привычки.',
  micRecording: 'Запись {time} — нажмите, чтобы остановить',
  micListening: 'Слушаю',
  micPermTitle: 'Нужен доступ к микрофону',
  micPermBody: 'Разрешите доступ к микрофону, чтобы записывать голосовые заметки.',
  micProcessing: 'Обработка…',
  startRecording: 'Начать голосовую запись',
  stopRecording: 'Остановить запись',
  todaysEntries: 'Записи за сегодня',
  entriesLogged: 'записей: {n}',
  monthMeta: 'записей: {count} · серия {streak} дн.',
  emptyToday: 'Сегодня пока ничего нет. Нажмите микрофон или +, чтобы добавить.',
  emptyOtherDay: 'Нет записей за этот день.',
  entryEditHint: 'Нажмите запись, чтобы изменить · удерживайте, чтобы удалить',
  nothingLoggedTitle: 'Ничего не записано',
  nothingLoggedBody: 'Не удалось распознать активность — попробуйте ещё раз.',
  couldNotSaveTitle: 'Не удалось сохранить',
  voicePrivacyTitle: 'Перед продолжением',
  voicePrivacyBody:
    'Запись будет отправлена в вашу приватную функцию Supabase, а затем в Google Gemini для расшифровки. Приложение не сохраняет аудио.',
  reviewVoiceTitle: 'Сохранить эти записи?',
  voiceSavedTitle: 'Сохранено',
  voiceSavedBody: 'Добавлено голосовых записей: {count}.',
  deleteEntryTitle: 'Удалить запись',
  deleteEntryBody: 'Убрать «{name}»?',
  addEntryTitle: 'Новая запись',
  editEntryTitle: 'Изменить запись',
  activity: 'Активность',
  activityPlaceholder: 'напр. Чтение',
  amountOptional: 'Количество (необязательно)',
  qtyPlaceholder: '30',
  unitPlaceholder: 'минут',
  detailsLabel: 'Детали (необязательно)',
  detailsHint: 'Добавьте повторы, вес, страницы — что отслеживаете.',
  addDetail: 'Добавить',
  categoryLabel: 'Категория (необязательно)',
  categoryPlaceholder: 'напр. Зал, Учёба',
  otherCategory: 'Другое',
  valuePlaceholder: '0',
  mDuration: 'Время',
  mPages: 'стр.',
  mDistance: 'Дистанция',
  mSets: 'подх.',
  mReps: 'повт.',
  mWeight: 'Вес',
  mCalories: 'Калории',
  mCount: 'Количество',
  unitMin: 'мин',
  unitHr: 'ч',
  unitKm: 'км',
  unitMi: 'миль',
  unitKg: 'кг',
  unitLb: 'фнт',
  unitKcal: 'ккал',
  thisWeekShort: 'на неделе',
  allTimeBest: 'рекорд',
  goalMetricHint: 'Цель считает: {metric}',
  goalNoMetric: 'Сначала запишите количество для этой привычки.',
  weeklyGoal: 'Цель на неделю',
  daysPerWeek: 'Дней / неделю',
  amountPerWeek: 'Объём / неделю',
  targetDays: 'Цель: дней в неделю',
  targetAmount: 'Цель: объём в неделю',
  daysPerWeekSuffix: 'дн. / нед.',
  saveGoal: 'Сохранить цель',
  daysThisWeek: '{a} / {b} дней за неделю',
  amountThisWeek: '{a} / {b} {unit} за неделю',
  progressTitle: 'Прогресс',
  progressSubtitle: 'Ваши привычки с одного взгляда',
  noHabits: 'Пока нет привычек. Запишите что-нибудь на вкладке «Сегодня».',
  setGoal: 'Цель',
  dayStreak: 'дней подряд',
  thisWeek: 'на этой неделе',
  totalLogs: 'всего записей',
  progressFootHint: 'Нажмите привычку, чтобы задать цель на неделю.',
  remindersTitle: 'Напоминания',
  remindersSubtitle: 'Напоминания, чтобы не бросать привычки',
  noReminders: 'Пока нет напоминаний. Нажмите кнопку ниже, чтобы добавить.',
  addReminder: 'Добавить напоминание',
  everyDay: 'Каждый день',
  weekdaysLabel: 'Будни',
  weekendsLabel: 'Выходные',
  remindersNote:
    'Напоминания используют локальные уведомления. В Expo Go они работают для теста на iPhone; для надёжной доставки позже нужна dev-сборка.',
  notifOffTitle: 'Уведомления выключены',
  notifOffBodySave:
    'Включите уведомления для Expo Go в настройках iOS, чтобы получать это напоминание. Оно сохранено в любом случае.',
  notifOffBodyToggle: 'Включите уведомления для Expo Go в настройках iOS.',
  newReminder: 'Новое напоминание',
  editReminder: 'Изменить напоминание',
  remindMeTo: 'Напомнить…',
  reminderPlaceholder: 'напр. Почитать книгу',
  time: 'Время',
  settingsTitle: 'Настройки',
  language: 'Язык',
  langAutoSub: 'Как на устройстве',
  restartNeededTitle: 'Нужен перезапуск',
  restartNeededBody:
    'Арабский использует интерфейс справа налево. Полностью закройте и снова откройте приложение.',
  aboutVersion: 'Версия {v}',
};

const ar: Dict = {
  tabToday: 'اليوم',
  tabProgress: 'التقدّم',
  tabReminders: 'التذكيرات',
  tabSettings: 'الإعدادات',
  cancel: 'إلغاء',
  save: 'حفظ',
  add: 'إضافة',
  delete: 'حذف',
  remove: 'إزالة',
  continue: 'متابعة',
  done: 'تم',
  undo: 'تراجع',
  today: 'اليوم',
  appName: 'السجل الصوتي',
  micIdleHint: 'اضغط لتسجيل تمارينك وأهدافك وعاداتك.',
  micRecording: 'جارٍ التسجيل {time} — اضغط للإيقاف',
  micListening: 'أستمع',
  micPermTitle: 'الميكروفون مطلوب',
  micPermBody: 'اسمح بالوصول إلى الميكروفون لتسجيل السجلات الصوتية.',
  micProcessing: 'جارٍ المعالجة…',
  startRecording: 'بدء التسجيل الصوتي',
  stopRecording: 'إيقاف التسجيل',
  todaysEntries: 'إدخالات اليوم',
  entriesLogged: '{n} مُسجّلة',
  monthMeta: '{count} سجل · سلسلة {streak} يوم',
  emptyToday: 'لا شيء مُسجّل اليوم بعد. اضغط الميكروفون أو + للإضافة.',
  emptyOtherDay: 'لا إدخالات في هذا اليوم.',
  entryEditHint: 'اضغط على إدخال للتعديل · واضغط مطوّلاً للحذف',
  nothingLoggedTitle: 'لم يُسجّل شيء',
  nothingLoggedBody: 'لم أتمكّن من تحديد نشاط — حاول مرّة أخرى.',
  couldNotSaveTitle: 'تعذّر الحفظ',
  voicePrivacyTitle: 'قبل المتابعة',
  voicePrivacyBody:
    'سيُرسل التسجيل إلى وظيفة Supabase الخاصة بك ثم إلى Google Gemini للتفريغ. لا يحفظ التطبيق الملف الصوتي.',
  reviewVoiceTitle: 'حفظ هذه الإدخالات؟',
  voiceSavedTitle: 'تم الحفظ',
  voiceSavedBody: 'تمت إضافة {count} إدخال صوتي.',
  deleteEntryTitle: 'حذف الإدخال',
  deleteEntryBody: 'إزالة «{name}»؟',
  addEntryTitle: 'إضافة إدخال',
  editEntryTitle: 'تعديل الإدخال',
  activity: 'النشاط',
  activityPlaceholder: 'مثال: قراءة',
  amountOptional: 'الكمية (اختياري)',
  qtyPlaceholder: '30',
  unitPlaceholder: 'دقائق',
  detailsLabel: 'تفاصيل (اختياري)',
  detailsHint: 'أضف التكرارات والوزن والصفحات — ما تتابعه.',
  addDetail: 'إضافة',
  categoryLabel: 'الفئة (اختياري)',
  categoryPlaceholder: 'مثال: النادي، الدراسة',
  otherCategory: 'أخرى',
  valuePlaceholder: '0',
  mDuration: 'المدة',
  mPages: 'صفحات',
  mDistance: 'المسافة',
  mSets: 'مجموعات',
  mReps: 'تكرارات',
  mWeight: 'الوزن',
  mCalories: 'سعرات',
  mCount: 'العدد',
  unitMin: 'د',
  unitHr: 'س',
  unitKm: 'كم',
  unitMi: 'ميل',
  unitKg: 'كجم',
  unitLb: 'رطل',
  unitKcal: 'سعرة',
  thisWeekShort: 'هذا الأسبوع',
  allTimeBest: 'الأفضل',
  goalMetricHint: 'يحسب الهدف: {metric}',
  goalNoMetric: 'سجّل كمية لهذه العادة أولاً لتعيين هدف كمية.',
  weeklyGoal: 'الهدف الأسبوعي',
  daysPerWeek: 'أيام / أسبوع',
  amountPerWeek: 'كمية / أسبوع',
  targetDays: 'عدد الأيام المستهدفة أسبوعياً',
  targetAmount: 'الكمية المستهدفة أسبوعياً',
  daysPerWeekSuffix: 'أيام/أسبوع',
  saveGoal: 'حفظ الهدف',
  daysThisWeek: '{a} / {b} أيام هذا الأسبوع',
  amountThisWeek: '{a} / {b} {unit} هذا الأسبوع',
  progressTitle: 'التقدّم',
  progressSubtitle: 'عاداتك في لمحة',
  noHabits: 'لا عادات بعد. سجّل شيئاً في تبويب اليوم وسيظهر هنا.',
  setGoal: 'حدّد هدفاً',
  dayStreak: 'يوم متتالٍ',
  thisWeek: 'هذا الأسبوع',
  totalLogs: 'إجمالي السجلات',
  progressFootHint: 'اضغط على عادة لتحديد هدفها الأسبوعي أو تغييره.',
  remindersTitle: 'التذكيرات',
  remindersSubtitle: 'تنبيهات للحفاظ على عاداتك',
  noReminders: 'لا تذكيرات بعد. اضغط الزر بالأسفل للإضافة.',
  addReminder: 'إضافة تذكير',
  everyDay: 'كل يوم',
  weekdaysLabel: 'أيام العمل',
  weekendsLabel: 'عطلة نهاية الأسبوع',
  remindersNote:
    'تستخدم التذكيرات الإشعارات المحلية. تعمل في Expo Go للتجربة على آيفون؛ يُنصح ببناء تطويري لاحقاً لضمان التسليم.',
  notifOffTitle: 'الإشعارات متوقّفة',
  notifOffBodySave:
    'فعّل الإشعارات لـ Expo Go من إعدادات iOS لتصلك هذه التذكيرات. تم الحفظ على أي حال.',
  notifOffBodyToggle: 'فعّل الإشعارات لـ Expo Go من إعدادات iOS.',
  newReminder: 'تذكير جديد',
  editReminder: 'تعديل التذكير',
  remindMeTo: 'ذكّرني بـ…',
  reminderPlaceholder: 'مثال: اقرأ كتاباً',
  time: 'الوقت',
  settingsTitle: 'الإعدادات',
  language: 'اللغة',
  langAutoSub: 'حسب لغة الجهاز',
  restartNeededTitle: 'إعادة التشغيل مطلوبة',
  restartNeededBody:
    'تستخدم العربية تخطيطاً من اليمين إلى اليسار. أغلق التطبيق وأعد فتحه بالكامل لتطبيقه.',
  aboutVersion: 'الإصدار {v}',
};

const DICTS: Record<Lang, Dict> = { en, ru, ar };

function deviceLang(): Lang {
  const code = Localization.getLocales()[0]?.languageCode ?? 'en';
  return code === 'ru' || code === 'ar' ? code : 'en';
}

function resolveLang(pref: LangPref): Lang {
  return pref === 'auto' ? deviceLang() : pref;
}

function format(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
}

type I18nValue = {
  lang: Lang;
  pref: LangPref;
  locale: string;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
  t: (key: keyof typeof en, params?: Record<string, string | number>) => string;
  /** Returns true if the change flips RTL state and an app reload is needed. */
  setPref: (pref: LangPref) => boolean;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LangPref>(
    () => (getSetting('lang') as LangPref) ?? 'auto'
  );
  const lang = resolveLang(pref);

  // Allow RTL globally (forcing happens on language change).
  useMemo(() => {
    I18nManager.allowRTL(true);
  }, []);

  const setPref = useCallback((next: LangPref): boolean => {
    setSetting('lang', next);
    const nextLang = resolveLang(next);
    const shouldRTL = nextLang === 'ar';
    setPrefState(next);
    if (I18nManager.isRTL !== shouldRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(shouldRTL);
      return true;
    }
    return false;
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dir: 'ltr' | 'rtl' = lang === 'ar' ? 'rtl' : 'ltr';
    return {
      lang,
      pref,
      locale: LOCALES[lang],
      dir,
      isRTL: dir === 'rtl',
      t: (key, params) => format(DICTS[lang][key] ?? en[key] ?? String(key), params),
      setPref,
    };
  }, [lang, pref, setPref]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/** Localized weekday labels (e.g. narrow 'M' or short 'Mon'), Sunday-first. */
export function weekdayLabels(locale: string, kind: 'narrow' | 'short'): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    // 2023-01-01 was a Sunday → gives Sunday-first labels.
    const d = new Date(2023, 0, 1 + i);
    out.push(d.toLocaleDateString(locale, { weekday: kind }));
  }
  return out;
}
