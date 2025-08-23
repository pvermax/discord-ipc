// index.js
const net = require('net');
const crypto = require('crypto');
const os = require('os');
const EventEmitter = require('events');

/**
 * Discord Activity Types
 */
const ActivityTypes = {
    PLAYING: 0,
    STREAMING: 1,
    LISTENING: 2,
    WATCHING: 3,
    CUSTOM: 4,
    COMPETING: 5
};

/**
 * Discord Button Styles
 */
const ButtonStyles = {
    PRIMARY: 1,
    SECONDARY: 2,
    SUCCESS: 3,
    DANGER: 4,
    LINK: 5
};

/**
 * Advanced Discord IPC Client
 */
class DiscordIPC extends EventEmitter {
    constructor(options = {}) {
        super();

        this.clientId = options.clientId;
        this.debug = options.debug || false;
        this.autoReconnect = options.autoReconnect !== false;
        this.reconnectDelay = options.reconnectDelay || 5000;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;

        this.socket = null;
        this.connected = false;
        this.authenticated = false;
        this.reconnectAttempts = 0;
        this.currentActivity = null;

        // Queue for pending messages
        this.messageQueue = [];
        this.pendingResponses = new Map();

        // Heartbeat
        this.heartbeatInterval = null;
        this.lastHeartbeat = null;

        this.log('DiscordIPC initialized');
    }

