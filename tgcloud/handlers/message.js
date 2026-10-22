import { api } from 'sdk';

export default async function (message) {
  if (typeof message?.text !== 'string' || !/^\/start(?:@\w+)?(?:\s|$)/.test(message.text)) return;
  await api.sendMessage({
    chat_id: message.chat.id,
    text: 'Привет! Это «Умножайка». Открой приложение кнопкой в меню бота и учи таблицу умножения играя!'
  });
}
