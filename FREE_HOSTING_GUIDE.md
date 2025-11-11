# Free Hosting & Storage Guide

## Quick Answer: Best Free Solution

**Recommended Setup:**
- **Hosting**: Render.com (free tier) or Fly.io (free tier with persistent volumes)
- **Database**: MongoDB Atlas (free tier - 512MB)
- **Why**: Data persists forever, no data loss, automatic backups

## Free Hosting Services Comparison

| Service | Free Tier | Persistent Storage | Always-On | Best For |
|---------|-----------|-------------------|-----------|----------|
| **Render** | 750 hrs/month | ❌ No | ⚠️ Sleeps after 15min | Small bots |
| **Fly.io** | ⚠️ 7-day trial, then paid | ✅ Yes (3GB) | ✅ Yes | Bots needing disk (after trial) |
| **Replit** | Always-on option | ✅ Yes | ✅ Yes | Quick setup |
| **Koyeb** | 2 services | ❌ No | ✅ Yes | Simple deployments |
| **Cyclic** | Always-on | ❌ No | ✅ Yes | Serverless |

## Free Database Services

| Service | Free Tier | Type | Best For |
|---------|-----------|------|----------|
| **MongoDB Atlas** | 512MB | NoSQL | Easiest setup, most popular |
| **Supabase** | 500MB | PostgreSQL | Full SQL, built-in features |
| **PlanetScale** | 5GB | MySQL | Large databases |
| **Neon** | 3GB | PostgreSQL | Serverless, fast |

## Setup Instructions

### Option 1: Fly.io + File System (No Code Changes)

⚠️ **Note**: Fly.io only offers a 7-day free trial, then requires payment ($5-10/month)

1. **Sign up** at [fly.io](https://fly.io)
2. **Install Fly CLI**: `npm install -g @fly/cli`
3. **Login**: `fly auth login`
4. **Create app**: `fly launch`
5. **Create volume**: `fly volumes create player_data --size 1`
6. **Update `fly.toml`**:
   ```toml
   [mounts]
     source = "player_data"
     destination = "/app/player_data"
   ```
7. **Deploy**: `fly deploy`

✅ **Pros**: No code changes needed, files persist
❌ **Cons**: Only free for 7 days, then paid, limited to 3GB total, slower than database

### Option 2: Render + MongoDB Atlas (Recommended)

1. **Set up MongoDB Atlas**:
   - Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   - Create free cluster (M0 tier)
   - Create database user
   - Whitelist IP (0.0.0.0/0 for Render)
   - Copy connection string

2. **Set up Render**:
   - Sign up at [render.com](https://render.com)
   - Connect GitHub repo
   - Create new Web Service
   - Add environment variable: `MONGODB_URI=your_connection_string`
   - Deploy

3. **Update code** (see migration guide below)

✅ **Pros**: Data always persists, scales well, automatic backups
❌ **Cons**: Requires code changes

### Option 3: Fly.io + MongoDB Atlas (Best of Both)

1. **Set up MongoDB Atlas** (same as Option 2)
2. **Set up Fly.io** (same as Option 1, but skip volume creation)
3. **Add environment variable**: `MONGODB_URI=your_connection_string`
4. **Update code** (see migration guide below)

✅ **Pros**: Always-on hosting + persistent database
❌ **Cons**: Requires code changes

## Quick Migration to MongoDB Atlas

### Step 1: Install MongoDB Driver
```bash
npm install mongodb
```

### Step 2: Create `database.js`
```javascript
const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connectDatabase() {
  if (client) return db;
  
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️ MONGODB_URI not set, using file system');
    return null;
  }
  
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('hytale_bot');
  console.log('✅ Connected to MongoDB');
  return db;
}

async function savePlayerData(userId, data) {
  const database = await connectDatabase();
  if (!database) {
    // Fallback to file system
    const fs = require('fs');
    const path = require('path');
    const PLAYER_DATA_DIR = path.join(__dirname, 'player_data');
    if (!fs.existsSync(PLAYER_DATA_DIR)) {
      fs.mkdirSync(PLAYER_DATA_DIR, { recursive: true });
    }
    const filePath = path.join(PLAYER_DATA_DIR, `${userId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return;
  }
  
  await database.collection('players').updateOne(
    { userId },
    { $set: { ...data, userId, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function loadPlayerData(userId) {
  const database = await connectDatabase();
  if (!database) {
    // Fallback to file system
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, 'player_data', `${userId}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return null;
  }
  
  return await database.collection('players').findOne({ userId });
}

async function loadAllPlayerData() {
  const database = await connectDatabase();
  if (!database) {
    // Fallback to file system
    const fs = require('fs');
    const path = require('path');
    const PLAYER_DATA_DIR = path.join(__dirname, 'player_data');
    if (!fs.existsSync(PLAYER_DATA_DIR)) return {};
    
    const files = fs.readdirSync(PLAYER_DATA_DIR);
    const players = {};
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const userId = file.replace('.json', '');
        const data = loadPlayerData(userId);
        if (data) players[userId] = data;
      }
    });
    return players;
  }
  
  const players = {};
  const cursor = database.collection('players').find({});
  for await (const doc of cursor) {
    players[doc.userId] = doc;
  }
  return players;
}

module.exports = { savePlayerData, loadPlayerData, loadAllPlayerData };
```

### Step 3: Update `hytale-discord-bot.js`
Replace the `savePlayerData`, `loadPlayerData`, and `loadAllPlayerData` functions with imports from `database.js`:

```javascript
const { savePlayerData, loadPlayerData, loadAllPlayerData } = require('./database');
```

## Recommendation

**For a free, persistent solution:**
1. Use **Render** or **Fly.io** for hosting (both free)
2. Use **MongoDB Atlas** for data storage (free tier)
3. Migrate code to use MongoDB (see guide above)

This gives you:
- ✅ Always-on hosting (or mostly-on with Render)
- ✅ Persistent data storage
- ✅ Automatic backups
- ✅ Scales to thousands of players
- ✅ No data loss on redeployments

**Alternative (if you don't want to change code):**
- Use **Fly.io** with persistent volumes
- Mount volume to `/app/player_data`
- Keep existing file-based system
- Limited to 3GB total storage

