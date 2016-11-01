/*!
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2016, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 'AS IS' AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

// TODO: Secure VFS paths in filesystem (resolve and match)
// TODO: Add string-loglevel support in logger
// TODO: Make sure same HTTP error codes are sent as in old codebase
// TODO: Go over all initialization and events and add proper logging
// FIXME: Logger is not respecting level from config or init-script ?

/**
 * @namespace server
 */

/**
 * An object with session helpers
 * @property  {String}    id      Session ID
 * @property  {Function}  set     Sets a session variable
 * @property  {Function}  get     Gets a sesion variable
 * @typedef ServerSession
 */

/**
 * An object filled with data regarding the Server request. Also allows you to use a responder to
 * interrupt the normal procedures.
 * @property  {Request}           request     HTTP Request object
 * @property  {Response}          response    HTTP Response object
 * @property  {String}            path        HTTP Request path name (url)
 * @property  {String}            endpoint    Endpoint parsed from path name (url)
 * @property  {Object}            data        POST data (JSON)
 * @property  {Object}            files       POST files (uploads)
 * @property  {Boolean}           isfs        If this is a filesystem operation
 * @property  {ServerSession}     session     HTTP Session
 * @property  {ServerResponder}   respond     Responder object
 * @typedef ServerRequest
 */

/**
 * Sends a response directly to the connection
 *
 * @property  {Function}    raw     Respond with raw data
 * @property  {Function}    error   Respond with a error
 * @property  {Function}    file    Respond with a file
 * @property  {Function}    stream  Respond with a stream
 * @property  {Function}    json    Respond with JSON
 * @typedef ServerResponder
 */

const _instance = require('./lib/instance.js');
const _vfs = require('./lib/vfs.js');
const _url = require('url');
const _fs = require('node-fs-extra');
const _session = require('simple-session');
const _formidable = require('formidable');
const _minimist = require('minimist');

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Checks given request path and figures out if this is a configured proxy
 * address. If it was found, the normal server procedure is interrupted and
 * will perform a proxy request.
 */
