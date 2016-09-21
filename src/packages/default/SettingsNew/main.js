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
(function(Application, Window, Utils, API, VFS, GUI) {
  'use strict';

  var DEFAULT_GROUP = 'misc';

  var _groups = {
    personal: {
      label: 'Personal'
    },
    system: {
      label: 'System'
    },
    user: {
      label: 'User'
    },
    misc: {
      label: 'Misc'
    }
  };

  /////////////////////////////////////////////////////////////////////////////
  // WINDOWS
  /////////////////////////////////////////////////////////////////////////////

  function ApplicationSettingsNewWindow(app, metadata, scheme) {
    Window.apply(this, ['ApplicationSettingsNewWindow', {
      icon: metadata.icon,
      title: metadata.name,
      width: 400,
      height: 400,
      allow_resize: true
    }, app, scheme]);

    this.currentModule = null;
  }

  ApplicationSettingsNewWindow.prototype = Object.create(Window.prototype);
  ApplicationSettingsNewWindow.constructor = Window.prototype;

  ApplicationSettingsNewWindow.prototype.init = function(wmRef, app, scheme) {
    var self = this;
    var root = Window.prototype.init.apply(this, arguments);

    // Load and render `scheme.html` file
    scheme.render(this, 'SettingsNewWindow', root);

    this._find('ButtonOK').son('click', this, this.onButtonOK);
    this._find('ButtonCancel').son('click', this, this.onButtonCancel);

    // Adds all groups and their respective entries
    var container = document.createElement('div');
    container.className = 'ListView';

    var containers = {};
    var tmpcontent = document.createDocumentFragment();

    Object.keys(_groups).forEach(function(k) {
      var c = document.createElement('ul');
      var h = document.createElement('span');
      var d = document.createElement('div');

      h.appendChild(document.createTextNode(_groups[k].label));

      containers[k] = c;

      d.appendChild(h);
      d.appendChild(c);
      container.appendChild(d);
    });

    app.modules.forEach(function(m) {
      if ( containers[m.group] ) {
        var i = document.createElement('img');
        i.setAttribute('src', API.getIcon(m.icon, '32x32'));
        i.setAttribute('title', m.name);

        var s = document.createElement('span');
        s.appendChild(document.createTextNode(m.name));

        var c = document.createElement('li');
        c.setAttribute('data-module', String(m.name));
        c.appendChild(i);
        c.appendChild(s);

        containers[m.group].appendChild(c);

        m.render(tmpcontent);
      }
    });

    Object.keys(containers).forEach(function(k) {
      if ( !containers[k].children.length ) {
        containers[k].parentNode.style.display = 'none';
      }
    });

    Utils.$bind(container, 'click', function(ev) {
      if ( ev.target && ev.target.tagName === 'LI' && ev.target.hasAttribute('data-module') ) {
        var m = ev.target.getAttribute('data-module');
        self.onModuleSelect(m);
      }
    }, true);

    root.querySelector('[data-id="ContainerSelection"]').appendChild(container);

    containers = {};
    tmpcontent = null;

    return root;
  };

  ApplicationSettingsNewWindow.prototype.destroy = function() {
    // This is where you remove objects, dom elements etc attached to your
    // instance. You can remove this if not used.
    if ( Window.prototype.destroy.apply(this, arguments) ) {
      this.currentModule = null;

      return true;
    }
    return false;
  };

  ApplicationSettingsNewWindow.prototype.onWindowInited = function(modules) {
    var root = this._$element;
    modules.forEach(function(m) {
      m.render(root);
    });
  };

  ApplicationSettingsNewWindow.prototype.onModuleSelect = function(name) {
    var root = this._$element;

    function _d(d) {
      root.querySelector('[data-id="ContainerSelection"]').style.display = d ? 'block' : 'none';
      root.querySelector('[data-id="ContainerContent"]').style.display = d ? 'none' : 'block';
      root.querySelector('[data-id="ContainerButtons"]').style.display = d ? 'none' : 'block';
    }

    root.querySelectorAll('div[data-module]').forEach(function(mod) {
      mod.style.display = 'none';
    });

    _d(true);

    this._setTitle(null);

    if ( name === null ) {
      return;
    }

    var found;
    this._app.modules.forEach(function(m) {
      if ( !found && m.name === name ) {
        found = m;
      }
    });

    if ( found ) {
      var mod = root.querySelector('div[data-module="' + found.name +  '"]');
      if ( mod ) {
        mod.style.display = 'block';
        found.select();

        _d(false);
        this._setTitle(found.name, true);
      }
    }
  };

  ApplicationSettingsNewWindow.prototype.onButtonOK = function() {
    var self = this;

    this._toggleLoading(true);
    this._app.saveSettings(function() {
      self._toggleLoading(false);
      self.onModuleSelect(null);
    });
  };

  ApplicationSettingsNewWindow.prototype.onButtonCancel = function() {
    this.onModuleSelect(null);

    // TODO: Re-render module and reset values
  };

  /////////////////////////////////////////////////////////////////////////////
  // APPLICATION
  /////////////////////////////////////////////////////////////////////////////

  function ApplicationSettingsNew(args, metadata) {
    Application.apply(this, ['ApplicationSettingsNew', args, metadata]);

    var registered = OSjs.Applications.ApplicationSettingsNew.Modules;

    this.modules = Object.keys(registered).map(function(name) {
      var opts = Utils.argumentDefaults(registered[name], {
        name: name,
        group: DEFAULT_GROUP,
        icon: 'status/error.png',
        init: function() {},
        select: function() {},
        render: function() {},
        load: function() {},
        save: function() {}
      });

      if ( Object.keys(_groups).indexOf(opts.group) === -1 ) {
        opts.group = DEFAULT_GROUP;
      }

      Object.keys(opts).forEach(function(k) {
        if ( typeof opts[k] === 'function' ) {
          opts[k] = opts[k].bind(opts);
        }
      });

      return opts;
    });

    this.modules.forEach(function(m) {
      m.init();
    });
  }

  ApplicationSettingsNew.prototype = Object.create(Application.prototype);
  ApplicationSettingsNew.constructor = Application;

  ApplicationSettingsNew.prototype.destroy = function() {
    // This is where you remove objects, dom elements etc attached to your
    // instance. You can remove this if not used.
    if ( Application.prototype.destroy.apply(this, arguments) ) {
      return true;
    }
    return false;
  };

  ApplicationSettingsNew.prototype.init = function(settings, metadata, scheme) {
    Application.prototype.init.apply(this, arguments);

    var self = this;
    var win = this._addWindow(new ApplicationSettingsNewWindow(this, metadata, scheme));
    win._on('init', function() {
      win.onWindowInited(self.modules);
    });
  };

  ApplicationSettingsNew.prototype.saveSettings = function(cb) {
    var settings = {};

    var wm = OSjs.Core.getWindowManager();
    //var sm = OSjs.Core.getSettingsManager();

    wm.applySettings(settings, false, function() {
      //sm.instance('VFS').set(null, vfsSettings, false, false);
      //sm.instance('SearchEngine').set(null, searchSettings, true, false);
      cb();
    }, false);
  };

  ApplicationSettingsNew.prototype.mount = function(win) {
    var found = this._getWindowByName('ApplicationFileManagerMountWindow');
    if ( found ) {
      found._focus();
      return;
    }

    this._addWindow(new MountWindow(this, this.__metadata, this.__scheme));
  };

  /////////////////////////////////////////////////////////////////////////////
  // EXPORTS
  /////////////////////////////////////////////////////////////////////////////

  OSjs.Applications = OSjs.Applications || {};
  OSjs.Applications.ApplicationSettingsNew = OSjs.Applications.ApplicationSettingsNew || {};
  OSjs.Applications.ApplicationSettingsNew.Class = Object.seal(ApplicationSettingsNew);
  OSjs.Applications.ApplicationSettingsNew.Modules = OSjs.Applications.ApplicationSettingsNew.Modules || {};

})(OSjs.Core.Application, OSjs.Core.Window, OSjs.Utils, OSjs.API, OSjs.VFS, OSjs.GUI);
