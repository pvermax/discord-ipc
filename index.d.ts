declare module "discord-ipc" {
  import { EventEmitter } from "events";

  export enum ActivityTypes {
    PLAYING = 0,
    STREAMING = 1,
    LISTENING = 2,
    WATCHING = 3,
    CUSTOM = 4,
    COMPETING = 5,
  }

  export enum ButtonStyles {
    PRIMARY = 1,
    SECONDARY = 2,
    SUCCESS = 3,
    DANGER = 4,
    LINK = 5,
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

    on(event: "connect", listener: () => void): this;
    on(event: "disconnect", listener: () => void): this;
    on(event: "authenticated", listener: () => void): this;
    on(event: "ready", listener: (data: any) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "activitySet", listener: (activity: Activity) => void): this;
    on(event: "activityCleared", listener: () => void): this;
    on(event: "message", listener: (message: any) => void): this;
    on(event: "dispatch", listener: (event: string, data: any) => void): this;
  }

  export declare class ActivityBuilder {
    constructor();

    setName(name: string): this;
    setType(type: number): this;
    setDetails(details: string): this;
    setState(state: string): this;
    setTimestamps(start?: number | Date, end?: number | Date): this;
    setAssets(
      largeImage?: string,
      largeText?: string,
      smallImage?: string,
      smallText?: string
    ): this;
    setParty(id: string, size?: number, max?: number): this;
    addButton(label: string, url: string): this;
    setStreamingUrl(url: string): this;

    build(): Activity;
  }
}
