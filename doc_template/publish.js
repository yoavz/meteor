/*global env: true, require: true */
(function () {
  'use strict';

  var doop = require('jsdoc/util/doop');
  var fs = require('jsdoc/fs');
  var helper = require('jsdoc/util/templateHelper');
  var logger = require('jsdoc/util/logger');
  var path = require('jsdoc/path');
  var taffy = require('taffydb').taffy;
  var util = require('util');

  var _ = require("underscore");

  var htmlsafe = helper.htmlsafe;
  var linkto = helper.linkto;
  var resolveAuthorLinks = helper.resolveAuthorLinks;
  var scopeToPunc = helper.scopeToPunc;
  var hasOwnProp = Object.prototype.hasOwnProperty;

  var data;
  var view;

  var outdir = env.opts.destination;

  function find(spec) {
    return helper.find(data, spec);
  }

  function tutoriallink(tutorial) {
    return helper.toTutorial(tutorial, null, { tag: 'em', classname: 'disabled', prefix: 'Tutorial: ' });
  }

  function getAncestorLinks(doclet) {
    return helper.getAncestorLinks(data, doclet);
  }

  function hashToLink(doclet, hash) {
    if ( !/^(#.+)/.test(hash) ) { return hash; }

    var url = helper.createLink(doclet);

    url = url.replace(/(#.+|$)/, hash);
    return '<a href="' + url + '">' + hash + '</a>';
  }

  function needsSignature(doclet) {
    var needsSig = false;

    // function and class definitions always get a signature
    if (doclet.kind === 'function' || doclet.kind === 'class') {
      needsSig = true;
    }
    // typedefs that contain functions get a signature, too
    else if (doclet.kind === 'typedef' && doclet.type && doclet.type.names &&
      doclet.type.names.length) {
      for (var i = 0, l = doclet.type.names.length; i < l; i++) {
        if (doclet.type.names[i].toLowerCase() === 'function') {
          needsSig = true;
          break;
        }
      }
    }

    return needsSig;
  }

  function getSignatureAttributes(item) {
    var attributes = [];

    if (item.optional) {
      attributes.push('opt');
    }

    if (item.nullable === true) {
      attributes.push('nullable');
    }
    else if (item.nullable === false) {
      attributes.push('non-null');
    }

    return attributes;
  }

  function updateItemName(item) {
    var attributes = getSignatureAttributes(item);
    var itemName = item.name || '';

    if (item.variable) {
      itemName = '&hellip;' + itemName;
    }

    if (attributes && attributes.length) {
      itemName = util.format( '%s<span class="signature-attributes">%s</span>', itemName,
        attributes.join(', ') );
    }

    return itemName;
  }

  function addParamAttributes(params) {
    return params.filter(function(param) {
      return param.name && param.name.indexOf('.') === -1;
    }).map(updateItemName);
  }

  function buildItemTypeStrings(item) {
    var types = [];

    if (item.type && item.type.names) {
      item.type.names.forEach(function(name) {
        types.push( linkto(name, htmlsafe(name)) );
      });
    }

    return types;
  }

  function buildAttribsString(attribs) {
    var attribsString = '';

    if (attribs && attribs.length) {
      attribsString = htmlsafe( util.format('(%s) ', attribs.join(', ')) );
    }

    return attribsString;
  }

  function addNonParamAttributes(items) {
    var types = [];

    items.forEach(function(item) {
      types = types.concat( buildItemTypeStrings(item) );
    });

    return types;
  }

  function addSignatureParams(f) {
    var params = f.params ? addParamAttributes(f.params) : [];

    f.signature = util.format( '%s(%s)', (f.signature || ''), params.join(', ') );
  }

  function addSignatureReturns(f) {
    var attribs = [];
    var attribsString = '';
    var returnTypes = [];
    var returnTypesString = '';

    // jam all the return-type attributes into an array. this could create odd results (for example,
    // if there are both nullable and non-nullable return types), but let's assume that most people
    // who use multiple @return tags aren't using Closure Compiler type annotations, and vice-versa.
    if (f.returns) {
      f.returns.forEach(function(item) {
        helper.getAttribs(item).forEach(function(attrib) {
          if (attribs.indexOf(attrib) === -1) {
            attribs.push(attrib);
          }
        });
      });

      attribsString = buildAttribsString(attribs);
    }

    if (f.returns) {
      returnTypes = addNonParamAttributes(f.returns);
    }
    if (returnTypes.length) {
      returnTypesString = util.format( ' &rarr; %s{%s}', attribsString, returnTypes.join('|') );
    }

    f.signature = '<span class="signature">' + (f.signature || '') + '</span>' +
      '<span class="type-signature">' + returnTypesString + '</span>';
  }

  function addSignatureTypes(f) {
    var types = f.type ? buildItemTypeStrings(f) : [];

    f.signature = (f.signature || '') + '<span class="type-signature">' +
      (types.length ? ' :' + types.join('|') : '') + '</span>';
  }

  function addAttribs(f) {
    var attribs = helper.getAttribs(f);
    var attribsString = buildAttribsString(attribs);

    f.attribs = util.format('<span class="type-signature">%s</span>', attribsString);
  }

  function shortenPaths(files, commonPrefix) {
    Object.keys(files).forEach(function(file) {
      files[file].shortened = files[file].resolved.replace(commonPrefix, '')
        // always use forward slashes
        .replace(/\\/g, '/');
    });

    return files;
  }

  function getPathFromDoclet(doclet) {
    if (!doclet.meta) {
      return null;
    }

    return doclet.meta.path && doclet.meta.path !== 'null' ?
      path.join(doclet.meta.path, doclet.meta.filename) :
      doclet.meta.filename;
  }

  function generate(title, docs, filename, resolveLinks) {
    resolveLinks = resolveLinks === false ? false : true;

    var docData = {
      title: title,
      docs: docs
    };

    var outpath = path.join(outdir, filename),
      html = view.render('container.tmpl', docData);

    if (resolveLinks) {
      html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>
    }

    fs.writeFileSync(outpath, html, 'utf8');
  }

  function generateSourceFiles(sourceFiles, encoding) {
    encoding = encoding || 'utf8';
    Object.keys(sourceFiles).forEach(function(file) {
      var source;
      // links are keyed to the shortened path in each doclet's `meta.shortpath` property
      var sourceOutfile = helper.getUniqueFilename(sourceFiles[file].shortened);
      helper.registerLink(sourceFiles[file].shortened, sourceOutfile);

      try {
        source = {
          kind: 'source',
          code: helper.htmlsafe( fs.readFileSync(sourceFiles[file].resolved, encoding) )
        };
      }
      catch(e) {
        logger.error('Error while generating source file %s: %s', file, e.message);
      }

      generate('Source: ' + sourceFiles[file].shortened, [source], sourceOutfile,
        false);
    });
  }

  /**
   * Look for classes or functions with the same name as modules (which indicates that the module
   * exports only that class or function), then attach the classes or functions to the `module`
   * property of the appropriate module doclets. The name of each class or function is also updated
   * for display purposes. This function mutates the original arrays.
   *
   * @private
   * @param {Array.<module:jsdoc/doclet.Doclet>} doclets - The array of classes and functions to
   * check.
   * @param {Array.<module:jsdoc/doclet.Doclet>} modules - The array of module doclets to search.
   */
  function attachModuleSymbols(doclets, modules) {
    var symbols = {};

    // build a lookup table
    doclets.forEach(function(symbol) {
      symbols[symbol.longname] = symbols[symbol.longname] || [];
      symbols[symbol.longname].push(symbol);
    });

    return modules.map(function(module) {
      if (symbols[module.longname]) {
        module.modules = symbols[module.longname].map(function(symbol) {
          symbol = doop(symbol);

          if (symbol.kind === 'class' || symbol.kind === 'function') {
            symbol.name = symbol.name.replace('module:', '(require("') + '"))';
          }

          return symbol;
        });
      }
    });
  }

  /**
   * Create the navigation sidebar.
   * @param {object} members The members that will be used to create the sidebar.
   * @param {array<object>} members.classes
   * @param {array<object>} members.externals
   * @param {array<object>} members.globals
   * @param {array<object>} members.mixins
   * @param {array<object>} members.modules
   * @param {array<object>} members.namespaces
   * @param {array<object>} members.tutorials
   * @param {array<object>} members.events
   * @param {array<object>} members.interfaces
   * @return {string} The HTML for the navigation sidebar.
   */
  function buildNav(members) {
    var nav = '<h2><a href="index.html">Index</a></h2>',
      seen = {},
      hasClassList = false,
      classNav = '',
      globalNav = '';

    if (members.modules.length) {
      nav += '<h3>Modules</h3><ul>';
      members.modules.forEach(function(m) {
        if ( !hasOwnProp.call(seen, m.longname) ) {
          nav += '<li>' + linkto(m.longname, m.name) + '</li>';
        }
        seen[m.longname] = true;
      });

      nav += '</ul>';
    }

    if (members.externals.length) {
      nav += '<h3>Externals</h3><ul>';
      members.externals.forEach(function(e) {
        if ( !hasOwnProp.call(seen, e.longname) ) {
          nav += '<li>' + linkto( e.longname, e.name.replace(/(^"|"$)/g, '') ) + '</li>';
        }
        seen[e.longname] = true;
      });

      nav += '</ul>';
    }

    if (members.classes.length) {
      members.classes.forEach(function(c) {
        if ( !hasOwnProp.call(seen, c.longname) ) {
          classNav += '<li>' + linkto(c.longname, c.name) + '</li>';
        }
        seen[c.longname] = true;
      });

      if (classNav !== '') {
        nav += '<h3>Classes</h3><ul>';
        nav += classNav;
        nav += '</ul>';
      }
    }

    if (members.events.length) {
      nav += '<h3>Events</h3><ul>';
      members.events.forEach(function(e) {
        if ( !hasOwnProp.call(seen, e.longname) ) {
          nav += '<li>' + linkto(e.longname, e.name) + '</li>';
        }
        seen[e.longname] = true;
      });

      nav += '</ul>';
    }

    if (members.namespaces.length) {
      nav += '<h3>Namespaces</h3><ul>';
      members.namespaces.forEach(function(n) {
        if ( !hasOwnProp.call(seen, n.longname) ) {
          nav += '<li>' + linkto(n.longname, n.longname) + '</li>';
        }
        seen[n.longname] = true;
      });

      nav += '</ul>';
    }

    if (members.mixins.length) {
      nav += '<h3>Mixins</h3><ul>';
      members.mixins.forEach(function(m) {
        if ( !hasOwnProp.call(seen, m.longname) ) {
          nav += '<li>' + linkto(m.longname, m.name) + '</li>';
        }
        seen[m.longname] = true;
      });

      nav += '</ul>';
    }

    if (members.tutorials.length) {
      nav += '<h3>Tutorials</h3><ul>';
      members.tutorials.forEach(function(t) {
        nav += '<li>' + tutoriallink(t.name) + '</li>';
      });

      nav += '</ul>';
    }

    if (members.interfaces && members.interfaces.length) {
      nav += '<h3>Interfaces</h3><ul>';
      members.interfaces.forEach(function(i) {
        nav += '<li>' + linkto(i.longname, i.name) + '</li>';
      });
      nav += '</ul>';
    }

    if (members.globals.length) {
      members.globals.forEach(function(g) {
        if ( g.kind !== 'typedef' && !hasOwnProp.call(seen, g.longname) ) {
          globalNav += '<li>' + linkto(g.longname, g.name) + '</li>';
        }
        seen[g.longname] = true;
      });

      if (!globalNav) {
        // turn the heading into a link so you can actually get to the global page
        nav += '<h3>' + linkto('global', 'Global') + '</h3>';
      }
      else {
        nav += '<h3>Global</h3><ul>' + globalNav + '</ul>';
      }
    }

    return nav;
  }

  /**
    @param {TAFFY} taffyData See <http://taffydb.com/>.
    @param {object} opts
    @param {Tutorial} tutorials
   */
  exports.publish = function(taffyData, opts, tutorials) {
    var data = helper.prune(taffyData);

    var namespaces = helper.find(data,
      {kind: "namespace"});

    var docTree = {
      namespaces: {}
    };

    _.each(namespaces, function (namespace) {
      console.log(namespace.longname);
      console.log(namespace.description);

    });
  };
})();