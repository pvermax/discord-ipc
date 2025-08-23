# Discord IPC - Advanced Rich Presence Client

A powerful, feature-rich Discord IPC client for Node.js with support for all activity types, automatic reconnection, event handling, and comprehensive Discord RPC features.

## 🚀 Features

- ✅ **All Activity Types**: Playing, Streaming, Listening, Watching, Custom, Competing
- ✅ **Cross-Platform**: Works on Windows, macOS, and Linux
- ✅ **Auto-Reconnection**: Smart reconnection with exponential backoff
- ✅ **Event System**: Complete event handling for Discord RPC events
- ✅ **TypeScript Support**: Full TypeScript definitions included
- ✅ **Activity Builder**: Fluent API for building complex activities
- ✅ **Advanced Features**: Buttons, party info, timestamps, assets
- ✅ **Queue Management**: Message queuing during disconnections
- ✅ **Debug Mode**: Comprehensive logging for development
- ✅ **Error Handling**: Robust error handling and recovery

## 📦 Installation

```bash
npm install discord-ipc
```

## 🎯 Quick Start

```javascript
const { DiscordIPC, ActivityTypes } = require("discord-ipc");

const client = new DiscordIPC({
  clientId: "your_client_id_here",
  debug: true,
});

async function main() {
  // Connect and setup
  await client.connect();
  await client.handshake();
  await client.authenticate();

  // Set a simple activity
  await client.setActivity({
    name: "My Awesome Game",
    type: ActivityTypes.PLAYING,
    details: "In a match",
    state: "Score: 12-8",
  });
}

main().catch(console.error);
```

## 📚 Examples

### Basic Game Activity

```javascript
const { DiscordIPC, ActivityTypes } = require("discord-ipc");

const client = new DiscordIPC({
  clientId: "1234567890123456789",
  debug: true,
});

client.on("connect", () => console.log("Connected to Discord!"));
client.on("activitySet", (activity) => console.log("Activity set:", activity));

async function setGameActivity() {
  await client.connect();
  await client.handshake();
  await client.authenticate();

  await client.setActivity({
    name: "Cyberpunk 2077",
    type: ActivityTypes.PLAYING,
    details: "Exploring Night City",
    state: "Level 42 Street Kid",
    timestamps: {
      start: Date.now(),
    },
    assets: {
      large_image: "cyberpunk_logo",
      large_text: "Cyberpunk 2077",
      small_image: "character_icon",
      small_text: "V - Street Kid",
    },
    party: {
      id: "party_123",
      size: [1, 4],
    },
    buttons: [
      { label: "Join Game", url: "https://discord.gg/yourgame" },
      { label: "View Stats", url: "https://yoursite.com/stats" },
    ],
  });
}

setGameActivity().catch(console.error);
```

### Music Listening Activity

```javascript
const { DiscordIPC, ActivityTypes, ActivityBuilder } = require("discord-ipc");

const client = new DiscordIPC({ clientId: "your_client_id" });

async function setMusicActivity() {
  await client.connect();
  await client.handshake();
  await client.authenticate();

  // Using ActivityBuilder for cleaner code
  const activity = new ActivityBuilder()
    .setType(ActivityTypes.LISTENING)
    .setName("Spotify")
    .setDetails("Bohemian Rhapsody")
    .setState("by Queen")
    .setTimestamps(Date.now(), Date.now() + 354000) // 5:54 song
    .setAssets(
      "queen_album_cover",
      "A Night at the Opera",
      "spotify_icon",
      "Spotify"
    )
    .build();

  await client.setActivity(activity);
}
```

### Streaming Activity

```javascript
async function setStreamActivity() {
  await client.connect();
  await client.handshake();
  await client.authenticate();

  await client.setActivity({
    name: "Just Chatting",
    type: ActivityTypes.STREAMING,
    url: "https://twitch.tv/yourstream",
    details: "Building Discord bots",
    state: "127 viewers",
    timestamps: {
      start: Date.now(),
    },
    assets: {
      large_image: "twitch_logo",
      large_text: "Live on Twitch",
    },
    buttons: [{ label: "Watch Stream", url: "https://twitch.tv/yourstream" }],
  });
}
```

### Advanced Event Handling

```javascript
const client = new DiscordIPC({
  clientId: "your_client_id",
  debug: true,
  autoReconnect: true,
  maxReconnectAttempts: 5,
});

// Event listeners
client.on("connect", () => {
  console.log("🟢 Connected to Discord");
});

client.on("disconnect", () => {
  console.log("🔴 Disconnected from Discord");
});

client.on("authenticated", () => {
  console.log("✅ Authenticated successfully");
});

client.on("error", (error) => {
  console.error("❌ Error:", error.message);
});

client.on("activitySet", (activity) => {
  console.log("🎮 Activity updated:", activity.name);
});

client.on("ready", (data) => {
  console.log("📡 Discord RPC Ready:", data);
});

// Subscribe to Discord events
client.on("authenticated", async () => {
  // Subscribe to voice channel events
  await client.subscribe("VOICE_CHANNEL_SELECT");

  // Subscribe to message events
  await client.subscribe("MESSAGE_CREATE", {
    channel_id: "your_channel_id",
  });
});

client.on("dispatch", (event, data) => {
  console.log(`📨 Discord Event [${event}]:`, data);

  switch (event) {
    case "VOICE_CHANNEL_SELECT":
      console.log("Voice channel changed:", data);
      break;
    case "MESSAGE_CREATE":
      console.log("New message:", data);
      break;
  }
});
```

### Getting Discord Data

```javascript
async function getDiscordInfo() {
  await client.connect();
  await client.handshake();
  await client.authenticate();

  try {
    // Get user info
    const user = await client.getUser("user_id_here");
    console.log("User:", user);

    // Get guilds (servers)
    const guilds = await client.getGuilds();
    console.log("Guilds:", guilds);

    // Get channels
    const channels = await client.getChannels("guild_id_here");
    console.log("Channels:", channels);
  } catch (error) {
    console.error("Failed to get Discord info:", error);
  }
}
```

### Real-time Game Status

```javascript
class GameStatusTracker {
    constructor(clientId) {
        this.client = new DiscordIPC({ clientId, autoReconnect: true });
        this.gameState = {
            level: 1,
            score: 0,
            health: 100
        };
        this.startTime = Date.now();
    }

    async start() {
        await this.client.connect();
        await this.client.handshake();
        await this.client.authenticate();

        // Update activity every 10 seconds
        setInterval(() => {
            this.updateActivity();
        }, 10000);

        // Initial activity
        await this.updateActivity();
    }

    async updateActivity() {
        const activity = {
            name: 'Epic Adventure Game',
            type: ActivityTypes.PLAYING,
            details: `Level ${this.gameState.level}`,
            state: `Score: ${this.gameState.score} | HP: ${this.gameState.health}`,
            timestamps: {
                start: this.startTime
            },
            assets: {
                large_image: 'game_logo',
                large_text: 'Epic Adventure',
                small_image: this.gameState.health > 50 ? 'health_good' : 'health_low',
                small_text: `Health: ${this.gameState.health}%`
            }
        };

        await this.client.setActivity(activity);
    }

    // Game event handlers
    onLevelUp(newLevel) {
        this.gameState.level = newLevel;
        this.updateActivity();
    }

    onScoreChange(newScore) {
```
