const webpack = require('webpack');
const path = require('path')
const pkg = require('./package.json');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

module.exports = function(options) {
    if (!options) options = {};

    return {
        mode: "production",
        entry: {
            "api-ref-bundler": path.join(__dirname, "./src/index.ts"),
            "api-ref-bundler.min": path.join(__dirname, "./src/index.ts"),
        },
        output: {
            path: path.join(__dirname, "./browser/"),
            filename: "[name].js",

            globalObject: "self || this", // compatibility with Web Workers.
            library: 'ApiRefBundler',
            libraryTarget: 'var'
        },

        // devtool: 'inline-source-map',

        module: {
            rules: [
                { test: /\.ts$/, loader: "ts-loader" },
            ],
        },

        plugins: [
            new webpack.BannerPlugin({ banner: `api-ref-bundler@${pkg.version}` }),
            // new webpack.optimize.UglifyJsPlugin({ include: /\.min\.js$/, minimize: true})
        ],

        // hack: react-native is not used for the distribution build
        externals: {
        },

        optimization: {
            minimize: true,
            minimizer: [new UglifyJsPlugin({
                include: /\.min\.js$/
            })]
        },

        resolve: {
            extensions: ['.ts', '.js', '.json']
        }

    }
};