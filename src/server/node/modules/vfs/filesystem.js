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
const _fs = require('node-fs-extra');
const _nfs = require('fs');
const _path = require('path');
const _fstream = require('fstream');

const _osjsutils = require('./../../lib/utils.js');
const _osjsvfs = require('./../../lib/vfs.js');

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a OS.js request path to a real filesystem path
 */
function resolveRequestPath(instance, http, query) {
  const parts = query.split(/(.*)\:\/\/(.*)/);
  const protocol = parts[1];
  const path = String(parts[2]).replace(/^\/+?/, '');
  const mountpoints = instance.CONFIG.vfs.mounts || {};

  // Figure out if this mountpoint is a filesystem path, or another transport
  var found = mountpoints[protocol] || mountpoints['*'];
  var real = null;

  if ( typeof found === 'object' ) {
    found = found.destination;
  }

  if ( typeof found === 'string' ) {
    const rmap = {
      '%DIST%': function() {
        return instance.DIST;
      },
      '%UID%': function() {
        return http.session.get('username');
      },
      '%USERNAME%': function() {
        return http.session.get('username');
      },
      '%DROOT%': function() {
        return instance.DIRS.root;
      },
      '%MOUNTPOINT%': function() {
        return protocol;
      }
    };

    Object.keys(rmap).forEach(function(k) {
      found = found.replace(new RegExp(k, 'g'), rmap[k]());
    });

    real = _path.join(found, path);
  }

  // TODO SECURE!!!

  return {
    query: query,
    protocol: protocol,
    path: path,
    real: real
  };
}

/**
 * Create a read stream
 */
function createReadStream(instance, http, path) {
  const resolved = resolveRequestPath(instance, http, path);
  return new Promise(function(resolve, reject) {
    /*eslint new-cap: "off"*/
    resolve(_fstream.Reader(resolved.real, {
      bufferSize: 64 * 1024
    }));
  });
}

/**
 * Create a write stream
 */
function createWriteStream(instance, http, path) {
  const resolved = resolveRequestPath(instance, http, path);
  return new Promise(function(resolve, reject) {
    /*eslint new-cap: "off"*/
    resolve(_fstream.Writer(resolved.real));
  });
}

/**
 * Reads EXIF data
 */
function readExif(path, mime) {
  var _read = function defaultRead(resolve, reject) {
    resolve(null);
  };

  if ( mime.match(/^image/) ) {
    try {
      _read = function exifRead(resolve, reject) {
        /*eslint no-new: "off"*/
        new require('exif').ExifImage({image: path}, function(err, result) {
          if ( err ) {
            reject(err);
          } else {
            resolve(JSON.stringify(result, null, 4));
          }
        });
      };
    } catch ( e ) {}
  }

  return new Promise(_read);
}

/**
 * Creates file information in a format OS.js understands
 */
function createFileIter(instance, query, real, iter, stat) {
  if ( !stat ) {
    try {
      stat = _fs.statSync(real);
    } catch ( e ) {
      stat = {
        isFile: function() {
          return true
        }
      };
    }
  }

  var mime = '';
  const type = stat.isFile() ? 'file' : 'dir';

  if ( type === 'file' ) {
    mime = _osjsvfs.getMime(instance, iter);
  }

  const perm = _osjsutils.permissionToString(stat.mode);

  return {
    filename: iter,
    path: query + iter.replace(/^\/?/, '/'),
    size: stat.size || 0,
    mime: mime,
    type: type,
    permissions: perm,
    ctime: stat.ctime || null,
    mtime: stat.mtime || null
  };
}

/**
 * Check if given file exists or not
 */
function existsWrapper(checkFound, real, resolve, reject) {
  _fs.exists(real, function(exists) {
    if ( checkFound ) {
      if ( exists ) {
        reject('File or directory already exist.');
      } else {
        resolve(true);
      }
    } else {
      if ( exists ) {
        resolve(true);
      } else {
        reject('No such file or directory'); // TODO 404 ?
      }
    }
  });
}

/**
 * Reads a directory and returns in a format OS.js understands
 */
