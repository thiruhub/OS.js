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
 * @namespace lib.osjs
 */

/**
 * An object with information about the current environment
 * @property  {String}      [dist=dist]     Which dist to use
 * @property  {Number}      [port=AUTO]     Which port to start on
 * @typedef ServerOptions
 */

/**
 * An object with information about the current environment
 * @property  {api.logger}    LOGGER      The logger instance
 * @property  {String}        DIST        The dist environment name
 * @property  {Object}        CONFIG      The configuration tree
 * @property  {Object}        API         API methods dictionary
 * @property  {Array}         VFS         VFS Transport module list
 * @property  {Object}        AUTH        The Authentication module
 * @property  {Object}        STORAGE     The Storage module
 * @property  {Object}        DIRS        Directories tuple
 * @typedef ServerInstance
 */

const _fs = require('node-fs-extra');
const _path = require('path');
const _osjs = {
  logger: require('./logger.js'),
  auth: require('./auth.js'),
  vfs: require('./vfs.js'),
  utils: require('./utils.js')
};

///////////////////////////////////////////////////////////////////////////////
// GLOBALS
///////////////////////////////////////////////////////////////////////////////

const instance = {
  LOGGER: null,
  PORT: 8000,
  DIST: 'dist',
  LOGLEVEL: -2,
  CONFIG: {},
  API: {},
  VFS: [],
  AUTH: null,
  STORAGE: null,
  DIRS: {
    root: _path.resolve(__dirname + '/../../../../'),
    modules: _path.resolve(__dirname + '/../modules'),
    server: _path.resolve(__dirname + '/../../'),
    packages: _path.resolve(__dirname, '/../../../../src/packages')
  }
};

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

function _importAPI(sourcePath) {
  const methods = require(sourcePath);
  Object.keys(methods).forEach(function(k) {
    instance.API[k] = methods[k];
  });
}

///////////////////////////////////////////////////////////////////////////////
// LOADERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Loads generated configuration file
 */
function loadConfiguration(opts) {
  const path = _path.join(instance.DIRS.server, 'settings.json');

  function _load(resolve, reject) {
    _fs.readFile(path, function(err, file) {
      if ( err ) {
        return reject(err);
      }

      const config = JSON.parse(file);

      instance.CONFIG = config;
      if ( config.http.port ) {
        instance.PORT = config.http.port;
      }

      Object.keys(opts).forEach(function(k) {
        if ( typeof instance[k] !== 'undefined' && typeof opts[k] !== 'undefined' ) {
          instance[k] = opts[k];
        }
      });

      if ( opts.ROOT ) {
        instance.DIRS.root = opts.ROOT;
      }
      instance.DIRS.packages = _path.join(instance.DIRS.root, 'src/packages');
      instance.LOGGER = _osjs.logger.create(instance.CONFIG, instance.LOGLEVEL);

      resolve();
    });
  }

  return new Promise(_load);
}

/**
 * Loads and registers all API methods
 */
function loadAPI() {
  const dirname = _path.join(instance.DIRS.modules, 'api');

  function _load(resolve, reject) {
    _fs.readdir(dirname, function(err, list) {
      if ( err ) {
        return reject(err);
      }

      _osjs.utils.iterate(list, function(filename, index, next) {
        if ( filename.substr(0, 1) !== '.' ) {
          const path = _path.join(dirname, filename);
          instance.LOGGER.lognt(instance.LOGGER.INFO, '+++', '{API}', path.replace(instance.DIRS.root, ''));
          _importAPI(path);
        }
        next();
      }, resolve);
    });
  }

  return new Promise(_load);
}

/**
 * Loads and registers Authentication module(s)
 */
function loadAuth() {
  const name = instance.CONFIG.http.authenticator || 'demo';

  function _load(resolve, reject) {
    const path = _path.join(instance.DIRS.modules, 'auth/' + name + '.js');
    instance.LOGGER.lognt(instance.LOGGER.INFO, '+++', '{Auth}', path.replace(instance.DIRS.root, ''));

    const a = require(path);
    const c = instance.CONFIG.modules.auth[name] || {};
    a.register(instance, c);
    instance.AUTH = a;
    resolve();
  }

  return new Promise(_load);
}

/**
 * Loads and registers Storage module(s)
 */
function loadStorage() {
  const name = instance.CONFIG.http.storage || 'demo';

  function _load(resolve, reject) {
    const path = _path.join(instance.DIRS.modules, 'storage/' + name + '.js');
    instance.LOGGER.lognt(instance.LOGGER.INFO, '+++', '{Storage}', path.replace(instance.DIRS.root, ''));

    const a = require(path);
    const c = instance.CONFIG.modules.storage[name] || {};
    a.register(instance, c);
    instance.STORAGE = a;
    resolve();
  }

  return new Promise(_load);
}

/**
 * Loads and registers VFS module(s)
 */
function loadVFS() {
  const dirname = _path.join(instance.DIRS.modules, 'vfs');

  function _load(resolve, reject) {
    _fs.readdir(dirname, function(err, list) {
      if ( err ) {
        return reject(err);
      }

      _osjs.utils.iterate(list, function(filename, index, next) {
        if ( ['.', '_'].indexOf(filename.substr(0, 1)) === -1 ) {
          const path = _path.join(dirname, filename);
          instance.LOGGER.lognt(instance.LOGGER.INFO, '+++', '{VFS}', path.replace(instance.DIRS.root, ''));
          instance.VFS.push(require(path));
        }
        next();
      }, resolve);
    });
  }

  return new Promise(_load);
}

/**
 * Loads generated package manifest
 */
