const path              = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode:    'development',
  devtool: false,

  entry: {
    worker:    './src/background/worker.js',
    offscreen: './offscreen.js',
    inject:    './src/content/inject.js',
    popup:     './src/popup/popup.js',
  },

  output: {
    path:     path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    clean:    true,
  },

  module: {
    rules: [
      {
        // Force webpack to treat ALL .js files as ES modules
        test:    /\.js$/,
        type:    'javascript/esm',   // ← this is the actual fix
        resolve: { fullySpecified: false },
      },
    ],
  },

  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json',        to: 'manifest.json'        },
        { from: 'offscreen.html',       to: 'offscreen.html'       },
        { from: 'src/popup/popup.html', to: 'src/popup/popup.html' },
        { from: 'src/popup/popup.css',  to: 'src/popup/popup.css'  },
      ],
    }),
  ],

  resolve: {
    extensions: ['.js'],
    fallback: {
      fs:   false,
      path: false,
      url:  false,
    },
  },
};