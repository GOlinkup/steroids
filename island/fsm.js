// Steroids island FSM. Version comes from pyproject.toml — do not stamp here.
//
// Ours: hidden | flex | jacked | pump are gym states. Plate snap, no bounce —
// the bar doesn't overshoot. Timers use globalThis so this runs in browsers
// AND node (tests). No artwork in this file — pure transitions.
(function (g) {
  'use strict';

  function IslandFSM(delays) {
    delays = delays || {};
    this.state = 'hidden'; // hidden | flex | jacked | pump
    this.onTransition = null;
    this.jackedToFlexDelay = delays.jackedToFlex != null ? delays.jackedToFlex : 15;
    this.flexToHiddenDelay = delays.flexToHidden != null ? delays.flexToHidden : 60;
    this.greetAutoCollapseDelay = delays.greetAuto != null ? delays.greetAuto : 0.6;
    this.greetHoverCollapseDelay = delays.greetHover != null ? delays.greetHover : 10;
    this.pinned = false;
    this._flexHide = null;
    this._jackedCollapse = null;
    this._greetCollapse = null;
  }

  IslandFSM.prototype.launch = function () {
    this.cancelTimers();
    this._go('pump');
  };

  IslandFSM.prototype.mouseEntered = function () {
    switch (this.state) {
      case 'hidden': this.cancelTimers(); this._go('flex'); break;
      case 'flex': this._clear('_flexHide'); break;
      case 'jacked': this._clear('_jackedCollapse'); break;
      case 'pump': this._greet(this.greetHoverCollapseDelay); break;
    }
  };

  IslandFSM.prototype.mouseLeft = function () {
    switch (this.state) {
      case 'flex': this._hide(this.flexToHiddenDelay); break;
      case 'jacked': this._collapse(this.jackedToFlexDelay); break;
      case 'pump': this._clear('_greetCollapse'); this._go('flex'); break;
    }
  };

  IslandFSM.prototype.click = function () {
    if (this.state !== 'flex') return;
    this.cancelTimers();
    this._go('jacked');
  };

  IslandFSM.prototype.greetComplete = function () {
    if (this.state !== 'pump') return;
    if (this._greetCollapse == null) this._greet(this.greetAutoCollapseDelay);
  };

  IslandFSM.prototype.reveal = function () {
    if (this.state !== 'hidden') return;
    this.cancelTimers();
    this._go('flex');
    this._hide(this.flexToHiddenDelay);
  };

  IslandFSM.prototype.forceJacked = function () { this.cancelTimers(); this._go('jacked'); };
  IslandFSM.prototype.forceFlex = function () { this.cancelTimers(); this._go('flex'); };
  IslandFSM.prototype.forceHidden = function () { this.cancelTimers(); this._go('hidden'); };

  IslandFSM.prototype._hide = function (s) {
    var self = this;
    this._clear('_flexHide');
    this._flexHide = setTimeout(function () {
      self._flexHide = null;
      if (self.state === 'flex') self._go('hidden');
    }, s * 1000);
  };

  IslandFSM.prototype._collapse = function (s) {
    var self = this;
    this._clear('_jackedCollapse');
    if (this.pinned) return;
    this._jackedCollapse = setTimeout(function () {
      self._jackedCollapse = null;
      if (self.state === 'jacked') self._go('flex');
    }, s * 1000);
  };

  IslandFSM.prototype._greet = function (s) {
    var self = this;
    this._clear('_greetCollapse');
    this._greetCollapse = setTimeout(function () {
      self._greetCollapse = null;
      if (self.state === 'pump') self._go('flex');
    }, s * 1000);
  };

  IslandFSM.prototype._clear = function (k) {
    if (this[k] != null) clearTimeout(this[k]);
    this[k] = null;
  };

  IslandFSM.prototype.cancelTimers = function () {
    this._clear('_flexHide');
    this._clear('_jackedCollapse');
    this._clear('_greetCollapse');
  };

  IslandFSM.prototype._go = function (next) {
    if (next === this.state) return;
    var from = this.state;
    this.state = next;
    if (this.onTransition) this.onTransition(from, next);
  };

  g.IslandFSM = IslandFSM;
})(typeof window !== 'undefined' ? window : globalThis);
