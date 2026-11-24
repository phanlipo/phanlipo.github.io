# Export Z-Anatomy layers as raw meshes (decimated) for the anatomy app – runs inside Blender (4.2 LTS):
#   ANATOMY_OUT=/tmp/anatomy-export blender -b Startup.blend --python scripts/anatomy/export.py [-- layer …]
# Writes <layer>.json, <layer>.pos.f32, <layer>.idx.u32 to ANATOMY_OUT; then run scripts/anatomy/pack.mjs.
# Details: anatomy/README.md
import bpy, json, struct, sys, os, re
import numpy as np
OUT = os.environ.get('ANATOMY_OUT', '/tmp/anatomy-export')
os.makedirs(OUT, exist_ok=True)
LAYERS = [  # id, top collection, triangle budget, exclude regex
  ('skin', '9: Regions of human body', 40000, r'^$'),
  ('skeleton', '1: Skeletal system', 140000, r'^$'),
  ('muscles', '4: Muscular system', 170000, r'[Ff]ascia|[Bb]ursa|[Tt]endon sheath|[Rr]etinacul|[Aa]poneuros'),
  ('vessels', '5: Cardiovascular system', 70000, r'^$'),
  ('nerves', '7: Nervous system & Sense organs', 80000, r'[Dd]ura|[Ff]alx|[Tt]entorium|[Aa]rachnoid|[Pp]ia mater|[Mm]ening|[Ss]ulcus|[Gg]yrus|[Ff]issure'),
  ('organs', '8: Visceral systems', 80000, r'[Pp]eritone|[Ff]ascia|[Oo]mentum|[Mm]eso|[Mm]esentery|[Pp]leura|[Pp]ericard|[Rr]ecess|[Ff]old|[Ll]igament|[Ff]ossa|[Pp]ouch|[Ss]pace|[Cc]avity'),
  ('lymph', '6: Lymphoid organs', 20000, r'^$'),
]
only = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
scene = bpy.context.scene
cols = {c.name: c for c in scene.collection.children}
def objects_of(top, excl):
    rx = re.compile(excl)
    for o in top.all_objects:
        if o.type not in ('MESH', 'CURVE'): continue
        if o.hide_get() or o.hide_viewport: continue
        if re.search(r'\.[jg]$', o.name) or rx.search(o.name): continue
        yield o
def tri_count(o, dg):
    m = o.evaluated_get(dg).to_mesh(); n = len(m.loop_triangles) if m else 0
    if m: m.calc_loop_triangles(); n = len(m.loop_triangles)
    o.evaluated_get(dg).to_mesh_clear(); return n
def color_of(o):
    mats = [s.material for s in o.material_slots if s.material]
    if not mats: return [0.8, 0.8, 0.8]
    m = mats[0]
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                return list(n.inputs['Base Color'].default_value)[:3]
    return list(m.diffuse_color)[:3]
def groups_of(o, topname):
    return sorted({c.name for c in o.users_collection if c.name != topname})
for lid, cname, budget, excl in LAYERS:
    if only and lid not in only: continue
    top = cols[cname]
    objs = list(objects_of(top, excl))
    for o in objs:
        if o.type == 'CURVE':
            o.data.resolution_u = min(o.data.resolution_u, 3)
            o.data.bevel_resolution = min(o.data.bevel_resolution, 1)
    dg = bpy.context.evaluated_depsgraph_get()
    counts = {o.name: tri_count(o, dg) for o in objs}
    total = sum(counts.values()) or 1
    ratio = min(1.0, budget / total)
    for o in objs:
        n = counts[o.name]
        if n == 0: continue
        r = min(1.0, max(ratio, 60 / n))
        if r < 0.999:
            mod = o.modifiers.new('webdec', 'DECIMATE'); mod.ratio = r
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    parts = []; pos = []; idx = []; voff = 0; ioff = 0
    for o in objs:
        if counts[o.name] == 0: continue
        ev = o.evaluated_get(dg); m = ev.to_mesh()
        m.calc_loop_triangles()
        nv = len(m.vertices); nt = len(m.loop_triangles)
        if nt == 0: ev.to_mesh_clear(); continue
        co = np.empty(nv * 3, dtype=np.float32); m.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        mw = np.array(o.matrix_world, dtype=np.float64)
        w = (np.c_[co, np.ones(nv)] @ mw.T)[:, :3]
        # Blender Z-up -> Y-up (x, z, -y)
        w = np.c_[w[:, 0], w[:, 2], -w[:, 1]].astype(np.float32)
        tri = np.empty(nt * 3, dtype=np.int32); m.loop_triangles.foreach_get('vertices', tri)
        # drop unused vertices
        used, inv = np.unique(tri, return_inverse=True)
        w = w[used]; tri = inv.astype(np.uint32)
        parts.append({'name': o.name, 'groups': groups_of(o, cname), 'color': [round(c, 3) for c in color_of(o)],
                      'v': [voff, len(w)], 'i': [ioff, len(tri)]})
        pos.append(w); idx.append(tri); voff += len(w); ioff += len(tri)
        ev.to_mesh_clear()
    P = np.concatenate(pos); I = np.concatenate(idx)
    P.tofile(f'{OUT}/{lid}.pos.f32'); I.tofile(f'{OUT}/{lid}.idx.u32')
    json.dump({'layer': lid, 'parts': parts, 'verts': int(voff), 'tris': int(ioff // 3)}, open(f'{OUT}/{lid}.json', 'w'), indent=0)
    print('##', lid, len(parts), 'parts', voff, 'verts', ioff // 3, 'tris (from', total, ')', flush=True)
