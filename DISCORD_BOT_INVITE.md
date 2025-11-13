# Discord Bot Invite URL Setup

## Required Scopes (OAuth2)

When generating the bot invite URL, you need these **scopes**:

1. **`bot`** - Required for all bot functionality
2. **`applications.commands`** - Required for slash commands

## Required Bot Permissions

The bot needs the following permissions (permission integer: **268445760**):

### Essential Permissions:
- ✅ **Send Messages** - To send command responses and notifications
- ✅ **Embed Links** - To send rich embeds
- ✅ **Read Message History** - To read messages in channels
- ✅ **Use Slash Commands** - For slash command functionality
- ✅ **Manage Roles** - To create and assign leveling roles, daily recap roles, and Twitter monitoring roles
- ✅ **Add Reactions** - For button interactions and reactions
- ✅ **Use External Emojis** - To display custom emojis
- ✅ **View Channels** - To see channels
- ✅ **Read Messages/View Channel** - To read messages

### Optional but Recommended:
- ✅ **Attach Files** - For any file attachments (if needed)
- ✅ **Connect** - For voice channel features (if you add voice features later)
- ✅ **Speak** - For voice channel features (if you add voice features later)

## How to Generate the Invite URL

### Option 1: Using Discord Developer Portal (Recommended)

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Go to **OAuth2** → **URL Generator**
4. **IMPORTANT**: Make sure you're in the **URL Generator** section, NOT the "General" OAuth2 section
5. Under **SCOPES**, select:
   - ✅ `bot` (this is for bot installation, NOT user OAuth)
   - ✅ `applications.commands` (for slash commands)
6. **DO NOT** select any user-related scopes like `identify`, `email`, `guilds`, etc. - those are for user OAuth flows
7. Under **BOT PERMISSIONS** (this section appears after selecting `bot` scope), select:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Read Message History
   - ✅ Use Slash Commands
   - ✅ Manage Roles
   - ✅ Add Reactions
   - ✅ Use External Emojis
   - ✅ View Channels
   - ✅ Read Messages/View Channel
8. Copy the generated URL at the bottom
9. Open the URL in your browser to invite the bot

**⚠️ Common Mistake**: If you see "invalid scopes used for user installation", you're likely:
- In the wrong OAuth2 section (use URL Generator, not General)
- Selected user scopes instead of bot scopes
- Trying to use the OAuth2 URL for user authentication instead of bot installation

### Option 2: Manual URL Construction (Recommended if URL Generator Fails)

If the URL Generator is giving you errors, you can construct the URL manually:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=268445760&scope=bot%20applications.commands
```

**How to find your Client ID:**
1. Go to **OAuth2** → **General** section
2. Copy the **Client ID** (it's a long number, like `123456789012345678`)
3. Replace `YOUR_BOT_CLIENT_ID` in the URL above with this number
4. Open the URL in your browser

**Example:**
If your Client ID is `123456789012345678`, your URL would be:
```
https://discord.com/api/oauth2/authorize?client_id=123456789012345678&permissions=268445760&scope=bot%20applications.commands
```

**Permission Integer Breakdown:**
- `268445760` = Send Messages + Embed Links + Read Message History + Use Slash Commands + Manage Roles + Add Reactions + Use External Emojis + View Channels + Read Messages

## Important Notes

1. **No Redirect URI Needed**: You don't need to set up a redirect URI for bot invites. Redirect URIs are only for OAuth2 user authentication flows (like web dashboards), not for bot invites.

2. **Bot Scopes vs User Scopes**: 
   - ✅ **Use**: `bot` and `applications.commands` (for bot installation)
   - ❌ **Don't Use**: `identify`, `email`, `guilds`, `connections` (these are for user OAuth, not bot installation)

3. **If You See "Invalid Scopes" Error** (even with only `bot` and `applications.commands`):
   
   **First, verify your bot is properly set up:**
   - Go to **Bot** section (left sidebar) in the Developer Portal
   - Make sure "Public Bot" is enabled (toggle should be ON)
   - Make sure "Requires OAuth2 Code Grant" is **OFF** (this can cause issues)
   - Make sure "Message Content Intent" is enabled if your bot reads messages
   - Make sure "Server Members Intent" is enabled if your bot needs member info
   
   **Then try these fixes:**
   - Make sure you're using the **URL Generator** (not the General OAuth2 section)
   - Only select `bot` and `applications.commands` scopes
   - Don't select any user-related scopes
   - The URL should be for **bot installation**, not user authorization
   - **Try the manual URL method** (Option 2 below) - sometimes this works when the URL Generator has issues
   - Clear your browser cache and try again
   - Make sure you're using the **Client ID** (not Application ID or Bot Token)

4. **Role Hierarchy**: Make sure the bot's role is positioned **above** any roles it needs to manage. The bot needs to be able to create and assign roles, so its role must be higher in the server's role hierarchy.

5. **Permissions**: The bot will work with fewer permissions, but some features (like role management) won't work without the "Manage Roles" permission.

## Quick Invite URL Template

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=268445760&scope=bot%20applications.commands
```

Just replace `YOUR_BOT_CLIENT_ID` with your actual bot's Client ID!

