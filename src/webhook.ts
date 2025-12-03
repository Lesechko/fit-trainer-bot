import express, { Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import {
  verifyWebhookSignature,
  updatePaymentOrderStatus,
  getPaymentOrderByReference,
} from './services/wayforpayService';
import {
  WAYFORPAY_MERCHANT_SECRET_KEY,
  WEBHOOK_PORT,
} from './config';
import { enrollUserFromPayment } from './services/paymentEnrollmentService';

export interface WayForPayWebhookData {
  merchantAccount: string;
  orderReference: string;
  amount: number;
  currency: string;
  authCode: string;
  cardPan: string;
  transactionStatus: string;
  reasonCode: number;
  reason: string;
  merchantSignature: string;
}

/**
 * Initialize webhook server for WayForPay payment notifications
 */
export function initializeWebhookServer(bot: Telegraf): void {
  const app = express();

  // Middleware to parse JSON
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // WayForPay webhook endpoint
  app.post('/webhook/wayforpay', async (req: Request, res: Response) => {
    try {
      const webhookData = req.body as WayForPayWebhookData;

      console.log('Received WayForPay webhook:', JSON.stringify(webhookData, null, 2));

      // Verify signature
      const isValid = verifyWebhookSignature(
        {
          reason: webhookData.reason,
          reasonCode: webhookData.reasonCode,
          orderReference: webhookData.orderReference,
          paymentSystem: webhookData.authCode,
          cardPan: webhookData.cardPan,
          transactionStatus: webhookData.transactionStatus,
          amount: webhookData.amount,
          currency: webhookData.currency,
          merchantSignature: webhookData.merchantSignature,
        },
        WAYFORPAY_MERCHANT_SECRET_KEY
      );

      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }

      // Get payment order from database
      const paymentOrder = await getPaymentOrderByReference(webhookData.orderReference);

      if (!paymentOrder) {
        console.error(`Payment order not found: ${webhookData.orderReference}`);
        return res.status(404).json({ error: 'Order not found' });
      }

      // Update payment status
      if (webhookData.transactionStatus === 'Approved') {
        await updatePaymentOrderStatus(
          webhookData.orderReference,
          'approved'
        );

        // Enroll user in course
        await enrollUserFromPayment(bot, paymentOrder.user_id, paymentOrder.course_id);

        console.log(
          `Payment approved and user enrolled: Order ${webhookData.orderReference}, User ${paymentOrder.user_id}, Course ${paymentOrder.course_id}`
        );
      } else if (webhookData.transactionStatus === 'Declined') {
        await updatePaymentOrderStatus(webhookData.orderReference, 'declined');
        console.log(`Payment declined: Order ${webhookData.orderReference}`);
      } else if (webhookData.transactionStatus === 'Processing') {
        await updatePaymentOrderStatus(webhookData.orderReference, 'processing');
        console.log(`Payment processing: Order ${webhookData.orderReference}`);
      }

      // WayForPay expects a specific response format
      const response = {
        orderReference: webhookData.orderReference,
        status: 'accept',
        time: Date.now(),
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.listen(WEBHOOK_PORT, () => {
    console.log(`✅ Webhook server listening on port ${WEBHOOK_PORT}`);
    console.log(`   Webhook URL: http://your-domain.com/webhook/wayforpay`);
  });
}

