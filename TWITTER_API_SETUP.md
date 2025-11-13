# Twitter/X API Setup Guide

## Required Twitter API Keys

For Twitter/X API v2, you need a **Bearer Token** for read-only operations (which is what we need for monitoring tweets).

### Option 1: Bearer Token (Recommended - Easiest)

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new project/app or use an existing one
3. Go to your app's "Keys and tokens" section
4. Under "Bearer Token", click "Generate" or copy your existing Bearer Token
5. Add it to your environment variables as: `TWITTER_BEARER_TOKEN`

**This is the ONLY key you need for read-only tweet monitoring!**

### Option 2: OAuth 1.0a (More Complex - Not Needed)

If you need write access, you would need:
- API Key
- API Secret Key  
- Access Token
- Access Token Secret

**But for this bot, you only need the Bearer Token (Option 1).**

## Environment Variables

Add to your `.env` file or Railway environment variables:

```env
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

## Twitter API v2 Endpoints Used

- `GET /2/users/by/username/:username` - Get user ID from username
- `GET /2/users/:id/tweets` - Get tweets from a user

## Rate Limits

Twitter API v2 has rate limits:
- User lookup: 300 requests per 15 minutes
- Tweet lookup: 300 requests per 15 minutes

The bot checks every 10 minutes, so you should be well within limits.

