const tf = require('@tensorflow/tfjs-core');
const wasmBackend = require('@tensorflow/tfjs-backend-wasm');
const converter = require('@tensorflow/tfjs-converter');
const layers = require('@tensorflow/tfjs-layers');

tf.loadLayersModel = layers.loadLayersModel;
tf.loadGraphModel = converter.loadGraphModel;
tf.wasm = wasmBackend;

module.exports = tf;
