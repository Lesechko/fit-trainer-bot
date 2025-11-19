# Telegram Training Bot

A Telegram bot for managing training courses with daily videos, progress tracking, and interactive features.

## Course Configuration

Courses are configured using a clean structure that separates configuration logic from message content.

### File Structure

Each course has two files:
- **Config file** (`src/courses/[course-name].ts`) - Course structure and settings
- **Messages file** (`src/courses/messages/[course-name].json`) - All text content

### Example: Basic Course Setup

#### 1. Create Messages File (`src/courses/messages/my-course.json`)

```json
{
  "welcome": "Привіт! 💙\n\nЛаскаво просимо до курсу!",
  "days": {
    "1": {
      "videoTitle": "🎬 День 1: Вступ",
      "videoDescription": "Сьогодні починаємо наш курс! 🚀",
      "motivationMessage": "Ти зробив перший крок! 💪"
    },
    "2": {
      "videoTitle": "🎬 День 2: Основні вправи",
      "videoDescription": "Сьогодні вивчаємо <b>основні вправи</b> для початківців.",
      "motivationMessage": "Продовжуй у тому ж темпі! 🌟"
    }
  }
}
```

#### 2. Create Type Definition (`src/courses/messages/my-course.d.ts`)

```typescript
export interface DayMessages {
  videoTitle: string;
  videoDescription: string;
  motivationMessage: string;
  difficultyChoice?: {
    message: string;
    easyButtonText: string;
    hardButtonText: string;
  };
}

export interface CourseMessages {
  welcome: string;
  days: {
    [key: string]: DayMessages;
  };
}

declare const messages: CourseMessages;
export default messages;
```

#### 3. Create Config File (`src/courses/my-course.ts`)

```typescript
import { CourseStaticConfig } from '../types';
import messages from './messages/my-course.json';
import type { CourseMessages } from './messages/my-course';

const typedMessages = messages as CourseMessages;

export const myCourse: CourseStaticConfig = {
  slug: 'my-course',
  title: 'Мій курс',
  welcome: typedMessages.welcome,
  dailyTime: '19:00',
  trackLessonCompletion: true,
  motivation: {
    time: '09:00',
    defaultMessages: [],
  },
  days: [
    {
      day: 1,
      videoTitle: typedMessages.days['1'].videoTitle,
      videoDescription: typedMessages.days['1'].videoDescription,
      motivationMessage: typedMessages.days['1'].motivationMessage,
      autoSend: false, // Day 1 sent manually via button
    },
    {
      day: 2,
      videoTitle: typedMessages.days['2'].videoTitle,
      videoDescription: typedMessages.days['2'].videoDescription,
      motivationMessage: typedMessages.days['2'].motivationMessage,
    },
  ],
};
```

#### 4. Register Course (`src/config.ts`)

```typescript
import { myCourse } from './courses/my-course';

export const COURSES: CourseStaticConfig[] = [myCourse];
```

## Features

### HTML Formatting in Messages

You can use HTML tags in your messages for formatting:

```json
{
  "days": {
    "2": {
      "videoDescription": "Сьогодні ми працюємо з <b>плечовим суглобом</b> та <b>лопатками</b> — це ключ до легкої постави.",
      "motivationMessage": "Твій рух має <i>значення</i> 🌱"
    }
  }
}
```

**Supported HTML tags:**
- `<b>bold</b>` or `<strong>bold</strong>`
- `<i>italic</i>` or `<em>italic</em>`
- `<u>underline</u>`
- `<s>strikethrough</s>`
- `<code>monospace</code>`
- `<a href="url">link</a>`

### Difficulty Choice (Easy/Hard Videos)

Allow users to choose difficulty level before receiving video:

**Messages JSON:**
```json
{
  "days": {
    "4": {
      "videoTitle": "🎬 День 4: Складні вправи",
      "videoDescription": "",
      "motivationMessage": "Обери свій рівень!",
      "difficultyChoice": {
        "message": "<b>Сьогодні ми розділимо наше тренування за двома рівнями:</b>\n\n<b>1. Базовий рівень 🌿</b>\n\nПідійде тим, в кого під час тестових вправ відчувався дискомфорт.\n\n<b>2. Просунутий рівень 🔥</b>\n\nДля тих, хто виконував тестові вправи з легкістю.\n\n<b>Обери свій рівень 👇</b>",
        "easyButtonText": "Базовий рівень",
        "hardButtonText": "Просунутий рівень"
      }
    }
  }
}
```

