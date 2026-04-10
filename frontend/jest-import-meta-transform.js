const { TsJestTransformer } = require('ts-jest');
const transformer = new TsJestTransformer();
function patchSource(s) {
  return s.replace(/\bimport\.meta\b/g, '({ env: {} })');
}
module.exports = {
  process(s, p, o) {
    return transformer.process(patchSource(s), p, o);
  },
  processAsync(s, p, o) {
    return transformer.processAsync(patchSource(s), p, o);
  },
  getCacheKey(s, p, o) {
    return transformer.getCacheKey(patchSource(s), p, o);
  },
  getCacheKeyAsync(s, p, o) {
    return transformer.getCacheKeyAsync(patchSource(s), p, o);
  },
};
