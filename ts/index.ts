/*
 * http://www.jsonrpc.org/specification
 *
 * Warning:
 *  Batch is not implemented.
 *  Server is not fully implemented.
 */

import * as events from "events"
import * as net from "net"

import { JSONStream } from "json-stream"

let CBuffer: any = require("CBuffer")

export interface Options {
  host?: string // optional server host
  jsonrpc?: string // optional protocol version, ex. "2.0"
  connectTimeout?: number
  maxBuffered?: number
  connectImmediately?: boolean
  retry?: boolean
  retryDelay?: number
  socketEncoder?: Function
}

const defaultOptions: Options = {
  connectTimeout: 10e3,
  maxBuffered: 100,
  connectImmediately: false,
  socketEncoder: (obj: any) => {
    return new Buffer(JSON.stringify(obj) + "\n")
  },
  retry: true,
  retryDelay: 100,
}

function mergeOptions(options?: Options) {
  let res: any = {}
  for (let key in defaultOptions) {
    if (defaultOptions.hasOwnProperty(key)) {
      res[key] = (defaultOptions as any)[key]
    }
  }
  if (options != null) {
    for (let key in options) {
      if (options.hasOwnProperty(key)) {
        res[key] = (options as any)[key]
      }
    }
  }
  return res
}

export type Response = (error: any, result?: any) => void

interface SendingObj {
  id?: number
  obj: any
  cb?: Response
  buf?: Buffer
  done?: boolean
}

export class ReconnectSocket extends events.EventEmitter {
  // socket that reconnect and re-send
  private options: Options
  private socket: net.Socket
  private sendingIndex: number
  private sendingObj: SendingObj
  constructor(private cache: any, private port: number, options?: Options) {
    super()
    this.options = mergeOptions(options)
    if (this.options.connectImmediately) {
      this.connect()
    }
  }
  private closed: boolean
  close = () => {
    this.closed = true
    if (this.socket) {
      this.socket.end()
      this.socket.unref()
    }
  }
  private socketConnected: boolean
  connect = () => {
    if (this.socket || this.closed) {
      return
    }
    let socket = net.createConnection(this.port, this.options.host)
    this.socket = socket
    socket.on("connect", this.onSocketConnect)
    let onError = () => {
      if (this.socket !== socket) {
        return
      }
      this.socketConnected = false
      delete this.sendingIndex
      delete this.sendingObj
      socket.destroy()
      delete this.socket
      if (!this.closed && this.options.retry) {
        setTimeout(this.connect, this.options.retryDelay)
      } else {
        this.emit("error", "connect failed")
      }
    }
    socket.on("error", onError)
    socket.on("close", onError)
    socket.on("end", onError)
    socket.on("drain", this.onSocketDrain)
    socket.on("data", (data: any) => {
      this.emit("data", data)
    })
    if (this.options.connectTimeout) {
      socket.setTimeout(this.options.connectTimeout, onError)
    }
  }
  private onSocketConnect = () => {
    delete this.sendingIndex
    delete this.sendingObj
    this.socketConnected = true
    this.emit("connect")
    this.send()
  }
  private paused: boolean
  private onSocketDrain = () => {
    delete this.paused
    this.send()
  }
  send() {
    if (this.cache.size <= 0) {
      return
    }
    while (true) {
      if (this.paused) {
        return
      }
      if (this.socketConnected) {
        if (this.sendingIndex == null) {
          this.sendingIndex = 0
          this.sendingObj = this.cache.get(0)
        } else {
          let index = this.sendingIndex
          if (index >= this.cache.size) {
            index = this.cache.size - 1
          }
          // find the real index since cache may be shifted
          while (index >= 0) {
            if (this.cache.get(index) === this.sendingObj) {
              break
            }
            --index
          }
          if (index >= 0) {
            // found
            this.sendingIndex = index
            this.emit("sent", this.sendingObj)
          } else {
            // the sendingObj may overflow and be removed
            delete this.sendingIndex
            delete this.sendingObj
          }
          // skip done ones
          while (true) {
            ++index
            if (index >= this.cache.size) {
              return
            }
            this.sendingIndex = index
            this.sendingObj = this.cache.get(index)
            if (this.sendingObj.done) {
              continue
            }
            break
          }
        }
        if (this.sendingObj.buf == null) {
          this.sendingObj.buf = this.options.socketEncoder(this.sendingObj.obj)
        }
        if (!this.socket.write(this.sendingObj.buf, "buffer")) {
          this.paused = true
        }
      } else {
        this.connect()
        return
      }
    }
  }
}

