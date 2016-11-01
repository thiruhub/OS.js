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
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
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

(function(API, Utils) {
  'use strict';

  /**
   * Attaches options to a XHR call
   */
  function appendRequestOptions(data, options) {
    options = options || {};

    var onprogress = options.onprogress || function() {};
    var ignore = ['onsuccess', 'onerror', 'onprogress', 'oncanceled'];

    Object.keys(options).forEach(function(key) {
      if ( ignore.indexOf(key) === -1 ) {
        data[key] = options[key];
      }
    });

    data.onprogress = function(ev) {
      if ( ev.lengthComputable ) {
        onprogress(ev, ev.loaded / ev.total);
      } else {
        onprogress(ev, -1);
      }
    };

    return data;
  }

  /**
   * Default Handler Connection Implementation
   *
   * <pre><b>
   * You only have access to this via the 'Handler' instance
   * </b></pre>
   *
   * @summary Wrappers for communicating over HTTP, WS and NW
   *
   * @constructor Connection
   * @memberof OSjs.Core
   */
  function Connection(handler) {
    this.index = 0;
    this.handler = handler;
    this.nw = null;
    this.ws = null;

    if ( (API.getConfig('Connection.Type') === 'nw') ) {
      this.nw = require('osjs').init({
        root: process.cwd(),
        settings: {
          mimes: API.getConfig('MIME.mapping')
        },
        nw: true
      });
    }

    this.wsqueue = {};
  }

  /**
   * Initializes the instance
   *
   * @function init
   * @memberof OSjs.Core.Connection#
   */
  Connection.prototype.init = function(callback) {
    var self = this;

    if ( API.getConfig('Connection.Type') === 'ws' ) {
      var url = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
      var connected = false;

      console.info('Using WebSocket', url);

      this.ws = new WebSocket(url);

      this.ws.onopen = function() {
        connected = true;

        callback();
      };

      this.ws.onmessage = function(ev) {
        var data = JSON.parse(ev.data);
        var idx = data._index;

        if ( self.wsqueue[idx] ) {
          delete data._index;

          self.wsqueue[idx](data);

          delete self.wsqueue[idx];
        }
      };

      this.ws.onclose = function(ev) {
        if ( !connected && ev.code !== 3001 ) {
          callback('WebSocket connection error'); // FIXME: Locale
        }
      };

    } else {
      callback();
    }
  };

  /**
   * Destroys the instance
   *
   * @function destroy
   * @memberof OSjs.Core.Connection#
   */
  Connection.prototype.destroy = function() {
    if ( this.ws ) {
      this.ws.close();
    }

    this.nw = null;
    this.ws = null;
    this._wsRequest = {};
  };

  /**
   * Makes a HTTP POST call
   *
   * @function callPOST
   * @memberof OSjs.Core.Connection#
   *
   * @return {Boolean}
   */
  Connection.prototype.callPOST = function(form, options, onsuccess, onerror) {
    onerror = onerror || function() {
      console.warn('Connection::callPOST()', 'error', arguments);
    };

    Utils.ajax(appendRequestOptions({
      url: OSjs.VFS.Transports.Internal.path(),
      method: 'POST',
      body: form,
      onsuccess: function(result) {
        onsuccess(false, result);
      },
      onerror: function(result) {
        onerror('error', null, result);
      },
      oncanceled: function(evt) {
        onerror('canceled', null, evt);
      }
    }, options));

    return true;
  };

  /**
   * Makes a HTTP GET call
   *
   * @function callGET
   * @memberof OSjs.Core.Connection#
   *
   * @return {Boolean}
   */
  Connection.prototype.callGET = function(args, options, onsuccess, onerror) {
    onerror = onerror || function() {
      console.warn('Connection::callGET()', 'error', arguments);
    };

    var self = this;

    Utils.ajax(appendRequestOptions({
      url: args.url || OSjs.VFS.Transports.Internal.path(args.path),
      method: args.method || 'GET',
      responseType: 'arraybuffer',
      onsuccess: function(response, xhr) {
        if ( !xhr || xhr.status === 404 || xhr.status === 500 ) {
          onsuccess({error: xhr.statusText || response, result: null});
          return;
        }
        onsuccess({error: false, result: response});
      },
      onerror: function() {
        onerror.apply(self, arguments);
      }
    }, options));

    return true;
  };

  /**
   * Makes a HTTP XHR call
   *
   * @function callXHR
   * @memberof OSjs.Core.Connection#
   *
   * @return {Boolean}
   */
  Connection.prototype.callXHR = function(url, args, options, onsuccess, onerror) {
    onerror = onerror || function() {
      console.warn('Connection::callXHR()', 'error', arguments);
    };

    var self = this;

    Utils.ajax(appendRequestOptions({
      url: url,
      method: 'POST',
      json: true,
      body: args,
      onsuccess: function(/*response, request, url*/) {
        onsuccess.apply(self.handler, arguments);
      },
      onerror: function(/*error, response, request, url*/) {
        onerror.apply(self.handler, arguments);
      }
    }, options));

    return true;
  };

  /**
   * Makes a WebSocket call
   *
   * @function callWS
   * @memberof OSjs.Core.Connection#
   *
   * @return {Boolean}
   */
  Connection.prototype.callWS = function(path, args, options, onsuccess, onerror) {
    onerror = onerror || function() {
      console.warn('Connection::callWS()', 'error', arguments);
    };

    var idx = this.index++;

    try {
      this.ws.send(JSON.stringify({
        _index: idx,
        sid: Utils.getCookie('session'),
        path: '/' + path,
        args: args
      }));

      this.wsqueue[idx] = onsuccess || function() {};

      return true;
    } catch ( e ) {
      console.warn('callWS() Warning', e.stack, e);
      onerror(e);
    }

    return false;
  };

  /**
   * Makes a Node NW call
   *
   * @function callNW
   * @memberof OSjs.Core.Connection#
   *
   * @return {Boolean}
   */
  Connection.prototype.callNW = function(method, args, options, onsuccess, onerror) {
    onerror = onerror || function() {
      console.warn('Connection::callNW()', 'error', arguments);
    };

    try {
      this.nw.request(method.match(/^FS\:/) !== null, method.replace(/^FS\:/, ''), args, function(err, res) {
        onsuccess({error: err, result: res});
      });

      return true;
    } catch ( e ) {
      console.warn('callNW() Warning', e.stack, e);
      onerror(e);
    }

    return false;
  };

  /**
   * Wrapper for OS.js API calls
   *
   * @function request
   * @memberof OSjs.Core.Connection#
   *
   * @return {Boolean}
   */
  Connection.prototype.request = function(isVfs, method, args, options, onsuccess, onerror) {

    // Proxy all requests to NW module if required
    if ( API.getConfig('Connection.Type') === 'nw' ) {
      return this.callNW(method, args, options, onsuccess, onerror);
    }

    // Some methods can only be handled via HTTP
    if ( isVfs ) {
      if ( method === 'FS:get' ) {
        return this.callGET(args, options, onsuccess, onerror);
      } else if ( method === 'FS:upload' ) {
        return this.callPOST(args, options, onsuccess, onerror);
      }
    }

    // Use AJAX or WebSocket for everything else
    var url = (function() {
      if ( isVfs ) {
        return API.getConfig('Connection.FSURI') + '/' + method.replace(/^FS\:/, '');
      }
      return API.getConfig('Connection.APIURI') + '/' + method;
    })();

    if ( API.getConfig('Connection.Type') === 'ws' ) {
      return this.callWS(url, args, options, onsuccess, onerror);
    }

    return this.callXHR(url, args, options, onsuccess, onerror);
  };

  /////////////////////////////////////////////////////////////////////////////
  // EXPORTS
  /////////////////////////////////////////////////////////////////////////////

  OSjs.Core.Connection = Connection;

})(OSjs.API, OSjs.Utils);

