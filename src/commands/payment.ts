import { Context, Telegraf } from 'telegraf';
import { db } from '../db';
import { ensureUserExists } from './user/utils/userUtils';
import {
  createPaymentRequest,
  generateOrderReference,
  createPaymentOrder,
  getPaymentOrderByReference,
} from '../services/wayforpayService';
import {
  WAYFORPAY_MERCHANT_ACCOUNT,
  WAYFORPAY_MERCHANT_SECRET_KEY,
  WAYFORPAY_MERCHANT_DOMAIN_NAME,
  WAYFORPAY_SERVICE_URL,
  WAYFORPAY_API_URL,
  BOT_USERNAME,
} from '../config';
import {
  PAYMENT_COMMAND_TEXT,
  PAYMENT_COURSE_BUTTON,
  PAYMENT_ERROR,
  PAYMENT_ALREADY_ENROLLED,
  PAYMENT_CREATING,
  PAYMENT_LINK_TEXT,
  PAYMENT_BUTTON_TEXT,
  PAYMENT_PENDING,
  PAYMENT_COURSE_NOT_FOUND,
  PAYMENT_NO_COURSES,
} from '../messages';

// Course pricing configuration (can be moved to database or config file)
const COURSE_PRICES: Record<string, number> = {
  'healthy-joints': 500, // Price in UAH
  // Add more courses here
};

/**
 * Payment command - shows available courses for payment
 */
export async function paymentCommandCallback(
  bot: Telegraf<Context>,
  ctx: Context
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  try {
    // Get active courses from database
    const coursesResult = await db.query(
      'SELECT id, slug, title FROM courses WHERE is_active = TRUE ORDER BY id'
    );

    if (coursesResult.rows.length === 0) {
      return ctx.reply(PAYMENT_NO_COURSES);
    }

    // Build course buttons with prices
    const buttons = coursesResult.rows
      .map((course) => {
        const price = COURSE_PRICES[course.slug] || 0;
        if (price === 0) {
          return null; // Skip courses without price
        }
        return [
          {
            text: PAYMENT_COURSE_BUTTON(course.title, price),
            callback_data: `pay_course_${course.id}`,
          },
        ];
      })
      .filter((btn) => btn !== null);

    if (buttons.length === 0) {
      return ctx.reply(PAYMENT_NO_COURSES);
    }

    await ctx.reply(PAYMENT_COMMAND_TEXT, {
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  } catch (error) {
    console.error('Error in payment command:', error);
    return ctx.reply(PAYMENT_ERROR);
  }
}

/**
 * Handle course payment selection
 */
export async function paymentCourseCallback(
  bot: Telegraf<Context>,
  ctx: Context
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const callbackData =
    'data' in (ctx.callbackQuery || {})
      ? (ctx.callbackQuery as { data: string }).data
      : undefined;

  if (!callbackData || !callbackData.startsWith('pay_course_')) {
    return;
  }

  try {
    await ctx.answerCbQuery(PAYMENT_CREATING);

    const courseId = Number(callbackData.replace('pay_course_', ''));
    if (!Number.isFinite(courseId)) {
      return ctx.reply(PAYMENT_COURSE_NOT_FOUND);
    }

    // Get course info
    const courseResult = await db.query(
      'SELECT id, slug, title FROM courses WHERE id = $1 AND is_active = TRUE',
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return ctx.reply(PAYMENT_COURSE_NOT_FOUND);
    }

    const course = courseResult.rows[0];
    const price = COURSE_PRICES[course.slug] || 0;

    if (price === 0) {
      return ctx.reply(PAYMENT_ERROR);
    }

    // Ensure user exists
    const userId = await ensureUserExists(ctx);
    if (!userId) {
      return ctx.reply(PAYMENT_ERROR);
    }

    // Check if user is already enrolled
    const enrollmentResult = await db.query(
      'SELECT id FROM user_courses WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );

    if (enrollmentResult.rows.length > 0) {
      return ctx.reply(PAYMENT_ALREADY_ENROLLED(course.title));
    }

    // Generate order reference
    const orderReference = generateOrderReference(userId, courseId);

    // Create payment order in database
    await createPaymentOrder(orderReference, userId, courseId);

    // Create return URL to redirect user back to bot after payment
    const returnUrl = BOT_USERNAME
      ? `https://t.me/${BOT_USERNAME}?start=payment_${orderReference}`
      : undefined;

    // Create payment request
    const paymentRequest = createPaymentRequest(
      {
        merchantAccount: WAYFORPAY_MERCHANT_ACCOUNT,
        merchantSecretKey: WAYFORPAY_MERCHANT_SECRET_KEY,
        merchantDomainName: WAYFORPAY_MERCHANT_DOMAIN_NAME,
        serviceUrl: WAYFORPAY_SERVICE_URL,
      },
      {
        orderReference,
        orderDate: Math.floor(Date.now() / 1000),
        amount: price,
        currency: 'UAH',
        productName: [course.title],
        productCount: [1],
        productPrice: [price],
        clientName: ctx.from.first_name
          ? `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim()
          : undefined,
        clientEmail: undefined,
        clientPhone: undefined,
      },
      returnUrl
    );

    // Create payment URL (WayForPay redirects to payment page)
    const paymentUrl = `${WAYFORPAY_API_URL}/pay`;

    // Send payment link to user
    await ctx.reply(PAYMENT_LINK_TEXT(course.title, price), {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: PAYMENT_BUTTON_TEXT,
              url: `${paymentUrl}?${new URLSearchParams(
                Object.entries(paymentRequest).map(([k, v]) => [k, String(v)])
              ).toString()}`,
            },
          ],
        ],
      },
    });

    await ctx.reply(PAYMENT_PENDING);
  } catch (error) {
    console.error('Error creating payment:', error);
    return ctx.reply(PAYMENT_ERROR);
  }
}

