var tf = require('@tensorflow/tfjs-core');
var wasmBackend = require('@tensorflow/tfjs-backend-wasm');
var converter = require('@tensorflow/tfjs-converter');
var layers = require('@tensorflow/tfjs-layers');

tf.loadLayersModel = layers.loadLayersModel;
tf.loadGraphModel = converter.loadGraphModel;
tf.wasm = wasmBackend;

module.exports = tf;
