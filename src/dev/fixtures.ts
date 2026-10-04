import type { Chat, ChatMessage, MessageStatus } from '@/types'

export interface PreviewData {
  chats: Chat[]
  messages: Record<string, ChatMessage[]>
}

interface Draft {
  at: number
  out?: boolean
  text: string
  status?: MessageStatus
  sender?: string
  unsupported?: boolean
  error?: string
}

export const CHAT_IDS = {
  anna: '10000001',
  team: '-100200300400',
  shop: '10000003',
  sergey: '10000004',
  mom: '10000005',
  support: '10000006',
  kate: '10000007',
  dmitry: '10000008',
  julia: '10000009',
  belarus: '10000010',
} as const

/** Rich demo data relative to `now`: several days, stacks, links, a group, every delivery status. */
export function createPreviewData(now: number): PreviewData {
  const minutesAgo = (minutes: number) => now - minutes * 60_000
  const day = (daysAgo: number, hours: number, minutes: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)
    date.setHours(hours, minutes, 0, 0)
    return date.getTime()
  }

  const messages: Record<string, ChatMessage[]> = {}
  const build = (chatId: string, drafts: Draft[]) => {
    messages[chatId] = drafts.map((draft, index) => ({
      id: `${chatId}-${index}`,
      remoteId: draft.status === 'sending' ? undefined : `BAE5${chatId}${index}`,
      chatId,
      direction: draft.out ? 'out' : 'in',
      text: draft.text,
      kind: draft.unsupported ? 'unsupported' : 'text',
      timestamp: draft.at,
      status: draft.out ? (draft.status ?? 'read') : 'read',
      senderName: draft.sender,
      error: draft.error,
    }))
  }

  build(CHAT_IDS.anna, [
    { at: day(3, 19, 2), text: 'Привет! Ты завтра будешь на встрече с подрядчиком?' },
    { at: day(3, 19, 5), out: true, text: 'Привет! Да, буду. Во сколько начинаем?' },
    { at: day(3, 19, 6), text: 'В 11:00, в переговорной на третьем этаже' },
    { at: day(3, 19, 7), text: 'Захвати, пожалуйста, договор' },
    { at: day(3, 19, 30), out: true, text: 'Хорошо, возьму' },
    { at: day(1, 10, 15), text: 'Встреча прошла отлично, спасибо за помощь с презентацией' },
    {
      at: day(1, 10, 16),
      text: 'Подрядчик прислал смету, посмотришь?\nТам три варианта, нужен твой взгляд на второй',
    },
    { at: day(1, 10, 40), out: true, text: 'Конечно. Скинь файл или ссылку' },
    {
      at: day(1, 10, 41),
      text: 'Вот ссылка: https://example.com/docs/estimate-v2?draft=1 (последняя версия)',
    },
    {
      at: day(1, 11, 2),
      out: true,
      text: 'Посмотрел. Второй вариант дороже на 12%, но сроки короче на две недели. Я бы взял его, если бюджет позволяет.',
    },
    {
      at: day(1, 11, 3),
      out: true,
      text: 'И ещё: попроси их расписать гарантийные обязательства отдельным пунктом',
    },
    { at: day(1, 11, 20), text: 'Голосовое сообщение', unsupported: true },
    { at: day(1, 11, 21), text: 'Записала голосовое, послушай, когда будет минутка' },
    { at: minutesAgo(95), out: true, text: 'Доброе утро! Бюджет согласовали?' },
    { at: minutesAgo(80), text: 'Да! Финансовый отдел одобрил второй вариант' },
    { at: minutesAgo(79), text: 'Подписываем в пятницу' },
    {
      at: minutesAgo(60),
      out: true,
      text: 'Отлично, тогда я подготовлю приложение к договору и отправлю на почту до обеда',
    },
    {
      at: minutesAgo(58),
      out: true,
      status: 'delivered',
      text: 'План на пятницу:\n1. Проверить реквизиты\n2. Распечатать два экземпляра\n3. Подписать акт приёмки\n\nЕсли что-то забыл, напиши.',
    },
    { at: minutesAgo(30), text: 'Супер, спасибо! Всё верно' },
    {
      at: minutesAgo(12),
      out: true,
      status: 'delivered',
      text: 'Шаблон договора: https://example.com/templates/contract-2026-final-version-signed.pdf',
    },
    { at: minutesAgo(3), out: true, status: 'sent', text: 'Буду в офисе к десяти' },
    { at: minutesAgo(1), out: true, status: 'sending', text: 'Наберу тебя через пять минут' },
    { at: minutesAgo(0.8), text: 'Хорошо, жду звонка' },
    {
      at: minutesAgo(0.5),
      text: 'Тогда до встречи в пятницу! Я возьму с собой ноутбук и презентацию.',
    },
  ])

  build(CHAT_IDS.team, [
    { at: day(1, 18, 40), sender: 'Иван Петров', text: 'Коллеги, напоминаю: релиз в четверг' },
    {
      at: day(1, 18, 41),
      sender: 'Иван Петров',
      text: 'Кто ещё не закрыл задачи в трекере, отпишитесь, пожалуйста',
    },
    {
      at: day(1, 18, 55),
      sender: 'Мария Козлова',
      text: 'Я закрыла дизайн, осталась только иконка для тёмной темы',
    },
    { at: day(1, 19, 4), out: true, text: 'У меня два бага в работе, к вечеру закрою' },
    { at: minutesAgo(120), sender: 'Олег Белов', text: 'Стикер', unsupported: true },
    { at: minutesAgo(119), sender: 'Олег Белов', text: 'Тесты на оплату зелёные' },
    {
      at: minutesAgo(40),
      sender: 'Мария Козлова',
      text: 'Выложила макеты в общую папку https://example.com/designs/max-chat',
    },
    { at: minutesAgo(39), sender: 'Мария Козлова', text: 'Посмотрите, пожалуйста, экран входа' },
    {
      at: minutesAgo(20),
      sender: 'Иван Петров',
      text: 'Выглядит отлично! Только кнопку я бы сделал чуть заметнее',
    },
    { at: minutesAgo(19), sender: 'Иван Петров', text: 'И подпись под полем можно короче' },
    { at: minutesAgo(7), sender: 'Олег Белов', text: 'Согласен с Иваном' },
  ])

  build(CHAT_IDS.shop, [
    { at: minutesAgo(260), text: 'Здравствуйте! Ваш заказ собран и ждёт отправки' },
    {
      at: minutesAgo(200),
      out: true,
      text: 'Добрый день! Подскажите, когда его передадут в доставку?',
    },
  ])

  build(CHAT_IDS.sergey, [
    { at: minutesAgo(420), text: 'Привет, есть минутка?' },
    {
      at: minutesAgo(400),
      out: true,
      status: 'failed',
      text: 'Скинь, пожалуйста, ссылку на документ',
      error: 'Тариф Developer позволяет общаться только с 3 чатами.',
    },
  ])

  build(CHAT_IDS.mom, [
    { at: day(1, 20, 50), out: true, text: 'Доехал, всё хорошо' },
    { at: day(1, 21, 15), text: 'Позвони, как освободишься' },
  ])

  build(CHAT_IDS.support, [
    { at: day(3, 14, 2), out: true, text: 'Не приходит код подтверждения' },
    { at: day(3, 14, 10), text: 'Фото', unsupported: true },
  ])

  build(CHAT_IDS.kate, [
    { at: day(5, 16, 20), text: 'Отправила документы на почту' },
    { at: day(5, 16, 45), out: true, status: 'delivered', text: 'Спасибо, получил!' },
  ])

  const lastYear = new Date(now).getFullYear() - 1
  build(CHAT_IDS.dmitry, [
    {
      at: new Date(lastYear, 11, 31, 23, 50).getTime(),
      text: 'С Новым годом! Пусть всё получится',
    },
  ])

  build(CHAT_IDS.julia, [
    { at: day(12, 9, 30), text: 'Договорились, созвонимся на следующей неделе' },
  ])

  const lastAt = (chatId: string, fallback: number) =>
    messages[chatId]?.at(-1)?.timestamp ?? fallback

  const chatList: Chat[] = [
    {
      id: CHAT_IDS.anna,
      title: 'Анна Смирнова',
      type: 'user',
      phone: '79165551234',
      unread: 2,
      updatedAt: 0,
    },
    { id: CHAT_IDS.team, title: 'Команда проекта', type: 'group', unread: 5, updatedAt: 0 },
    {
      id: CHAT_IDS.shop,
      title: '+7 999 123-45-67',
      type: 'user',
      phone: '79991234567',
      unread: 0,
      updatedAt: 0,
    },
    {
      id: CHAT_IDS.sergey,
      title: 'Сергей Волков',
      type: 'user',
      phone: '79035557788',
      unread: 0,
      updatedAt: 0,
    },
    {
      id: CHAT_IDS.mom,
      title: 'Мама',
      type: 'user',
      phone: '79267770011',
      unread: 1,
      updatedAt: 0,
    },
    { id: CHAT_IDS.support, title: 'Служба поддержки', type: 'user', unread: 1, updatedAt: 0 },
    {
      id: CHAT_IDS.kate,
      title: 'Екатерина Новикова',
      type: 'user',
      phone: '79112223344',
      unread: 0,
      updatedAt: 0,
    },
    { id: CHAT_IDS.dmitry, title: 'Дмитрий', type: 'user', unread: 0, updatedAt: 0 },
    {
      id: CHAT_IDS.julia,
      title: 'Юлия Орлова',
      type: 'user',
      phone: '79854443322',
      unread: 0,
      updatedAt: 0,
    },
    {
      id: CHAT_IDS.belarus,
      title: '+375 29 765-43-21',
      type: 'user',
      phone: '375297654321',
      unread: 0,
      updatedAt: 0,
    },
  ]
  const chats = chatList.map((chat) => ({ ...chat, updatedAt: lastAt(chat.id, minutesAgo(600)) }))

  return { chats, messages }
}
