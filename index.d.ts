import * as events from "events";
export interface Options {
    host?: string;
    jsonrpc?: string;
    connectTimeout?: number;
    maxBuffered?: number;
    connectImmediately?: boolean;
    retryDelay?: number;
    socketEncoder?: Function;
}
export declare type Response = (error: any, result?: any) => void;
export declare class ReconnectSocket extends events.EventEmitter {
    private cache;
    private port;
    private options;
    private socket;
    private sendingIndex;
    private sendingObj;
    constructor(cache: any, port: number, options?: Options);
    private closed;
    close: () => void;
    private socketConnected;
    connect: () => void;
    private onSocketConnect;
    private paused;
    private onSocketDrain;
    send(): void;
}
export declare class Client {
    private port;
    private options;
    private socket;
    private jsonStream;
    private cache;
    constructor(port: number, options?: Options);
    private id;
    request(method: string, params?: Object, cb?: Response): void;
    private response(obj);
    private whenOverflow;
    close(): void;
}
export declare class Server {
    private port;
    private options;
    private server;
    private sockets;
    constructor(port: number, options?: Options);
    private methods;
    register(method: string, cb: (params: any, resp: Response) => void): void;
    private send(socket, obj);
    start(): void;
    close(cb?: Function): void;
}
export default Client;
