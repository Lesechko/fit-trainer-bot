# Site User Entry Flow

## User Journey Schema

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. WEBSITE                                                      │
│    User clicks link:                                            │
│    https://t.me/botname?start=site-courseslug                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. TELEGRAM BOT                                                 │
│    Receives: /start site-courseslug                             │
│    Handler: startCommandCallback()                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PARAMETER PARSING                                            │
│    • Extract param: "site-courseslug"                          │
│    • Check: param.startsWith('site-') ✓                        │
│    • Extract courseSlug: "courseslug"                          │
│    • Call: handleSiteUser(ctx, courseSlug)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. COURSE LOOKUP                                                │
│    • Find course in COURSES config by slug                      │
│    • Check if courseConfig exists                               │
│    • Check if courseConfig.siteVisitor exists                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
    ┌──────────────────┐      ┌──────────────────────────┐
    │ Course NOT found │      │ Course found             │
    │ OR               │      │ AND has siteVisitor      │
    │ No siteVisitor   │      │ config                   │
    └────────┬─────────┘      └────────────┬─────────────┘
             │                              │
             ▼                              ▼
    ┌──────────────────┐      ┌──────────────────────────┐
    │ Send error:      │      │ 5. SEND GREETING         │
    │ SITE_VISITOR_    │      │    • Get greeting text    │
    │ COURSE_NOT_FOUND │      │    • Get paymentUrl       │
    │                  │      │    • Get paymentButtonText│
    └──────────────────┘      └────────────┬─────────────┘
                                            │
                                            ▼
                              ┌──────────────────────────────┐
                              │ 6. PAYMENT URL CHECK         │
                              │    • Check if paymentUrl     │
                              │      is configured           │
                              └────────────┬─────────────────┘
                                           │
                          ┌────────────────┴────────────────┐
                          │                                  │
                          ▼                                  ▼
              ┌──────────────────────┐      ┌──────────────────────────┐
              │ No paymentUrl        │      │ paymentUrl exists        │
              │ • Log error          │      │                          │
              │ • Send greeting only │      │ 7. SEND MESSAGE          │
              │   (no button)        │      │    • Greeting (HTML)      │
              └──────────────────────┘      │    • Inline button:      │
                                             │      - Text: paymentBtn  │
                                             │      - URL: paymentUrl   │
                                             └────────────┬─────────────┘
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │ 8. USER SEES             │
                                            │    • Greeting message     │
                                            │    • Payment button       │
                                            └────────────┬─────────────┘
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │ 9. USER CLICKS BUTTON    │
                                            │    • Opens paymentUrl    │
                                            │      with redirect_url    │
                                            │    • External redirect   │
                                            │    • User completes       │
                                            │      payment              │
                                            └────────────┬─────────────┘
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │ 10. PAYMENT SERVICE      │
                                            │     Redirects back to bot │
                                            │     URL: paid-courseslug  │
                                            └────────────┬─────────────┘
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │ 11. PAYMENT COMPLETION   │
                                            │     Handler triggered     │
                                            │     handlePaymentCompletion│
                                            └────────────┬─────────────┘
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │ 12. AUTO-ENROLLMENT      │
                                            │     • Ensure user exists  │
                                            │     • Check course exists │
                                            │     • Check if enrolled   │
                                            │     • Create access code  │
                                            │     • Enroll user         │
                                            │     • Send confirmation   │
                                            └──────────────────────────┘
```

## Code Flow Details

### Entry Points
- **File**: `src/commands/user/enrollment.ts`
- **Function**: `startCommandCallback()`
- **Triggers**: 
  - `/start site-courseslug` - Initial site visitor
  - `/start paid-courseslug` - Payment completion redirect

### Key Functions

1. **`startCommandCallback()`** (line 14)
   - Parses `/start` command parameter
   - Detects `paid-` prefix (payment completion) - priority check
   - Detects `site-` prefix (site visitor)
   - Routes to appropriate handler or `redeemWithCode()`

2. **`handleSiteUser()`** (line 45)
   - Looks up course by slug in `COURSES` config
   - Validates course exists and has `siteVisitor` config
   - Generates payment redirect URL using `getPaymentRedirectUrl()`
   - Appends redirect URL to payment URL as `redirect_url` parameter
   - Sends greeting with payment button

3. **`handlePaymentCompletion()`** (new)
   - Handles users returning from payment service
   - Ensures user exists in database
   - Validates course exists
   - Checks for existing enrollment
   - Automatically creates access code
   - Enrolls user in course
   - Sends enrollment confirmation

4. **`getPaymentRedirectUrl()`** (new)
   - Generates redirect URL for payment service
   - Format: `https://t.me/botname?start=paid-courseslug`
   - Used by payment service to redirect after successful payment

### Configuration Structure

```typescript
CourseStaticConfig {
  slug: string;                    // e.g., "healthy-joints"
  siteVisitor?: {
    greeting: string;              // HTML greeting message
    paymentUrl: string;            // External payment URL
    paymentButtonText?: string;    // Button label (default: "💳 Оплатити курс")
  }
}
```

### Error Cases

1. **Course not found**: `SITE_VISITOR_COURSE_NOT_FOUND`
2. **No siteVisitor config**: `SITE_VISITOR_COURSE_NOT_FOUND`
3. **No paymentUrl**: Logs error, sends greeting without button

### Payment Redirect Flow

**Payment Service Integration:**
1. Payment URL should accept `redirect_url` parameter
2. After successful payment, payment service redirects to: `https://t.me/botname?start=paid-courseslug`
3. Bot automatically detects `paid-` prefix and processes enrollment

**Example Payment URL:**
```
https://payment-service.com/checkout?amount=1000&redirect_url=https://t.me/botname?start=paid-healthy-joints
```

### Auto-Enrollment Process

When user returns from payment (`paid-courseslug`):
1. **User Validation**: Ensures user exists in database
2. **Course Validation**: Verifies course exists and is active
3. **Enrollment Check**: 
   - If already enrolled → shows message
   - If enrolled in different course → handles restart flow
4. **Code Generation**: Automatically creates access code (no expiration)
5. **Enrollment**: Enrolls user with today's date as start date
6. **Confirmation**: Sends welcome message with "Start Day 1" button

### Error Cases

1. **Course not found**: `SITE_VISITOR_COURSE_NOT_FOUND`
2. **No siteVisitor config**: `SITE_VISITOR_COURSE_NOT_FOUND`
3. **No paymentUrl**: Logs error, sends greeting without button
4. **Payment completion error**: `PAYMENT_COMPLETION_ERROR`
5. **Already enrolled**: `PAYMENT_ALREADY_ENROLLED` (with course name)

### Payment Service Requirements

Your payment service must:
- Accept `redirect_url` as a query parameter (or adjust the parameter name in code)
- Redirect user to the provided URL after successful payment
- Handle failed payments appropriately (user won't be redirected)

**Note**: If your payment service uses a different parameter name (e.g., `return_url`, `success_url`), update line 67-69 in `enrollment.ts` to match your service's API.
