import crypto from 'crypto';
import { db } from '../db';

export interface WayForPayConfig {
  merchantAccount: string;
  merchantSecretKey: string;
  merchantDomainName: string;
  serviceUrl: string;
}

export interface PaymentRequest {
  orderReference: string;
  orderDate: number;
  amount: number;
  currency: string;
  productName: string[];
  productCount: number[];
  productPrice: number[];
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
}

export interface WayForPayResponse {
  reason: string;
  reasonCode: number;
  orderReference: string;
  paymentSystem: string;
  cardPan: string;
  transactionStatus: string;
  amount: number;
  currency: string;
  merchantSignature: string;
}

/**
 * Generate HMAC signature for WayForPay requests
 */
export function generateSignature(
  data: Record<string, string | number>,
  secretKey: string
): string {
  const sortedKeys = Object.keys(data).sort();
  const signatureString = sortedKeys
    .map((key) => `${key}=${data[key]}`)
    .join(';');
  return crypto.createHmac('md5', secretKey).update(signatureString).digest('hex');
}

/**
 * Verify WayForPay webhook signature
 */
export function verifyWebhookSignature(
  data: WayForPayResponse,
  secretKey: string
): boolean {
  const signatureData: Record<string, string | number> = {
    merchantAccount: data.reason || '',
    orderReference: data.orderReference,
    amount: data.amount,
    currency: data.currency,
    authCode: data.paymentSystem || '',
    cardPan: data.cardPan || '',
    transactionStatus: data.transactionStatus,
    reasonCode: data.reasonCode,
  };

  const expectedSignature = generateSignature(signatureData, secretKey);
  return expectedSignature === data.merchantSignature;
}

/**
 * Create payment request data for WayForPay
 */
export function createPaymentRequest(
  config: WayForPayConfig,
  paymentData: PaymentRequest,
  returnUrl?: string
): Record<string, string | number> {
  const requestData: Record<string, string | number> = {
    transactionType: 'AUTO',
    merchantAccount: config.merchantAccount,
    merchantDomainName: config.merchantDomainName,
    orderReference: paymentData.orderReference,
    orderDate: paymentData.orderDate,
    amount: paymentData.amount,
    currency: paymentData.currency,
    productName: paymentData.productName.join(';'),
    productCount: paymentData.productCount.join(';'),
    productPrice: paymentData.productPrice.join(';'),
    serviceUrl: config.serviceUrl,
  };

  if (returnUrl) {
    requestData.returnUrl = returnUrl;
  }

  if (paymentData.clientName) {
    requestData.clientName = paymentData.clientName;
  }
  if (paymentData.clientEmail) {
    requestData.clientEmail = paymentData.clientEmail;
  }
  if (paymentData.clientPhone) {
    requestData.clientPhone = paymentData.clientPhone;
  }

  const merchantSignature = generateSignature(requestData, config.merchantSecretKey);
  requestData.merchantSignature = merchantSignature;

  return requestData;
}

/**
 * Generate unique order reference
 */
export function generateOrderReference(userId: number, courseId: number): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORDER_${userId}_${courseId}_${timestamp}_${random}`;
}

/**
 * Create payment order in database
 */
export async function createPaymentOrder(
  orderReference: string,
  userId: number,
  courseId: number
): Promise<number> {
  const result = await db.query<{ id: number }>(
    `INSERT INTO payment_orders (order_reference, user_id, course_id, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [orderReference, userId, courseId]
  );
  return result.rows[0]?.id || 0;
}

/**
 * Update payment order status
 */
export async function updatePaymentOrderStatus(
  orderReference: string,
  status: 'pending' | 'processing' | 'approved' | 'declined' | 'refunded'
): Promise<void> {
  const updateFields: string[] = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
  const values: (string | number)[] = [orderReference, status];

  if (status === 'approved') {
    updateFields.push('completed_at = CURRENT_TIMESTAMP');
  }

  await db.query(
    `UPDATE payment_orders 
     SET ${updateFields.join(', ')}
     WHERE order_reference = $1`,
    values
  );
}

/**
 * Get payment order by reference
 */
export async function getPaymentOrderByReference(
  orderReference: string
): Promise<{
  id: number;
  user_id: number;
  course_id: number;
  status: string;
} | null> {
  const result = await db.query<{
    id: number;
    user_id: number;
    course_id: number;
    status: string;
  }>(
    `SELECT id, user_id, course_id, status
     FROM payment_orders
     WHERE order_reference = $1`,
    [orderReference]
  );
  return result.rows[0] || null;
}

