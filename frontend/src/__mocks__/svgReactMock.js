// __mocks__/svgReactMock.js
// Mock for SVG imports with ?react suffix (imported as React components)
import React from 'react';

const SvgMock = React.forwardRef((props, ref) => (
  <svg ref={ref} {...props} data-testid="svg-mock" />
));

SvgMock.displayName = 'SvgMock';

export default SvgMock;
