"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var test = require("tape");
var _1 = require("../");
var port = 55667;
test("no server", {}, function (t) {
    var client = new _1.Client(port, { retry: false });
    client.request("hello", null, function (error, result) {
        t.deepEqual(error, { code: -32300, message: 'connect failed' });
        t.end();
    });
});
test("simple server client", {}, function (t) {
    var server = new _1.Server(port);
    server.start();
    var client = new _1.Client(port);
    t.test("unknown method", function (t1) {
        client.request("hello", null, function (error, result) {
            t1.deepEqual(error, { code: -32601, message: 'Method not found' });
            t1.end();
        });
    });
    t.test("plus", function (t1) {
        server.register("plus", function (params, resp) {
            resp(null, params[0] + params[1]);
        });
        client.request("plus", [1, 2, 3], function (error, result) {
            t1.notOk(error, "no error");
            t1.equal(result, 3);
            t1.end();
        });
    });
    t.test("plus", function (t1) {
        client.request("plus", null, function (error, result) {
            t1.equal(error.code, -32603);
            t1.end();
        });
    });
    t.test("close", function (t1) {
        client.close();
        server.close(t1.end);
    });
    t.end();
});
test("reconnect", { timeout: 10000 }, function (t) {
    var server = new _1.Server(port);
    server.register("echo", function (params, resp) {
        resp(null, params);
    });
    setTimeout(function () {
        server.start();
    }, 500);
    var client = new _1.Client(port, { connectImmediately: true });
    t.test("not connect immediately", function (t1) {
        client.request("echo", 1, function (error, result) {
            t1.equal(result, 1);
            server.close(t1.end);
        });
    });
    t.test("start server again", function (t1) {
        client.request("echo", 10, function () { });
        client.request("echo", 11);
        server.start();
        client.request("echo", 12, function (error, result) {
            t1.equal(result, 12);
            t1.end();
        });
    });
    t.test("close", function (t1) {
        client.close();
        server.close(t1.end);
    });
    t.end();
});
test("limit", {}, function (t) {
    var server = new _1.Server(port);
    server.register("echo", function (params, resp) {
        resp(null, params);
    });
    var client = new _1.Client(port, {
        connectImmediately: true,
        maxBuffered: 2,
    });
    client.request("echo", 1, function (error, result) {
        t.equal(error.message, "Overflow");
    });
    client.request("echo", 2, function (error, result) {
        t.equal(error.message, "Overflow");
    });
    client.request("echo", 3, function (error, result) {
        t.equal(result, 3);
    });
    client.request("echo", 4, function (error, result) {
        t.equal(result, 4);
        client.close();
        server.close();
    });
    server.start();
    t.plan(4);
});
//# sourceMappingURL=client.js.map