export class Client {
  private options: Options
  private socket: ReconnectSocket
  private jsonStream: JSONStream
  private cache: any
  constructor(private port: number, options?: Options) {
    this.options = mergeOptions(options)
    this.cache = new CBuffer(this.options.maxBuffered)
    this.cache.overflow = this.whenOverflow
    this.socket = new ReconnectSocket(this.cache, port, this.options)
    this.socket.on("connect", () => {
      if (this.jsonStream) {
        this.jsonStream.end()
        this.jsonStream.removeAllListeners()
        delete this.jsonStream
      }
      this.jsonStream = new JSONStream()
      this.jsonStream.on("data", (obj: any) => {
        this.response(obj)
      })
    })
    this.socket.on("data", (data: any) => {
      if (this.jsonStream) {
        this.jsonStream.write(data)
      }
    })
    this.socket.on("sent", (sendingObj: SendingObj) => {
      if (sendingObj.obj.id == null) {
        // not resend Notification
        sendingObj.done = true
      }
    })
    this.socket.on("error", (error?: string) => {
      let obj = { error: { code: -32300, message: error } }
      while (this.cache.size > 0) {
        let sendingObj: SendingObj = this.cache.shift()
        if (sendingObj.cb) {
          sendingObj.cb(obj.error)
        }
      }
    })
  }
  private id = 1
  request(
    method: string,
    params?: Object,
    cb?: Response,
    opts?: {
      fields: any
    }
  ) {
    let req: any
    if (opts && opts.fields) {
      req = { ...opts.fields, method }
    } else {
      req = { method }
    }
    let id: number
    if (cb) {
      // if no cb, will send Notification without id
      // if has cb, will send Request with id
      id = this.id++
      req.id = id
    }
    if (params) {
      req.params = params
    }
    if (this.options.jsonrpc) {
      req.jsonrpc = this.options.jsonrpc
    }
    if (cb) {
      this.cache.push({
        id,
        obj: req,
        cb,
      })
    } else {
      this.cache.push({ obj: req })
    }
    this.socket.send()
  }
  private response(obj: any) {
    if (obj == null || obj.id == null) {
      return
    }
    let id = obj.id
    // callback
    let index = 0
    while (index < this.cache.size) {
      let sendingObj: SendingObj = this.cache.get(index)
      if (sendingObj.id === id) {
        if (sendingObj.cb) {
          sendingObj.cb(obj.error, obj.result)
        }
        sendingObj.done = true
        break
      }
      ++index
    }
    // purge done ones
    while (this.cache.size > 0) {
      if (this.cache.first().done) {
        this.cache.shift()
      } else {
        break
      }
    }
  }
  private whenOverflow = (sendingObj: SendingObj) => {
    if (sendingObj.done) {
      return
    }
    if (sendingObj.cb) {
      sendingObj.cb({ code: -32000, message: "Overflow" })
    }
  }
  close() {
    this.socket.close()
  }
}

export class Server {
  // for testing purpose
  private options: Options
  private server: net.Server
  private sockets: net.Socket[] = []
  constructor(private port: number, options?: Options) {
    this.options = mergeOptions(options)
    this.server = net.createServer(socket => {
      this.sockets.push(socket)
      let closed: boolean
      let jsonStream = new JSONStream()
      jsonStream.on("data", (req: any) => {
        if (req == null || closed) {
          return
        }
        let method = this.methods[req.method]
        if (method == null && req.id != null) {
          this.send(socket, {
            id: req.id,
            error: { code: -32601, message: "Method not found" },
          })
          return
        }
        let resp = (error: any, result?: any) => {
          if (closed || req.id == null) {
            return
          }
          if (error) {
            if (typeof error !== "object") {
              error = { data: error }
            }
            if (error.code == null) {
              error.code = -32603
            }
            if (error.message == null) {
              error.message = "Internal error"
            }
            this.send(socket, { id: req.id, error })
            return
          }
          if (result == null) {
            result = null
          }
          this.send(socket, { id: req.id, result })
          return
        }
        try {
          method(req.params, resp)
        } catch (exc) {
          resp({
            data: {
              exc: { code: exc.code, msg: exc.message, stack: exc.stack },
            },
          })
        }
      })
      socket.pipe(jsonStream)
      let onError = () => {
        if (closed) {
          return
        }
        closed = true
        socket.destroy()
        let index = this.sockets.indexOf(socket)
        if (index >= 0) {
          this.sockets.splice(index, 1)
        }
      }
      socket.on("error", onError)
      socket.on("close", onError)
      socket.on("end", onError)
    })
  }
  private methods: { [index: string]: Function } = {}
  register(method: string, cb: (params: any, resp: Response) => void) {
    this.methods[method] = cb
  }
  private send(socket: net.Socket, obj: any) {
    socket.write(JSON.stringify(obj) + "\n")
  }
  start() {
    this.server.listen(this.port, this.options.host)
  }
  close(cb?: Function) {
    this.server.close(cb)
    this.server.unref()
    for (let socket of this.sockets) {
      socket.destroy()
    }
    this.sockets = []
  }
}

export default Client
