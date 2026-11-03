# Tiny stand-in for a Piper voice: output = phoneme IDs / 1000 * length_scale (as float audio)
import sys, onnx
from onnx import helper, TensorProto
inp = helper.make_tensor_value_info('input', TensorProto.INT64, [1, 'n'])
lens = helper.make_tensor_value_info('input_lengths', TensorProto.INT64, [1])
scales = helper.make_tensor_value_info('scales', TensorProto.FLOAT, [3])
out = helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 1, 1, 'n'])
k = helper.make_tensor('k', TensorProto.FLOAT, [], [0.001])
idx = helper.make_tensor('idx', TensorProto.INT64, [], [1])
shape = helper.make_tensor('shape', TensorProto.INT64, [4], [1, 1, 1, -1])
nodes = [
  helper.make_node('Cast', ['input'], ['f'], to=TensorProto.FLOAT),
  helper.make_node('Gather', ['scales', 'idx'], ['ls'], axis=0),
  helper.make_node('Mul', ['f', 'k'], ['a']),
  helper.make_node('Mul', ['a', 'ls'], ['b']),
  helper.make_node('Reshape', ['b', 'shape'], ['output']),
]
g = helper.make_graph(nodes, 'tiny_piper', [inp, lens, scales], [out], [k, idx, shape])
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 13)], producer_name='phanlipo-tests')
m.ir_version = 8
onnx.checker.check_model(m)
onnx.save(m, sys.argv[1])
