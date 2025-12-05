import { CourseStaticConfig } from '../types';
import messages from './messages/1_healthy-joints.json';
import type { CourseMessages } from './messages/1_healthy-joints';

const typedMessages = messages as CourseMessages;

export const healthyJoints: CourseStaticConfig = {
  slug: 'healthy-joints',
  title: 'Здорові суглоби',
  welcome: typedMessages.welcome,
  dailyTime: '19:00',
  trackLessonCompletion: false,
  motivation: {
    time: '10:00',
    defaultMessages: [],
  },
  // Review form and bonus video (sent after course completion)
  reviewFormUrl:
    'https://docs.google.com/forms/d/e/1FAIpQLSc3v7Rr9IQmEj-7kQW-2XudZsaWc-kKhNBh1BG8a3EmwtveqQ/viewform?usp=publish-editor', // Google form URL for reviews
  bonusVideoId: 26, // Video ID from database (use /listvideos to see IDs)
  
  // Site visitor greeting and payment
  siteVisitor: {
    greeting: typedMessages.siteGreeting,
    paymentUrl: process.env.PAYMENT_URL || '',
    paymentButtonText: typedMessages.sitePaymentButtonText,
  },
  
  days: [
    {
      day: 1,
      videoTitle: typedMessages.days['1'].videoTitle,
      videoDescription: typedMessages.days['1'].videoDescription,
      motivationMessage: typedMessages.days['1'].motivationMessage,
      autoSend: false,
    },
    {
      day: 2,
      videoTitle: typedMessages.days['2'].videoTitle,
      videoDescription: typedMessages.days['2'].videoDescription,
      motivationMessage: typedMessages.days['2'].motivationMessage,
    },
    {
      day: 3,
      videoTitle: typedMessages.days['3'].videoTitle,
      videoDescription: typedMessages.days['3'].videoDescription,
      motivationMessage: typedMessages.days['3'].motivationMessage,
    },
    {
      day: 4,
      videoTitle: typedMessages.days['4'].videoTitle,
      videoDescription: typedMessages.days['4'].videoDescription,
      motivationMessage: typedMessages.days['4'].motivationMessage,
      difficultyChoice: {
        message: typedMessages.days['4'].difficultyChoice!.message,
        easyButtonText:
          typedMessages.days['4'].difficultyChoice!.easyButtonText,
        hardButtonText:
          typedMessages.days['4'].difficultyChoice!.hardButtonText,
        easyVideoId: 13,
        hardVideoId: 14,
      },
    },
    {
      day: 5,
      videoTitle: typedMessages.days['5'].videoTitle,
      videoDescription: typedMessages.days['5'].videoDescription,
      motivationMessage: typedMessages.days['5'].motivationMessage,
    },
    {
      day: 6,
      videoTitle: typedMessages.days['6'].videoTitle,
      videoDescription: typedMessages.days['6'].videoDescription,
      motivationMessage: typedMessages.days['6'].motivationMessage,
    },
    {
      day: 7,
      videoTitle: typedMessages.days['7'].videoTitle,
      videoDescription: typedMessages.days['7'].videoDescription,
      motivationMessage: typedMessages.days['7'].motivationMessage,
    },
    {
      day: 8,
      videoTitle: typedMessages.days['8'].videoTitle,
      videoDescription: typedMessages.days['8'].videoDescription,
      motivationMessage: typedMessages.days['8'].motivationMessage,
    },
    {
      day: 9,
      videoTitle: typedMessages.days['9'].videoTitle,
      videoDescription: typedMessages.days['9'].videoDescription,
      motivationMessage: typedMessages.days['9'].motivationMessage,
    },
    {
      day: 10,
      videoTitle: typedMessages.days['10'].videoTitle,
      videoDescription: typedMessages.days['10'].videoDescription,
      motivationMessage: typedMessages.days['10'].motivationMessage,
    },
  ],
};
