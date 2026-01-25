import { Telegraf } from 'telegraf';
import { parseDelayToMs } from './enrollmentHelpers';
import type { FlexibleMessage } from '../../../courses/messages/1_healthy-joints';

/**
 * Load course messages from JSON file
 */
export async function loadCourseMessages(courseSlug: string): Promise<{ instagramMessages?: { [messageId: string]: FlexibleMessage } } | null> {
  try {
    // Map course slugs to message file paths
    const messagePaths: Record<string, string> = {
      'healthy-joints': '../../../courses/messages/1_healthy-joints.json',
    };

    const messagesPath = messagePaths[courseSlug];
    if (!messagesPath) {
      return null;
    }

    const messages = await import(messagesPath);
    return messages.default as { instagramMessages?: { [messageId: string]: FlexibleMessage } };
  } catch (error) {
    console.error(`Error loading messages for course ${courseSlug}:`, error);
    return null;
  }
}

/**
 * Find response message by callback_data
 */
export function findResponseMessageByCallback(
  instagramMessages: { [messageId: string]: FlexibleMessage } | undefined,
  callbackData: string
): FlexibleMessage | null {
  if (!instagramMessages) {
    return null;
  }

  for (const message of Object.values(instagramMessages)) {
    if (message.buttons) {
      for (const btn of message.buttons) {
        if (btn.callback_data === callbackData && btn.responseMessageId) {
          return resolveMessageById(instagramMessages, btn.responseMessageId);
        }
      }
    }
  }

  return null;
}

/**
 * Enrich buttons with payment URL where needed
 */
export function enrichButtonsWithPaymentUrl(
  message: FlexibleMessage,
  paymentUrl: string | undefined
): void {
  if (!message.buttons || !paymentUrl) {
    return;
  }

  for (const btn of message.buttons) {
    if (btn.callback_data === 'instagram_payment_healthy-joints') {
      btn.url = paymentUrl;
      delete btn.callback_data;
    }
  }
}

/**
 * Resolve a message by ID from the instagramMessages object
 */
export function resolveMessageById(
  messages: { [messageId: string]: FlexibleMessage },
  messageId: string
): FlexibleMessage | null {
  return messages[messageId] || null;
}

/**
 * Send a flexible message and schedule its follow-up messages recursively
 */
export async function sendFlexibleMessage(
  bot: Telegraf<any>,
  telegramId: number,
  message: FlexibleMessage,
  courseSlug: string,
  instagramMessages?: { [messageId: string]: FlexibleMessage }
): Promise<void> {
  const replyMarkup = buildReplyMarkup(message.buttons);

  await bot.telegram.sendMessage(telegramId, message.text, {
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

  scheduleFollowUpMessages(bot, telegramId, message, courseSlug, instagramMessages);
}

/**
 * Build reply markup from buttons
 */
function buildReplyMarkup(buttons?: FlexibleMessage['buttons']): { inline_keyboard: any[][] } | undefined {
  if (!buttons || buttons.length === 0) {
    return undefined;
  }

  const keyboardButtons = buttons.map(btn => {
    const keyboardBtn: any = { text: btn.text };
    if (btn.url) {
      keyboardBtn.url = btn.url;
    } else if (btn.callback_data) {
      keyboardBtn.callback_data = btn.callback_data;
    }
    return keyboardBtn;
  });

  return {
    inline_keyboard: keyboardButtons.map(btn => [btn]),
  };
}

/**
 * Schedule follow-up messages recursively
 */
function scheduleFollowUpMessages(
  bot: Telegraf<any>,
  telegramId: number,
  message: FlexibleMessage,
  courseSlug: string,
  instagramMessages?: { [messageId: string]: FlexibleMessage }
): void {
  if (!message.followUpMessages || !instagramMessages) {
    return;
  }

  for (const followUp of message.followUpMessages) {
    const followUpMessage = resolveMessageById(instagramMessages, followUp.messageId);
    if (!followUpMessage) {
      console.error(`Follow-up message ${followUp.messageId} not found`);
      continue;
    }

    const delayMs = parseDelayToMs(followUp.delay);
    if (delayMs === null) {
      console.error(`Invalid delay format: ${followUp.delay}`);
      continue;
    }

    setTimeout(async () => {
      await sendFlexibleMessage(bot, telegramId, followUpMessage, courseSlug, instagramMessages);
    }, delayMs);
  }
}

/**
 * Schedule a flexible message with delay
 */
export function scheduleFlexibleMessage(
  bot: Telegraf<any>,
  telegramId: number,
  message: FlexibleMessage,
  courseSlug: string,
  delayMs: number,
  instagramMessages?: { [messageId: string]: FlexibleMessage }
): void {
  setTimeout(async () => {
    await sendFlexibleMessage(bot, telegramId, message, courseSlug, instagramMessages);
  }, delayMs);
}
