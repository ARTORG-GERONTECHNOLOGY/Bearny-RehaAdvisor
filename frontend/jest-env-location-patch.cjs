'use strict';

// Custom Jest environment that makes window.location members (reload, assign,
// replace, href, …) configurable and writable for mocking in tests.
//
// Background: The HTML spec marks Location members as [LegacyUnforgeable],
// which means jsdom defines them as non-configurable own properties on every
// Location instance. That prevents jest.spyOn from replacing them.
//
// Fix: Intercept Reflect.defineProperty during Location._internalSetup so
// that every property placed on a Location wrapper gets configurable:true /
// writable:true before the real descriptor is committed to the object.

const JSDOMEnvironment =
  require('jest-environment-jsdom').default || require('jest-environment-jsdom');

(function patchLocationModule() {
  try {
    const LocationModule = require('jsdom/lib/jsdom/living/generated/Location.js');
    if (LocationModule._locationPatched) return;
    LocationModule._locationPatched = true;

    const originalInternalSetup = LocationModule._internalSetup;
    LocationModule._internalSetup = function patchedInternalSetup(wrapper, globalObject) {
      const originalReflectDefProp = Reflect.defineProperty;
      Reflect.defineProperty = function (target, prop, desc) {
        if (target === wrapper && desc && !desc.configurable) {
          desc = { ...desc, configurable: true };
          if (Object.prototype.hasOwnProperty.call(desc, 'value')) {
            desc = { ...desc, writable: true };
          }
        }
        return originalReflectDefProp.call(Reflect, target, prop, desc);
      };
      try {
        return originalInternalSetup.call(this, wrapper, globalObject);
      } finally {
        Reflect.defineProperty = originalReflectDefProp;
      }
    };
  } catch {
    // Unsupported jsdom internal structure — skip patching silently.
  }
})();

class LocationPatchedEnvironment extends JSDOMEnvironment {
  async setup() {
    await super.setup();
    // Also make the window.location reference itself configurable so tests that
    // need to replace the whole object (rare) can do so.
    try {
      Object.defineProperty(this.global, 'location', {
        configurable: true,
        value: this.global.location,
      });
    } catch {
      // Already configurable or not needed — ignore.
    }
  }
}

module.exports = LocationPatchedEnvironment;