function proxyCall(instance, proxy, request, response) {
  const logger = instance.LOGGER;

  function _getMatcher(k) {
    var matcher = k;

    const isRegexp = k.match(/^regexp\/(.*)\/([a-z]+)?$/);
    if ( isRegexp && isRegexp.length === 3 ) {
      matcher = new RegExp(isRegexp[1], isRegexp[2] || '');
    } else {
      matcher = '/' + matcher.replace(/^\//, '');
    }

    return matcher;
  }

  function _getOptions(durl, matcher, pots) {
    if ( typeof pots === 'string' ) {
      if ( typeof matcher === 'string' ) {
        request.url = durl.substr(matcher.length) || '/';
      } else {
        request.url = durl.replace(matcher, '') || '/';
      }
      pots = {target: pots};
    }
    return pots;
  }

  function isStringMatch(m, u) {
    const rm = m.replace(/^\//, '').replace(/\/$/, '');
    const um = u.replace(/^\//, '').replace(/\/$/, '');
    return rm === um;
  }

  const proxies = instance.CONFIG.proxies;
  if ( proxy && proxies ) {
    return !Object.keys(proxies).every(function(k) {
      const matcher = _getMatcher(k);
      if ( typeof matcher === 'string' ? isStringMatch(matcher, request.url) : matcher.test(request.url) ) {
        const pots = _getOptions(request.url, matcher, proxies[k]);

        logger.log(logger.INFO, logger.colored('<<<', 'bold'), request.url);
        logger.log(logger.INFO, logger.colored('>>>', 'grey', 'bold'), logger.colored(('PROXY ' + k + ' => ' + pots.target), 'yellow'));

        proxy.web(request, response, pots);

        return false;
      }

      return true;
    });
  }

  return false;
}

/**
 * Creates a `ServerResponder` object for HTTP connections.
 * This allows you to respond with data in a certain format.
 */
function createHttpResponder(instance, response) {
  function _raw(data, code, headers) {
    code = code || 200;
    headers = headers || {};

    response.writeHead(code, headers);
    response.write(data)
    response.end();
  }

  function _error(message, code) {
    code = code || 500;

    _raw(String(message), code);
  }

  function _stream(path, stream, code, mime) {
    if ( !mime ) {
      mime = _vfs.getMime(instance, path);
    }

    stream.on('end', function() {
      response.end();
    });

    response.writeHead(code || 200, {
      'Content-Type': mime
    });

    stream.pipe(response);
  }

  return {
    error: _error,
    raw: _raw,

    json: function(data, code) {
      if ( typeof data !== 'string' ) {
        data = JSON.stringify(data);
      }

      _raw(data, 200, {
        'Content-Type': 'application/json'
      });
    },

    stream: _stream,

    file: function(path, options, code) {
      options = options || {};

      _fs.exists(path, function(exists) {
        if ( !exists ) {
          _error('File not found', 404);
        } else {
          const stream = _fs.createReadStream(path, {
            bufferSize: 64 * 1024
          });
          _stream(path, stream, code);
        }
      });
    }
  };
}

/**
 * Creates a `ServerResponder` object for WebSocket connections.
 * This allows you to respond with data in a certain format.
 */
function createWebsocketResponder(ws, index) {
  function _json(message) {
    if ( typeof message === 'object' ) {
      message._index = index;
    }
    ws.send(JSON.stringify(message))
  }

  return {
    raw: function(data) {
      ws.send(data);
    },

    stream: function() {
      _json({error: 'Not available'});
    },

    file: function() {
      _json({error: 'Not available'});
    },

    json: function(data) {
      _json(data);
    },

    error: function(error) {
      _json({error: error});
    }
  };
}

/**
 * Creates the `ServerRequest` object passed around.
 */
function createHttpObject(request, response, path, data, responder, session_id, files) {
  return {
    request: request,
    response: request,
    path: path,
    data: data || {},
    files: files || {},
    isfs: path.match(/^\/FS/) !== null,
    endpoint: path.replace(/^\/(FS|API)\/?/, ''),
    respond: responder,
    session: {
      id: session_id,
      set: function(k, v) {
        return _session.set(session_id, k, v === null ? null : String(v));
      },
      get: function(k) {
        const v = _session.get(session_id, k);
        return v !== false ? v[0] : false;
      }
    }
  };
}

///////////////////////////////////////////////////////////////////////////////
// MAIN
///////////////////////////////////////////////////////////////////////////////

/**
 * Create a new OS.js server instance
 */

const argv = _minimist(process.argv.slice(2));
const opts = {
  DIST: argv._[0],
  ROOT: argv.r || argv.root,
  PORT: argv.p || argv.port,
  LOGLEVEL: argv.l || argv.loglevel
};

_instance.init(opts, function(instance) {
  'use strict';

  const httpConfig = instance.CONFIG.http || {};
  const logger = instance.LOGGER;

  var httpServer = null;
  var websocketServer = null;
  var proxyServer = null;

  function onRequest(request, response) {
    const rurl = request.url === '/' ? '/index.html' : request.url;
    const url = _url.parse(rurl, true);
    const path = decodeURIComponent(url.pathname);
    const session_id = _session.init(request, response);
    const contentType = request.headers['content-type'] || '';

    logger.log(logger.VERBOSE, logger.colored('<<<', 'bold'), request.method, path);

    if ( proxyCall(instance, proxyServer, request, response) ) {
      return;
    }

    const respond = createHttpResponder(instance, response);
    if ( request.method === 'POST' ) {
      if ( contentType.indexOf('application/json') !== -1 ) {
        var body = [];
        request.on('data', function(data) {
          body.push(data);
        });

        request.on('end', function() {
          const data = JSON.parse(Buffer.concat(body));
          _instance.request(createHttpObject(request, response, path, data, respond, session_id));
        });
      } else if ( contentType.indexOf('multipart/form-data') !== -1 ) {
        const form = new _formidable.IncomingForm({
          uploadDir: instance.CONFIG.tmpdir
        });

        form.parse(request, function(err, fields, files) {
          _instance.request(createHttpObject(request, response, path, fields, respond, session_id, files));
        });
      }
    } else {
      _instance.request(createHttpObject(request, response, path, {}, respond, session_id));
    }
  }

  // Proxy servers
  try {
    proxyServer = require('http-proxy').createProxyServer({});
    proxyServer.on('error', function(err) {
      console.warn(err);
    });
  } catch ( e ) {}

  // HTTP servers
  if ( httpConfig.mode === 'http2' || httpConfig.mode === 'https' ) {
    const rdir = httpConfig.cert.path || _path.dirname(setup.dirname);
    const cname = httpConfig.cert.name || 'localhost';
    const copts = httpConfig.cert.options || {};

    copts.key = _fs.readFileSync(_path.join(rdir, cname + '.key'));
    copts.cert = _fs.readFileSync(_path.join(rdir, cname + '.crt'));

    httpServer = require(httpConfig.mode).createServer(copts, onRequest);
  } else {
    httpServer = require('http').createServer(onRequest);
  }

  // Websocket servers
  if ( httpConfig.connection === 'ws' ) {
    websocketServer = new (require('ws')).Server({server: httpServer});
    websocketServer.on('connection', function(ws) {
      ws.on('message', function(data) {
        const message = JSON.parse(data);
        const path = message.path;
        const respond = createWebsocketResponder(ws, message._index);

        _instance.request(createHttpObject({
          method: 'POST',
          url: path
        }, null, path, message.args, respond, message.sid));
      });

      ws.on('close', function() {
      });
    });
  }

  // Run
  process.on('exit', function() {
    if ( httpServer ) {
      httpServer.close();
    }

    if ( proxyServer ) {
      proxyServer.close();
    }

    if ( websocketServer ) {
      websocketServer.close();
    }

    _instance.destroy();
  });

  process.on('uncaughtException', function(error) {
    console.log('UNCAUGHT EXCEPTION', error, error.stack);
  });

  return new Promise(function(resolve, reject) {
    resolve({
      httpServer: httpServer,
      websocketServer: websocketServer,
      proxyServer: proxyServer,
      start: function() {
        logger.lognt(logger.INFO, logger.colored(['Starting OS.js HTTP server on port', instance.PORT, 'in', instance.DIST].join(' '), 'green'));
        httpServer.listen(instance.PORT);
      }
    });
  });
});