function registerPackages(server) {
  const path = _path.join(instance.DIRS.server, 'packages.json');
  instance.LOGGER.lognt(instance.LOGGER.INFO, '+++', '{Configuration}', path.replace(instance.DIRS.root, ''));

  function _load(resolve, reject) {
    _fs.readFile(path, function(err, file) {
      if ( err ) {
        return reject(err);
      }

      const manifest = JSON.parse(file);
      const packages = manifest[instance.DIST];

      Object.keys(packages).forEach(function(path) {
        const check = _path.join(instance.DIRS.packages, path, 'api.js');
        if ( _fs.existsSync(check) ) {
          instance.LOGGER.lognt(instance.LOGGER.INFO, '+++', '{ApplicationAPI}', check.replace(instance.DIRS.root, ''));
          const module = require(check);

          var deprecated = false;
          if ( typeof module.register === 'function' ) {
            module.register(instance, packages[path]);
          } else if ( typeof module._onServerStart === 'function' ) {
            deprecated = true;

            // Backward compatible with old API
            module._onServerStart(server, {
              request: null,
              response: null,
              config: instance.CONFIG,
              handler: null,
              logger: instance.LOGGER
            }, packages[path]);
          }

          if ( typeof module.api === 'undefined' ) {
            deprecated = true;
          }

          if ( deprecated ) {
            instance.LOGGER.lognt(instance.LOGGER.WARNING, instance.LOGGER.colored('THIS PACKAGE IS USING THE DEPRECATED APPLICATION API', 'yellow'));
          }
        }
      });

      resolve();
    });
  }

  return new Promise(_load);
}

///////////////////////////////////////////////////////////////////////////////
// REQUESTS
///////////////////////////////////////////////////////////////////////////////

function request(http) {
  // We use JSON as default responses, no matter what
  function _rejectResponse(err) {
    instance.LOGGER.log(instance.LOGGER.ERROR, instance.LOGGER.colored(err, 'red'), err.stack || '<no stack trace>');

    http.respond.json({
      error: String(err),
      result: false
    }, 500);
  }
  function _resolveResponse(result) {
    http.respond.json({
      error: null,
      result: result
    });
  }

  // Wrapper for checking permissions
  function _checkPermission(type, options) {
    return new Promise(function(resolve, reject) {
      if ( type === 'api' && options.method === 'login' ) {
        resolve();
      } else {
        _osjs.auth.checkSession(instance, http).then(function() {
          resolve();
        }).catch(_rejectResponse);
      }
    }).then(function() {
      return new Promise(function(resolve, reject) {
        _osjs.auth.checkPermission(instance, http, type, options).then(function() {
          resolve();
        }).catch(_rejectResponse);
      });
    }).catch(_rejectResponse);
  }

  // Wrappers for performing API calls
  function _vfsCall() {
    _checkPermission('vfs', {method: http.endpoint.replace(/(^get\/)?/, ''), args: http.data}).then(function() {
      (new Promise(function(resolve, reject) {
        _osjs.vfs.request(instance, http, resolve, reject);
      })).then(_resolveResponse).catch(_rejectResponse);
    }).catch(_rejectResponse);
  }

  function _apiCall() {
    _checkPermission('api', {method: http.endpoint}, http.data).then(function() {
      (new Promise(function(resolve, reject) {
        instance.API[http.endpoint](instance, http, resolve, reject);
      })).then(_resolveResponse).catch(_rejectResponse);
    }).catch(_rejectResponse);
  }

  function _staticResponse() {
    function _serve() {
      const path = _path.join(instance.DIRS.root, instance.DIST, http.path);
      http.respond.file(path);
    }

    function _deny() {
      http.respond.error('Access denied', 403);
    }

    const pmatch = http.path.match(/^\/?packages\/(.*\/.*)\/(.*)/);
    if ( pmatch && pmatch.length === 3 ) {
      _checkPermission('package', {path: pmatch[1]}).then(function() {
        _osjs.auth.checkSession(instance, http)
          .then(_serve).catch(_deny);
      }).catch(_deny);
    } else {
      _serve();
    }
  }

  // Take on the HTTP request
  _osjs.auth.initSession(instance, http).then(function() {
    if ( http.request.method === 'GET' ) {
      if ( http.isfs ) {
        _vfsCall();
      } else {
        _staticResponse();
      }
    } else {
      if ( http.isfs ) {
        _vfsCall();
      } else {
        if ( typeof instance.API[http.endpoint] === 'function' ) {
          _apiCall();
        } else {
          http.respond.json({
            error: 'No such API method'
          }, 500);
        }
      }
    }
  });

}

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

/**
 * Performs a server request
 *
 * @param   {ServerRequest} http          OS.js Server Request
 *
 * @function request
 * @memberof lib.osjs
 */
module.exports.request = request;

/**
 * Destroys the current instance
 *
 * @param   {ServerRequest} http          OS.js Server Request
 *
 * @function destroy
 * @memberof lib.osjs
 */
module.exports.destroy = function destroy() {
  if ( instance.AUTH ) {
    instance.AUTH.destroy();
  }
};

/**
 * Initializes OS.js Server
 *
 * @param   {ServerOptions}   opts           Server Options
 * @param   {Function}        start          Callback to start the server
 *
 * @function init
 * @memberof lib.osjs
 */
module.exports.init = function start(opts, start) {
  function startup() {
    start(Object.freeze(instance))
      .then(function(result) {
        registerPackages(result.httpServer).then(result.start);
      });
  }

  loadConfiguration(opts)
    .then(loadAPI)
    .then(loadAuth)
    .then(loadStorage)
    .then(loadVFS)
    .then(startup);
};

