import { api } from 'sdk';

const APP_URL = 'https://app8854507045.tgcloud.ai/';
const photoURL = APP_URL + 'assets/welcome.png';
const text = '<b>Добро пожаловать в «Умножайку»!</b>\n\n' +
  'Учи таблицу умножения от 1 до 10 в своём темпе. ' +
  'Листай примеры, угадывай ответ и открывай его одним нажатием.\n\n' +
  'Выбирай: по порядку или вразброс. Начнём?';
const reply_markup = {
  inline_keyboard: [[{ text: 'Открыть Умножайку', web_app: { url: APP_URL } }]]
};

export default async function (message) {
  if (typeof message?.text !== 'string' || !/^\/start(?:@umnozhayka_tgbot)?(?:\s|$)/i.test(message.text)) return;
  // Только личный чат: кнопка web_app в inline keyboard Telegram поддерживается для private chat.
  if (message?.chat?.type !== 'private' || !message.chat.id) return;
  try {
    await api.sendPhoto({
      chat_id: message.chat.id,
      photo: photoURL,
      caption: text,
      parse_mode: 'HTML',
      reply_markup
    });
  } catch {
    // Если Telegram не смог получить картинку, кнопка запуска остаётся доступной.
    await api.sendMessage({
      chat_id: message.chat.id,
      text,
      parse_mode: 'HTML',
      reply_markup
    });
  }
}
