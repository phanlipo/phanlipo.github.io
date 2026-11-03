# Tiny stand-in for a Kokoro model: waveform = token IDs / 1000 × speed (style is ignored, but must be [1, 256])
import sys, onnx
from onnx import helper, TensorProto
ids = helper.make_tensor_value_info('input_ids', TensorProto.INT64, [1, 'n'])
style = helper.make_tensor_value_info('style', TensorProto.FLOAT, [1, 256])
speed = helper.make_tensor_value_info('speed', TensorProto.FLOAT, [1])
out = helper.make_tensor_value_info('waveform', TensorProto.FLOAT, ['n'])
k = helper.make_tensor('k', TensorProto.FLOAT, [], [0.001])
shape = helper.make_tensor('shape', TensorProto.INT64, [1], [-1])
nodes = [
  helper.make_node('Cast', ['input_ids'], ['f'], to=TensorProto.FLOAT),
  helper.make_node('Mul', ['f', 'k'], ['a']),
  helper.make_node('Mul', ['a', 'speed'], ['b']),
  helper.make_node('Reshape', ['b', 'shape'], ['waveform']),
]
g = helper.make_graph(nodes, 'tiny_kokoro', [ids, style, speed], [out], [k, shape])
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 13)], producer_name='phanlipo-tests')
m.ir_version = 8
onnx.checker.check_model(m)
onnx.save(m, sys.argv[1])