function readDir(instance, query, real, filter) {
  filter = filter || function(iter) {
    return ['.', '..'].indexOf(iter) === -1;
  };

  return new Promise(function(resolve, reject) {
    _fs.readdir(real, function(err, list) {
      if ( err ) {
        reject(err);
      } else {
        resolve(list.filter(filter).map(function(iter) {
          return createFileIter(instance, query, _path.join(real, iter), iter);
        }));
      }
    });
  });
}

///////////////////////////////////////////////////////////////////////////////
// VFS METHODS
///////////////////////////////////////////////////////////////////////////////

var VFS = {

  exists: function(instance, http, args, resolve, reject) {
    const resolved = resolveRequestPath(instance, http, args.path);
    existsWrapper(true, resolved.real, resolve, reject);
  },

  read: function(instance, http, args, resolve, reject) {
    /*eslint new-cap: "off"*/
    const resolved = resolveRequestPath(instance, http, args.path);
    const options = args.options || {};

    if ( options.raw !== false ) {
      if ( options.stream !== false ) {
        http.respond.stream(args.path, _fstream.Reader(resolved.real));
      } else {
        _fs.readFile(resolved.real, function(e, r) {
          if ( e ) {
            reject(e);
          } else {
            resolve(r);
          }
        });
      }
    } else {
      const mime = _osjsvfs.getMime(instance, args.path);
      _fs.readFile(resolved.real, function(e, data) {
        if ( e ) {
          reject(e);
        } else {
          const data = 'data:' + mime + ';base64,' + (new Buffer(data).toString('base64'));
          resolve(data.toString());
        }
      });
    }
  },

  upload: function(instance, http, args, resolve, reject) {
    function _proceed(source, dest) {
      const streamIn = _fs.createReadStream(source);
      const streamOut = _fs.createWriteStream(dest, {flags: 'w'});

      function streamDone() {
        streamIn.destroy();
        streamOut.destroy();

        _fs.unlink(source, function() {
          http.respond.raw(String(1), 200, {
            'Content-Type': 'text/plain'
          });
        });
      }

      function streamError(err) {
        streamIn.destroy();
        streamOut.destroy();
        streamOut.removeListener('close', streamDone);
        reject(err);
      }

      streamIn.on('error', streamError);
      streamOut.on('error', streamError);
      streamOut.once('close', streamDone);
      streamIn.pipe(streamOut);
    }

    const source = http.files.upload.path;
    const dresolved = resolveRequestPath(instance, http, http.data.path);
    const dest = _path.join(dresolved.real, http.files.upload.name);

    existsWrapper(false, source, function() {
      if ( String(http.data.overwrite) === 'true' ) {
        _proceed(source, dest);
      } else {
        existsWrapper(true, dest, function() {
          _proceed(source, dest);
        }, reject);
      }
    }, reject);
  },

  write: function(instance, http, args, resolve, reject) {
    const resolved = resolveRequestPath(instance, http, args.path);
    const options = args.options || {};
    var data = args.data || ''; // FIXME

    function writeFile(d, e) {
      _fs.writeFile(resolved.real, d, e || 'utf8', function(error) {
        if ( error ) {
          reject('Error writing file: ' + error);
        } else {
          resolve(true);
        }
      });
    }

    /*existsWrapper(true, resolved.real, function() {
    }, reject);*/
    if ( options.raw ) {
      writeFile(data, options.rawtype || 'binary');
    } else {
      data = unescape(data.substring(data.indexOf(',') + 1));
      data = new Buffer(data, 'base64');
      writeFile(data);
    }
  },

  delete: function(instance, http, args, resolve, reject) {
    const resolved = resolveRequestPath(instance, http, args.path);
    if ( ['', '.', '/'].indexOf() !== -1 ) {
      return reject('Permission denied');
    }

    existsWrapper(false, resolved.real, function() {
      _fs.remove(resolved.real, function(err) {
        if ( err ) {
          reject('Error deleting: ' + err);
        } else {
          resolve(true);
        }
      });
    }, reject);
  },

  copy: function(instance, http, args, resolve, reject) {
    const sresolved = resolveRequestPath(instance, http, args.src);
    const dresolved = resolveRequestPath(instance, http, args.dest);

    existsWrapper(false, sresolved.real, function() {
      existsWrapper(true, dresolved.real, function() {
        _fs.access(_path.dirname(dresolved.real), _nfs.W_OK, function(err) {
          if ( err ) {
            callback('Cannot write to destination');
          } else {
            _fs.copy(sresolved.real, dresolved.real, function(error, data) {
              if ( error ) {
                reject('Error copying: ' + error);
              } else {
                resolve(true);
              }
            });
          }
        });
      }, reject);
    }, reject);
  },

  move: function(instance, http, args, resolve, reject) {
    const sresolved = resolveRequestPath(instance, http, args.src);
    const dresolved = resolveRequestPath(instance, http, args.dest);

    _fs.access(sresolved.real, _nfs.R_OK, function(err) {
      if ( err ) {
        reject('Cannot read source');
      } else {
        _fs.access(_path.dirname(dresolved.real), _nfs.W_OK, function(err) {
          if ( err ) {
            reject('Cannot write to destination');
          } else {
            _fs.rename(sresolved.real, dresolved.real, function(error, data) {
              if ( error ) {
                reject('Error renaming/moving: ' + error);
              } else {
                resolve(true);
              }
            });
          }
        });
      }
    });
  },

  mkdir: function(instance, http, args, resolve, reject) {
    const resolved = resolveRequestPath(instance, http, args.path);

    existsWrapper(true, resolved.real, function() {
      _fs.mkdir(resolved.real, function(err) {
        if ( err ) {
          reject('Error creating directory: ' + error);
        } else {
          resolve(true);
        }
      });
    }, reject);
  },

  find: function(instance, http, args, resolve, reject) {
    const qargs = args.args || {};
    const query = (qargs.query || '').toLowerCase();
    const resolved = resolveRequestPath(instance, http, args.path);

    if ( !qargs.recursive ) {
      return readDir(instance, args.path, resolved.real, function(iter) {
        if (  ['.', '..'].indexOf(iter) === -1 ) {
          return iter.toLowerCase().indexOf(query) !== -1;
        }
        return false;
      }).then(resolve).catch(reject);
    }

    var find;
    try {
      find = require('findit')(resolved.real);
    } catch ( e ) {
      return reject('Failed to load findit node library: ' + e.toString());
    }

    var list = [];

    find.on('path', function() {
      if ( qargs.limit && list.length >= qargs.limit ) {
        find.stop();
      }
    });

    find.on('directory', function(dir, stat) {
      const filename = _path.basename(dir).toLowerCase();
      if ( filename.indexOf(query) !== -1 ) {
        list.push(createFileIter(instance, args.path, resolved.real, dir, stat));
      }
    });

    find.on('file', function(file, stat) {
      const filename = _path.basename(file).toLowerCase();
      if ( filename.indexOf(query) !== -1 ) {
        list.push(createFileIter(instance, args.path, resolved.real, file, stat));
      }
    });

    find.on('end', function() {
      resolve(list);
    });

    find.on('stop', function() {
      resolve(list);
    });
  },

  fileinfo: function(instance, http, args, resolve, reject) {
    const resolved = resolveRequestPath(instance, http, args.path);

    existsWrapper(false, resolved.real, function() {
      const info = createFileIter(instance, args.path, resolved.real, _path.basename(resolved.real));
      const mime = _osjsvfs.getMime(instance, resolved.real);

      readExif(resolved.real, mime).then(function(result) {
        info.exif = result || 'No EXIF data available';
        resolve(info);
      }).catch(function(error) {
        info.exif = error;
        resolve(info);
      });
    }, reject);
  },

  scandir: function(instance, http, args, resolve, reject) {
    const resolved = resolveRequestPath(instance, http, args.path);
    readDir(instance, args.path, resolved.real).then(resolve).catch(reject);
  },

  freeSpace: function(instance, http, args, resolve, reject) {
    const resolved = resolveRequestPath(instance, http, args.root);

    try {
      require('diskspace').check(resolved.real, function(err, total, free, stat) {
        resolve(free);
      });
    } catch ( e ) {
      reject('Failed to load diskspace node library: ' + e.toString());
    }
  }
};

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports.request = function(instance, http, req, resolve, reject) {
  if ( typeof VFS[req.method] === 'function' ) {
    VFS[req.method](instance, http, req.data, resolve, reject);
  } else {
    reject('No such VFS method: ' + req.method);
  }
};

module.exports.createReadStream = createReadStream;
module.exports.createWriteStream = createWriteStream;
module.exports.name = '__default__';

