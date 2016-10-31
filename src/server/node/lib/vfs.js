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

/**
 * @namespace lib.vfs
 */

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

function findTransport(instance, method, args) {
  var transportName = '__default__';

  const writeableMap = ['upload', 'write', 'delete', 'copy', 'move', 'mkdir'];
  const argumentMap = {
    _default: function(args, dest) {
      return args.path;
    },
    freeSpace: function(args) {
      return args.root;
    },
    move: function(args, dest) {
      return dest ? args.dest : args.src;
    },
    copy: function(args, dest) {
      return dest ? args.dest : args.src;
    }
  };

  const mountpoints = instance.CONFIG.vfs.mounts || {};
  const query = (argumentMap[method] || argumentMap._default )(args);
  const parts = query.split(/(.*)\:\/\/(.*)/);
  const parsed = {
    query: query,
    protocol: parts[1],
    path: String(parts[2]).replace(/^\/+?/, '/')
  };

  const mount = mountpoints[parsed.protocol];
  if ( typeof mount === 'object' ) {
    if ( typeof mount.transport === 'string' ) {
      transportName = mount.transport;
    }

    if ( mount.enabled === false || (mount.ro === true && writeableMap.indexOf(method) !== -1) ) {
      return false;
    }
  }

  return Object.freeze({
    parsed: Object.freeze(parsed),
    transport: instance.VFS.find(function(module) {
      return module.name === transportName;
    })
  });
}

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

/**
 * Performs a VFS request
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {Function}         resolve       Resolves the Promise
 * @param   {Function}         reject        Rejects the Promise
 * @param   {Object}           args          API Call Arguments
 *
 * @function request
 * @memberof lib.vfs
 */
module.exports.request = function(instance, http, resolve, reject) {
  const data = (http.request && http.request.method) === 'GET' ? {path: http.endpoint.replace(/(^get\/)?/, '')} : http.data;
  const fn = http.request.method === 'GET' ? 'read' : http.endpoint;
  const found = findTransport(instance, fn, data);

  if ( found === false ) {
    return reject('Operation denied!');
  } else if ( !found.transport ) {
    return reject('Cannot find VFS module for: ' + found.parsed.query);
  }

  found.transport.request(instance, http, {
    query: found.parsed.query,
    method: fn,
    data: data
  }, resolve, reject)
};

/**
 * Creates a new Readable stream
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {String}           path          Virtual path
 *
 * @return  {Promise}
 *
 * @function createReadStream
 * @memberof lib.vfs
 */
module.exports.createReadStream = function(instance, http, path) {
  const found = findTransport(instance, 'read', {path: path});
  return found.transport.createReadStream(instance, http, path);
};

/**
 * Creates a new Writeable stream
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {String}           path          Virtual path
 *
 * @return  {Promise}
 *
 * @function createWriteStream
 * @memberof lib.vfs
 */
module.exports.createWriteStream = function(instance, http, path) {
  const found = findTransport(instance, 'read', {path: path});
  return found.transport.createWriteStream(instance, http, path);
};

/**
 * Gets file MIME type
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {String}           iter          The filename or path
 *
 * @return {String}
 * @function getMime
 * @memberof lib.vfs
 */
module.exports.getMime = function getMime(instance, iter) {
  const dotindex = iter.lastIndexOf('.');
  const ext = (dotindex === -1) ? null : iter.substr(dotindex);
  return instance.CONFIG.mimes[ext || 'default'];
};

/**
 * Performs a VFS request (for internal usage). This does not make any actual HTTP responses.
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {String}           method        API Call Name
 * @param   {Object}           args          API Call Arguments
 *
 * @return  {Promise}
 *
 * @function _request
 * @memberof lib.vfs
 */
module.exports._request = function(instance, http, method, args) {
  return new Promise(function(resolve, reject) {
    function _nullResponder(arg) {
      resolve(arg);
    }

    var newHttp = Object.assign({}, http);
    newHttp.endpoint = method;
    newHttp.data = args;
    newHttp.request.method = 'POST';
    newHttp.respond = {
      raw: _nullResponder,
      error: _nullResponder,
      file: _nullResponder,
      stream: _nullResponder,
      json: _nullResponder
    };

    module.exports.request(instance, newHttp, resolve, reject);
  });
};