**Config file:**
```typescript
{
  day: 4,
  videoTitle: typedMessages.days['4'].videoTitle,
  videoDescription: typedMessages.days['4'].videoDescription,
  motivationMessage: typedMessages.days['4'].motivationMessage,
  difficultyChoice: {
    message: typedMessages.days['4'].difficultyChoice!.message,
    easyButtonText: typedMessages.days['4'].difficultyChoice!.easyButtonText,
    hardButtonText: typedMessages.days['4'].difficultyChoice!.hardButtonText,
    easyVideoId: 13, // Video ID from database (use /listvideos to get ID)
    hardVideoId: 14, // Video ID from database
  },
}
```

**Steps:**
1. Add reference videos using `/addref <file_id>` command
2. Get video IDs using `/listvideos` command
3. Use those IDs in `easyVideoId` and `hardVideoId`

### Custom Buttons

Add custom buttons for extra videos, messages, or URLs:

**Config file:**
```typescript
{
  day: 2,
  videoTitle: typedMessages.days['2'].videoTitle,
  videoDescription: typedMessages.days['2'].videoDescription,
  motivationMessage: typedMessages.days['2'].motivationMessage,
  customButtons: [
    {
      id: 'extra_video',
      text: '📹 Додаткове відео',
      action: {
        type: 'video',
        videoFileId: 'BAACAgIAAxkBAAIB...', // Get from /addvideo command
        message: 'Ось додаткове відео з детальними поясненнями!', // Optional message after video
      },
      oneTime: true, // Button disappears after first use
    },
    {
      id: 'help_message',
      text: '❓ Допомога',
      action: {
        type: 'message',
        text: 'Якщо виникли питання, зверніться до підтримки!',
      },
    },
    {
      id: 'resource_link',
      text: '🔗 Ресурси',
      action: {
        type: 'url',
        url: 'https://example.com/resources',
      },
    },
  ],
}
```

### Course Settings

```typescript
export const myCourse: CourseStaticConfig = {
  slug: 'my-course',                    // Unique identifier
  title: 'Мій курс',                    // Display name
  welcome: typedMessages.welcome,       // Welcome message from JSON
  dailyTime: '19:00',                   // When to send daily videos (HH:MM)
  trackLessonCompletion: true,          // Show "Виконано!" button (default: true)
  motivation: {
    time: '09:00',                      // When to send motivation messages (HH:MM)
    defaultMessages: [],                // Fallback messages if day doesn't have one
  },
  days: [/* day configs */],
};
```

### Day Configuration Options

```typescript
{
  day: 1,                               // Day number (1-based)
  videoTitle: typedMessages.days['1'].videoTitle,
  videoDescription: typedMessages.days['1'].videoDescription,
  motivationMessage: typedMessages.days['1'].motivationMessage,
  autoSend: false,                     // Don't auto-send (default: true)
  customButtons: [/* buttons */],       // Custom buttons for this day
  difficultyChoice: { /* choice */ },   // Easy/hard video choice
}
```

## Admin Commands

### Video Management

```bash
# Add daily video for a day
/addvideo 1 BAACAgIAAxkBAAIB...

# Add reference video (for easy/hard options)
/addref BAACAgIAAxkBAAIB...

# List all videos with IDs
/listvideos

# Delete video for a day
/delvideo 1

# Broadcast video to all users
/sendvideo BAACAgIAAxkBAAIB...
```

### Course Management

```bash
# List all courses
/courses

# Set current course context
/setcourse my-course

# Show current course
/context

# Sync courses from config
/synccourses
```

### User Management

```bash
# List users
/listusers

# Remove user from course
/removeuser 123456789

# Send specific day to user
/sendday 123456789 5
```

### Access Codes

```bash
# Generate access code
/genaccess

# Generate access code with expiration (7 days)
/genaccess 7
```

## Project Structure

```
src/
├── courses/
│   ├── my-course.ts              # Course configuration
│   └── messages/
│       ├── my-course.json        # All messages/content
│       └── my-course.d.ts        # TypeScript types
├── commands/                     # Bot commands
├── services/                     # Business logic
├── config.ts                     # App configuration
└── types.ts                      # TypeScript types
```

## Benefits of This Structure

✅ **Clean separation** - Configuration logic separate from content  
✅ **Easy editing** - All messages in one JSON file  
✅ **HTML formatting** - Rich text support with HTML tags  
✅ **Type safety** - Full TypeScript support  
✅ **Scalable** - Easy to add more courses  
✅ **Maintainable** - Clear structure and organization

