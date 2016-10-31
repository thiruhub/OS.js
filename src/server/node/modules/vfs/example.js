const _fs = require('node-fs-extra');
const _nfs = require('fs');
const _path = require('path');
const _formidable = require('formidable');
const _fstream = require('fstream');

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Create a read stream
 */
function createReadStream(instance, http, path) {
  return new Promise(function(resolve, reject) {
    resolve(_fstream.Reader(null));
  });
}

/**
 * Create a write stream
 */
function createWriteStream(instance, http, path) {
  return new Promise(function(resolve, reject) {
    resolve(_fstream.Writer(null));
  });
}

///////////////////////////////////////////////////////////////////////////////
// VFS METHODS
///////////////////////////////////////////////////////////////////////////////

var VFS = {

  read: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  upload: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  write: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  delete: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  copy: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  move: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  mkdir: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  find: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  fileinfo: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  scandir: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  },

  freeSpace: function(instance, http, args, resolve, reject) {
    reject('Not implemented');
  }
};

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports.request = function(instance, http, req, resolve, reject) {
  if ( typeof VFS[req.method] === 'function' ) {
    VFS[req.method](instance, http, req.data, resolve, reject);
  } else {
    reject('No such VFS method');
  }
};

module.exports.createReadStream = createReadStream;
module.exports.createWriteStream = createWriteStream;
module.exports.name = 'EXAMPLE';

