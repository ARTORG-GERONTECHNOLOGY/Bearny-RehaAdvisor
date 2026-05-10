import { TsJestTransformer } from 'ts-jest';
const transformer = new TsJestTransformer();
function patchSource(s) {
  return s.replace(/\bimport\.meta\b/g, '({ env: {} })');
}
export function process(s, p, o) {
  return transformer.process(patchSource(s), p, o);
}
export function processAsync(s, p, o) {
  return transformer.processAsync(patchSource(s), p, o);
}
export function getCacheKey(s, p, o) {
  return transformer.getCacheKey(patchSource(s), p, o);
}
export function getCacheKeyAsync(s, p, o) {
  return transformer.getCacheKeyAsync(patchSource(s), p, o);
}
