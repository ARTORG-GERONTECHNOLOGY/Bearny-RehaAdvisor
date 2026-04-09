// babel.config.js
module.exports = {
  presets: [
    '@babel/preset-env',
    '@babel/preset-react',
    '@babel/preset-typescript', // if you're using TypeScript
  ],
  plugins: [
    // Replace `import.meta` with `{ env: {} }` so Jest (CommonJS mode) can
    // handle Vite-specific `import.meta.env.VITE_*` references at test time.
    function ({ types: t }) {
      return {
        visitor: {
          MetaProperty(path) {
            if (
              path.node.meta.name === 'import' &&
              path.node.property.name === 'meta'
            ) {
              path.replaceWith(
                t.objectExpression([
                  t.objectProperty(
                    t.identifier('env'),
                    t.objectExpression([])
                  ),
                ])
              );
            }
          },
        },
      };
    },
  ],
};