    log(message, level = 'info') {
        if (this.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Generate UUID for nonces
     */
    createNonce() {
        return crypto.randomUUID();
    }

    /**
     * Get platform-specific IPC paths
     */
    getIPCPaths() {
        const platform = os.platform();
        const paths = [];

        for (let i = 0; i < 10; i++) {
            if (platform === 'win32') {
                paths.push(`\\\\.\\pipe\\discord-ipc-${i}`);
            } else {
                const baseDir = process.env.XDG_RUNTIME_DIR ||
                    process.env.TMPDIR ||
                    process.env.TMP ||
                    process.env.TEMP ||
                    '/tmp';
                paths.push(`${baseDir}/discord-ipc-${i}`);
            }
        }

        return paths;
    }

    /**
     * Connect to Discord IPC
     */
    async connect() {
        if (this.connected) {
            this.log('Already connected');
            return;
        }

        const paths = this.getIPCPaths();
        let lastError;

        for (const path of paths) {
            try {
                await this.tryConnect(path);
                this.log(`Connected to Discord via ${path}`);
                this.reconnectAttempts = 0;
                this.emit('connect');
                return;
            } catch (error) {
                lastError = error;
                this.log(`Failed to connect to ${path}: ${error.message}`, 'warn');
            }
        }

        throw new Error(`Could not connect to Discord: ${lastError?.message}`);
    }

    /**
     * Try connecting to specific path
     */
    async tryConnect(path) {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection(path);
            let connectionTimeout;

            connectionTimeout = setTimeout(() => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            }, 5000);

            socket.on('connect', () => {
                clearTimeout(connectionTimeout);
                this.socket = socket;
                this.connected = true;
                this.setupSocketHandlers();
                resolve();
            });

            socket.on('error', (error) => {
                clearTimeout(connectionTimeout);
                reject(error);
            });
        });
    }

    /**
     * Setup socket event handlers
     */
    setupSocketHandlers() {
        let buffer = Buffer.alloc(0);

        this.socket.on('data', (data) => {
            buffer = Buffer.concat([buffer, data]);

            while (buffer.length >= 8) {
                const opcode = buffer.readUInt32LE(0);
                const length = buffer.readUInt32LE(4);

                if (buffer.length < 8 + length) break;

                const payload = buffer.slice(8, 8 + length);
                buffer = buffer.slice(8 + length);

                this.handleMessage(opcode, payload);
            }
        });

        this.socket.on('close', () => {
            this.log('Socket closed');
            this.connected = false;
            this.authenticated = false;
            this.clearHeartbeat();
            this.emit('disconnect');

            if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }
        });

        this.socket.on('error', (error) => {
            this.log(`Socket error: ${error.message}`, 'error');
            this.emit('error', error);
        });
    }

    /**
     * Handle incoming messages
     */
    handleMessage(opcode, payload) {
        try {
            const message = JSON.parse(payload.toString());
            this.log(`Received: ${JSON.stringify(message)}`);

            // Handle responses to pending requests
            if (message.nonce && this.pendingResponses.has(message.nonce)) {
                const resolve = this.pendingResponses.get(message.nonce);
                this.pendingResponses.delete(message.nonce);
                resolve(message);
                return;
            }

            // Handle specific message types
            switch (message.cmd) {
                case 'DISPATCH':
                    this.handleDispatch(message);
                    break;
                default:
                    this.emit('message', message);
            }
        } catch (error) {
            this.log(`Failed to parse message: ${error.message}`, 'error');
        }
    }

    /**
     * Handle dispatch events
     */
    handleDispatch(message) {
        const { evt, data } = message;

        switch (evt) {
            case 'READY':
                this.emit('ready', data);
                break;
            case 'ERROR':
                this.emit('error', new Error(data.message));
                break;
            default:
                this.emit('dispatch', evt, data);
        }
    }

    /**
     * Send message to Discord
     */
    send(opcode, data) {
        if (!this.connected) {
            if (this.autoReconnect) {
                this.messageQueue.push([opcode, data]);
                return;
            }
            throw new Error('Not connected to Discord');
        }

        const payload = Buffer.from(JSON.stringify(data));
        const header = Buffer.alloc(8);

        header.writeUInt32LE(opcode, 0);
        header.writeUInt32LE(payload.length, 4);

        this.socket.write(Buffer.concat([header, payload]));
        this.log(`Sent: ${JSON.stringify(data)}`);
    }

    /**
     * Send command and wait for response
     */
    async sendCommand(cmd, args = {}, timeout = 10000) {
        const nonce = this.createNonce();
        const message = { cmd, nonce, args };

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingResponses.delete(nonce);
                reject(new Error(`Command ${cmd} timed out`));
            }, timeout);

            this.pendingResponses.set(nonce, (response) => {
                clearTimeout(timeoutId);
                if (response.evt === 'ERROR') {
                    reject(new Error(response.data.message));
                } else {
                    resolve(response);
                }
            });

            this.send(1, message);
        });
    }

    /**
     * Perform handshake
     */
    async handshake() {
        if (!this.clientId) {
            throw new Error('Client ID is required');
        }

        const handshake = {
            v: 1,
            client_id: this.clientId
        };

        this.send(0, handshake);
        this.startHeartbeat();
    }

    /**
     * Authenticate with Discord
     */
    async authenticate(accessToken = null) {
        if (!accessToken) {
            // Try to authorize without token (for basic RPC)
            try {
                await this.sendCommand('AUTHORIZE', {
                    client_id: this.clientId,
                    scopes: ['rpc']
                });
            } catch (error) {
                this.log('Authorization failed, continuing without auth', 'warn');
            }
        } else {
            await this.sendCommand('AUTHENTICATE', {
                access_token: accessToken
            });
        }

        this.authenticated = true;
        this.emit('authenticated');
        this.processQueue();
    }

    /**
     * Process queued messages
     */
    processQueue() {
        while (this.messageQueue.length > 0) {
            const [opcode, data] = this.messageQueue.shift();
            this.send(opcode, data);
        }
    }

    /**
     * Set Rich Presence Activity
     */
    async setActivity(activity) {
        const processedActivity = this.processActivity(activity);

        try {
            await this.sendCommand('SET_ACTIVITY', {
                pid: process.pid,
                activity: processedActivity
            });

            this.currentActivity = processedActivity;
            this.emit('activitySet', processedActivity);
        } catch (error) {
            this.log(`Failed to set activity: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Process and validate activity
     */
    processActivity(activity) {
        const processed = { ...activity };

        // Set default application_id
        if (!processed.application_id) {
            processed.application_id = this.clientId;
        }

        // Process timestamps
        if (processed.timestamps) {
            if (processed.timestamps.start && typeof processed.timestamps.start === 'object') {
                processed.timestamps.start = Math.floor(processed.timestamps.start.getTime() / 1000);
            }
            if (processed.timestamps.end && typeof processed.timestamps.end === 'object') {
                processed.timestamps.end = Math.floor(processed.timestamps.end.getTime() / 1000);
            }
        }

        // Validate buttons
        if (processed.buttons && processed.buttons.length > 2) {
            throw new Error('Maximum 2 buttons allowed');
        }

        // Validate assets
        if (processed.assets) {
            Object.keys(processed.assets).forEach(key => {
                if (processed.assets[key] && typeof processed.assets[key] !== 'string') {
                    throw new Error(`Asset ${key} must be a string`);
                }
            });
        }

        return processed;
    }

    /**
     * Clear activity
     */
    async clearActivity() {
        await this.sendCommand('SET_ACTIVITY', {
            pid: process.pid
        });

        this.currentActivity = null;
        this.emit('activityCleared');
    }

    /**
     * Subscribe to events
     */
    async subscribe(event, args = {}) {
        return await this.sendCommand('SUBSCRIBE', {
            evt: event,
            ...args
        });
    }

    /**
     * Unsubscribe from events
     */
    async unsubscribe(event, args = {}) {
        return await this.sendCommand('UNSUBSCRIBE', {
            evt: event,
            ...args
        });
    }

    /**
     * Get user info
     */
    async getUser(userId) {
        return await this.sendCommand('GET_USER', {
            user_id: userId
        });
    }

    /**
     * Get guilds
     */
    async getGuilds() {
        return await this.sendCommand('GET_GUILDS');
    }

    /**
     * Get channels
     */
    async getChannels(guildId = null) {
        const args = guildId ? { guild_id: guildId } : {};
        return await this.sendCommand('GET_CHANNELS', args);
    }

    /**
     * Start heartbeat
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.connected) {
                this.lastHeartbeat = Date.now();
                // Discord IPC doesn't require explicit heartbeats, but we track them
            }
        }, 30000);
    }

    /**
     * Clear heartbeat
     */
    clearHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Schedule reconnection
     */
    scheduleReconnect() {
        this.reconnectAttempts++;

        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            30000
        );

        this.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

        setTimeout(async () => {
            try {
                await this.connect();
                await this.handshake();
                if (this.authenticated) {
                    await this.authenticate();
                }
                if (this.currentActivity) {
                    await this.setActivity(this.currentActivity);
                }
            } catch (error) {
                this.log(`Reconnect attempt failed: ${error.message}`, 'error');
            }
        }, delay);
    }

    /**
     * Disconnect from Discord
     */
    disconnect() {
        this.autoReconnect = false;
        this.clearHeartbeat();

        if (this.socket) {
            this.socket.end();
            this.socket = null;
        }

        this.connected = false;
        this.authenticated = false;
        this.pendingResponses.clear();
        this.messageQueue.length = 0;

        this.emit('disconnect');
        this.log('Disconnected from Discord');
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.connected,
            authenticated: this.authenticated,
            clientId: this.clientId,
            currentActivity: this.currentActivity,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

/**
 * Activity Builder Helper
 */
class ActivityBuilder {
    constructor() {
        this.activity = {
            type: ActivityTypes.PLAYING
        };
    }

    setName(name) {
        this.activity.name = name;
        return this;
    }

    setType(type) {
        this.activity.type = type;
        return this;
    }

    setDetails(details) {
        this.activity.details = details;
        return this;
    }

    setState(state) {
        this.activity.state = state;
        return this;
    }

    setTimestamps(start, end) {
        this.activity.timestamps = {};
        if (start) this.activity.timestamps.start = start;
        if (end) this.activity.timestamps.end = end;
        return this;
    }

    setAssets(largeImage, largeText, smallImage, smallText) {
        this.activity.assets = {};
        if (largeImage) this.activity.assets.large_image = largeImage;
        if (largeText) this.activity.assets.large_text = largeText;
        if (smallImage) this.activity.assets.small_image = smallImage;
        if (smallText) this.activity.assets.small_text = smallText;
        return this;
    }

    setParty(id, size, max) {
        this.activity.party = { id };
        if (size !== undefined && max !== undefined) {
            this.activity.party.size = [size, max];
        }
        return this;
    }

    addButton(label, url) {
        if (!this.activity.buttons) {
            this.activity.buttons = [];
        }
        if (this.activity.buttons.length >= 2) {
            throw new Error('Maximum 2 buttons allowed');
        }
        this.activity.buttons.push({ label, url });
        return this;
    }

    setStreamingUrl(url) {
        this.activity.url = url;
        this.activity.type = ActivityTypes.STREAMING;
        return this;
    }

    build() {
        return { ...this.activity };
    }
}

module.exports = {
    DiscordIPC,
    ActivityBuilder,
    ActivityTypes,
    ButtonStyles
};

declare module 'discord-ipc' {
    import { EventEmitter } from 'events';

    export enum ActivityTypes {
        PLAYING = 0,
        STREAMING = 1,
        LISTENING = 2,
        WATCHING = 3,
        CUSTOM = 4,
        COMPETING = 5
    }

    export enum ButtonStyles {
        PRIMARY = 1,
        SECONDARY = 2,
        SUCCESS = 3,
        DANGER = 4,
        LINK = 5
    }

    export interface DiscordIPCOptions {
        clientId?: string;
        debug?: boolean;
        autoReconnect?: boolean;
        reconnectDelay?: number;
        maxReconnectAttempts?: number;
    }

    export interface Activity {
        name?: string;
        type?: number;
        url?: string;
        details?: string;
        state?: string;
        timestamps?: {
            start?: number | Date;
            end?: number | Date;
        };
        assets?: {
            large_image?: string;
            large_text?: string;
            small_image?: string;
            small_text?: string;
        };
        party?: {
            id?: string;
            size?: [number, number];
        };
        buttons?: Array<{
            label: string;
            url: string;
        }>;
        application_id?: string;
    }

    export declare class DiscordIPC extends EventEmitter {
        constructor(options?: DiscordIPCOptions);

        connect(): Promise<void>;
        disconnect(): void;
        handshake(): Promise<void>;
        authenticate(accessToken?: string): Promise<void>;

        setActivity(activity: Activity): Promise<void>;
        clearActivity(): Promise<void>;

        subscribe(event: string, args?: any): Promise<any>;
        unsubscribe(event: string, args?: any): Promise<any>;

        getUser(userId: string): Promise<any>;
        getGuilds(): Promise<any>;
        getChannels(guildId?: string): Promise<any>;

        getStatus(): {
            connected: boolean;
            authenticated: boolean;
            clientId: string;
            currentActivity: Activity | null;
            reconnectAttempts: number;
        };

        on(event: 'connect', listener: () => void): this;
        on(event: 'disconnect', listener: () => void): this;
        on(event: 'authenticated', listener: () => void): this;
        on(event: 'ready', listener: (data: any) => void): this;
        on(event: 'error', listener: (error: Error) => void): this;
        on(event: 'activitySet', listener: (activity: Activity) => void): this;
        on(event: 'activityCleared', listener: () => void): this;
        on(event: 'message', listener: (message: any) => void): this;
        on(event: 'dispatch', listener: (event: string, data: any) => void): this;
    }

    export declare class ActivityBuilder {
        constructor();

        setName(name: string): this;
        setType(type: number): this;
        setDetails(details: string): this;
        setState(state: string): this;
        setTimestamps(start?: number | Date, end?: number | Date): this;
        setAssets(largeImage?: string, largeText?: string, smallImage?: string, smallText?: string): this;
        setParty(id: string, size?: number, max?: number): this;
        addButton(label: string, url: string): this;
        setStreamingUrl(url: string): this;

        build(): Activity;
    }
}