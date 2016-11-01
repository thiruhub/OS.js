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
 * Handles user login attempts
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {Function}         resolve       Resolve the promise
 * @param   {Function}         reject        Reject the promise
 */
module.exports.login = function(instance, http, resolve, reject) {
  const groups = ['admin'];

  http.session.set('username', 'demo');
  http.session.set('groups', JSON.stringify(groups));

  resolve({
    id: 0,
    username: 'Username',
    name: 'Full User Name',
    groups: groups
  });
};

/**
 * Handles user logout attempts
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {Function}         resolve       Resolve the promise
 * @param   {Function}         reject        Reject the promise
 */
module.exports.logout = function(instance, http, resolve, reject) {
  resolve(true);
};

/**
 * Handler user management
 *
 * http.data.commands = [list, add, remove, edit, passwd]
 * http.data.args = arguments
 * http.data.args.user = username
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {Function}         resolve       Resolve the promise
 * @param   {Function}         reject        Reject the promise
 */
module.exports.manage = function(instance, http, resolve, reject) {
  reject('Not available');
};

/**
 * Runs when a HTTP request is made
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {Function}         resolve       Resolve the promise
 * @param   {Function}         reject        Reject the promise
 */
module.exports.initSession = function(instance, http, resolve, reject) {
  resolve(true);
};

/**
 * Checks the given permission
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {Function}         resolve       Resolve the promise
 * @param   {Function}         reject        Reject the promise
 * @param   {String}           type          Permission type (vfs, api, package)
 * @param   {Object}           options       Permission options/arguments
 */
module.exports.checkPermission = function(instance, http, resolve, reject, type, options) {
  resolve(true);
};

/**
 * Checks if a session is available
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {ServerRequest}    http          OS.js Server Request
 * @param   {Function}         resolve       Resolve the promise
 * @param   {Function}         reject        Reject the promise
 */
module.exports.checkSession = function(instance, http, resolve, reject) {
  if ( http.session.get('username') ) {
    resolve();
  } else {
    reject('You have no OS.js Session, please log in!');
  }
};

/**
 * When module is registered upon initialization
 *
 * @param   {ServerInstance}   instance      OS.js instance
 * @param   {Object}           config        Configuration for given auth module
 */
module.exports.register = function(instance, config) {
};

/**
 * When module is destroyed upon shutdown
 */
module.exports.destroy = function() {
};
