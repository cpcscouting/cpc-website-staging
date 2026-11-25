/* dc-lite: a tiny runtime that renders the site's design-component templates as plain web pages.
   Supports {{holes}}, <sc-for>, <sc-if>, <dc-import>, event handlers, setState and lifecycle methods. */
(function () {
  var REG = {};
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (p) {
    var patch = typeof p === 'function' ? p(this.state, this.props) : p;
    this.state = Object.assign({}, this.state, patch);
    this.__schedule();
  };
  DCLogic.prototype.forceUpdate = function () { this.__schedule(); };
  DCLogic.prototype.__schedule = function () {
    var self = this;
    if (self.__pending) return;
    self.__pending = true;
    Promise.resolve().then(function () { self.__pending = false; self.__render(); });
  };
  window.DCLogic = DCLogic;

  function get(path, ctx) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var o = ctx, parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function interp(s, ctx) { return s.replace(HOLE, function (m, p) { var v = get(p, ctx); return v == null ? '' : String(v); }); }
  function camel(s) { return s.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); }); }
  function evName(attr, el) {
    var n = attr.slice(2).toLowerCase();
    if (n === 'change') {
      var t = (el.getAttribute('type') || '').toLowerCase();
      if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['file', 'checkbox', 'radio'].indexOf(t) < 0)) return 'input';
    }
    if (n === 'doubleclick') return 'dblclick';
    return n;
  }

  function renderNode(node, ctx, out, inst, counter) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(node.nodeValue.indexOf('{{') >= 0 ? interp(node.nodeValue, ctx) : node.nodeValue));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      var lm = WHOLE.exec(node.getAttribute('list') || '');
      var list = lm ? get(lm[1], ctx) : [];
      var as = node.getAttribute('as') || 'item';
      (list || []).forEach(function (it, i) {
        var c = Object.assign({}, ctx); c[as] = it; c.$index = i;
        renderChildren(node, c, out, inst, counter);
      });
      return;
    }
    if (tag === 'sc-if') {
      var im = WHOLE.exec(node.getAttribute('value') || '');
      if (im && get(im[1], ctx)) renderChildren(node, ctx, out, inst, counter);
      return;
    }
    if (tag === 'dc-import') {
      var name = node.getAttribute('name');
      var props = {};
      Array.prototype.forEach.call(node.attributes, function (a) {
        if (a.name === 'name' || a.name.indexOf('hint-') === 0) return;
        var wm = WHOLE.exec(a.value);
        props[camel(a.name)] = wm ? get(wm[1], ctx) : (a.value.indexOf('{{') >= 0 ? interp(a.value, ctx) : a.value);
      });
      var key = name + '#' + (counter.n++);
      var slot = inst.__kids[key];
      if (!slot) {
        var host = document.createElement('div');
        host.setAttribute('data-dc', name);
        host.setAttribute('data-dc-key', key);
        slot = inst.__kids[key] = { host: host, comp: mount(name, host, props) };
      } else if (slot.comp) {
        slot.comp.props = props;
        slot.comp.__schedule();
      }
      var ph = document.createElement('div');
      ph.setAttribute('data-dc-key', key);
      out.appendChild(ph);
      return;
    }
    var el = document.createElement(node.tagName);
    var valueProp;
    Array.prototype.forEach.call(node.attributes, function (a) {
      var n = a.name;
      if (n.indexOf('hint-') === 0 || n === 'key') return;
      var wm = WHOLE.exec(a.value);
      if (wm) {
        var v = get(wm[1], ctx);
        if (/^on[a-z]/i.test(n)) {
          if (typeof v === 'function') { var ev = evName(n, el); el.addEventListener(ev, v); (el.__ev = el.__ev || []).push([ev, v]); }
          return;
        }
        if (n === 'value') { valueProp = v == null ? '' : v; return; }
        if (n === 'disabled' || n === 'checked' || n === 'selected' || n === 'hidden' || n === 'open') { if (v) el.setAttribute(n, ''); return; }
        if (v === false || v == null) return;
        el.setAttribute(n, String(v));
        return;
      }
      el.setAttribute(n, a.value.indexOf('{{') >= 0 ? interp(a.value, ctx) : a.value);
    });
    renderChildren(node, ctx, el, inst, counter);
    if (valueProp !== undefined) { el.value = valueProp; el.__val = valueProp; }
    out.appendChild(el);
  }
  function renderChildren(node, ctx, out, inst, counter) {
    var kids = node.tagName && node.tagName.toLowerCase() === 'template' ? node.content.childNodes : node.childNodes;
    for (var i = 0; i < kids.length; i++) renderNode(kids[i], ctx, out, inst, counter);
  }


  function same(o, n) {
    if (o.nodeType !== n.nodeType) return false;
    if (o.nodeType !== 1) return true;
    if (o.tagName !== n.tagName) return false;
    return (o.getAttribute('data-dc-key') || '') === (n.getAttribute('data-dc-key') || '');
  }
  function resolve(n, inst) {
    if (n.nodeType === 1) {
      var k = n.getAttribute('data-dc-key');
      if (k && inst.__kids[k]) return inst.__kids[k].host;
      var phs = n.querySelectorAll ? n.querySelectorAll('[data-dc-key]') : [];
      Array.prototype.forEach.call(phs, function (ph) { var s = inst.__kids[ph.getAttribute('data-dc-key')]; if (s && ph !== s.host) ph.replaceWith(s.host); });
    }
    return n;
  }
  function patch(o, n, inst) {
    if (o.nodeType === 3 || o.nodeType === 8) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
    if (o.getAttribute('data-dc-key') && inst.__kids[o.getAttribute('data-dc-key')] && inst.__kids[o.getAttribute('data-dc-key')].host === o) return;
    var i, a;
    for (i = o.attributes.length - 1; i >= 0; i--) { a = o.attributes[i].name; if (!n.hasAttribute(a)) o.removeAttribute(a); }
    for (i = 0; i < n.attributes.length; i++) { a = n.attributes[i]; if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value); }
    (o.__ev || []).forEach(function (e) { o.removeEventListener(e[0], e[1]); });
    (n.__ev || []).forEach(function (e) { o.addEventListener(e[0], e[1]); });
    o.__ev = n.__ev;
    if (n.__val !== undefined && o.value !== String(n.__val)) o.value = n.__val;
    morph(o, n, inst);
  }
  function morph(op, np, inst) {
    var o = op.firstChild, n = np.firstChild;
    while (n) {
      var nn = n.nextSibling;
      if (!o) { op.appendChild(resolve(n, inst)); }
      else if (same(o, n)) { var on = o.nextSibling; patch(o, n, inst); o = on; }
      else { var r = resolve(n, inst); op.replaceChild(r, o); o = r.nextSibling; }
      n = nn;
    }
    while (o) { var x = o.nextSibling; op.removeChild(o); o = x; }
  }

  function pathOf(el, root) {
    var p = [];
    while (el && el !== root) { var i = 0, s = el; while ((s = s.previousSibling)) i++; p.unshift(i); el = el.parentNode; }
    return el === root ? p : null;
  }
  function byPath(root, p) { var el = root; for (var i = 0; i < p.length && el; i++) el = el.childNodes[p[i]]; return el; }

  function mount(name, host, props) {
    var def = REG[name];
    if (!def) { console.warn('dc-lite: no component', name); return null; }
    var Cls = def.factory();
    var inst = new Cls(props || {});
    inst.props = props || {};
    inst.state = inst.state || {};
    inst.__kids = {};
    inst.__render = function () {
      var vals;
      try { vals = inst.renderVals ? inst.renderVals() : {}; } catch (e) { console.error('dc-lite renderVals', name, e); vals = {}; }
      var ae = document.activeElement, fp = null, ss = null, se = null;
      if (ae && host.contains(ae)) { fp = pathOf(ae, host); try { ss = ae.selectionStart; se = ae.selectionEnd; } catch (e) {} }
      var frag = document.createDocumentFragment();
      renderChildren(def.tpl, vals, frag, inst, { n: 0 });
      morph(host, frag, inst);
      if (fp) {
        var f = byPath(host, fp);
        if (f && f.focus) { f.focus(); try { if (ss != null) f.setSelectionRange(ss, se); } catch (e) {} }
      }
    };
    inst.__render();
    if (inst.componentDidMount) { try { inst.componentDidMount(); } catch (e) { console.error(e); } }
    return inst;
  }

  window.DC = {
    register: function (name, factory) { REG[name] = { factory: factory, tpl: document.getElementById('dc-tpl-' + name) }; },
    start: function (name) { var host = document.getElementById('dc-root'); mount(name, host, {}); }
  };
})();
