import * as test from "tape"

import {Client, Server} from "../"
const port = 55667

test("no server", {},  (t) => {
  let client = new Client(port, {retry: false})
  client.request("hello", null, (error, result) => {
    t.deepEqual(error, { code: -32300, message: 'connect failed' })
    t.end()
  })
})

test("simple server client", {},  (t) => {
  let server = new Server(port, {host: '127.0.0.1'})
  server.start()
  let client = new Client(port)
  t.test("unknown method", (t1) => {
    client.request("hello", null, (error, result) => {
      t1.deepEqual(error, { code: -32601, message: 'Method not found' })
      t1.end()
    })
  })
  t.test("plus", (t1) => {
    server.register("plus", (params, resp) => {
      resp(null, params[0] + params[1])
    })
    client.request("plus", [1, 2, 3], (error, result) => {
      t1.notOk(error, "no error")
      t1.equal(result, 3)
      t1.end()
    })
  })
  t.test("plus", (t1) => {
    client.request("plus", null, (error, result) => {
      t1.equal(error.code, -32603)
      t1.end()
    })
  })
  t.test("close", (t1) => {
    client.close()
    server.close(t1.end)
  })
  t.end()
})

test("reconnect", { timeout: 10000 }, (t) => {
  let server = new Server(port)
  server.register("echo", (params, resp) => {
    resp(null, params)
  })
  setTimeout(() => {
    server.start()
  }, 500)
  let client = new Client(port, { connectImmediately: true })
  t.test("not connect immediately", (t1) => {
    client.request("echo", 1, (error, result) => {
      t1.equal(result, 1)
      server.close(t1.end)
    })
  })
  t.test("start server again", (t1) => {
    client.request("echo", 10, () => { })
    client.request("echo", 11)
    server.start()
    client.request("echo", 12, (error, result) => {
      t1.equal(result, 12)
      t1.end()
    })
  })
  t.test("close", (t1) => {
    client.close()
    server.close(t1.end)
  })
  t.end()
})

test("limit", {}, (t) => {
  let server = new Server(port)
  server.register("echo", (params, resp) => {
    resp(null, params)
  })
  let client = new Client(port, {
    connectImmediately: true,
    maxBuffered: 2,
  })
  client.request("echo", 1, (error, result) => {
    t.equal(error.message, "Overflow")
  })
  client.request("echo", 2, (error, result) => {
    t.equal(error.message, "Overflow")
  })
  client.request("echo", 3, (error, result) => {
    t.equal(result, 3)
  })
  client.request("echo", 4, (error, result) => {
    t.equal(result, 4)
    client.close()
    server.close()
  })
  server.start()
  t.plan(4)
})
