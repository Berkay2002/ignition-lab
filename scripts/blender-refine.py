"""Refine shared templates, then synchronize the editable assembly and studio renders.

blender --background --python scripts/blender-refine.py -- --templates
blender --background --python scripts/blender-refine.py -- --assembly assembly.json --render
The assembly JSON is window.v8Lab.exportAssembly() at crank zero, assembled, all layers visible.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--templates', action='store_true')
parser.add_argument('--assembly', type=Path)
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'v8-engine.blend'))
raw = (ROOT / 'blender-meshes.js').read_text()
prefix, payload = raw.split('\nglobalThis.BlenderMeshes = ', 1)
info = json.loads(prefix.removeprefix('globalThis.BlenderAssetInfo = ').rstrip(';'))
meshes = json.loads(payload.rstrip(';\n'))


def apply(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def cylinder(radius, depth, location=(0, 0, 0), vertices=64, axis='Y'):
    rotation = (math.pi / 2, 0, 0) if axis == 'Y' else (0, math.pi / 2, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                     location=location, rotation=rotation)
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def subtract(obj, cutter):
    modifier = obj.modifiers.new('Machined recess', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'
    modifier.solver = 'EXACT'
    modifier.object = cutter
    apply(obj, modifier)
    bpy.data.objects.remove(cutter, do_unlink=True)


def finish(obj, width):
    bevel = obj.modifiers.new('Tool edge radius', 'BEVEL')
    bevel.width = width
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'
    apply(obj, bevel)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    modifier = obj.modifiers.new('Machined normals', 'WEIGHTED_NORMAL')
    modifier.keep_sharp = True
    apply(obj, modifier)
    obj.data.calc_loop_triangles()
    result = []
    for triangle in obj.data.loop_triangles:
        for li in triangle.loops:
            p = obj.data.vertices[obj.data.loops[li].vertex_index].co
            n = obj.data.corner_normals[li].vector
            result.extend(round(float(v), 7) for v in (*p, *n))
    bpy.data.objects.remove(obj, do_unlink=True)
    return result


if args.templates:
    bpy.ops.object.text_add()
    text = bpy.context.object
    text.data.body = 'V8'
    text.data.extrude = .012
    text.data.bevel_depth = .004
    text.data.bevel_resolution = 2
    text.data.resolution_u = 8
    bpy.ops.object.convert(target='MESH')
    coords = [v.co.copy() for v in text.data.vertices]
    lo = [min(v[i] for v in coords) for i in range(3)]
    hi = [max(v[i] for v in coords) for i in range(3)]
    for vertex, co in zip(text.data.vertices, coords):
        vertex.co = ((co.x - lo[0]) / (hi[0] - lo[0]) - .5,
                     (co.z - lo[2]) / (hi[2] - lo[2]),
                     .5 - (co.y - lo[1]) / (hi[1] - lo[1]))
    meshes['badge'] = finish(text, .002)
    hexagon = cylinder(1, 1, vertices=6)
    subtract(hexagon, cylinder(.43, .42, (0, .43, 0), vertices=6))
    meshes['hex'] = finish(hexagon, .035)
    piston = cylinder(1, 1, vertices=96)
    subtract(piston, cylinder(.77, .82, (0, -.43, 0), vertices=64))
    subtract(piston, cylinder(.15, 2.2, (0, -.05, 0), vertices=32, axis='X'))
    for x in [-.38, .38]:
        subtract(piston, cylinder(.30, .22, (x, .52, 0), vertices=48))
    meshes['piston'] = finish(piston, .012)


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


if args.assembly:
    source = json.loads(args.assembly.read_text())
    parts = source['parts']
    assert len(parts) > 1000 and source['source'] == 'Blender'
    assert set(p['type'] for p in parts) <= set(meshes)
    for obj in list(bpy.data.objects):
        if obj.get('layer'):
            bpy.data.objects.remove(obj, do_unlink=True)
    shared = {}
    for name, values in meshes.items():
        vertices = [values[i:i + 3] for i in range(0, len(values), 6)]
        normals = [values[i + 3:i + 6] for i in range(0, len(values), 6)]
        mesh = bpy.data.meshes.new('Detailed ' + name)
        mesh.from_pydata(vertices, [], [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)])
        mesh.update()
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        mesh.normals_split_custom_set(normals)
        shared[name] = mesh
    materials = {}
    controller = bpy.data.objects['Assembly controls']
    controller['explode'] = 0
    controller['verified_with'] = bpy.app.version_string
    controller['detail_pass'] = 'Machined pistons, ignition, fuel, accessories and oil system'
    conversion = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    objects = []
    for index, part in enumerate(parts):
        color, metal = part['color'], part['metal']
        key = tuple(color[:3]) + (metal,)
        if key not in materials:
            material = bpy.data.materials.new('Finish ' + str(len(materials)))
            material.use_nodes = True
            shader = material.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Base Color'].default_value = (*(linear(v) for v in color[:3]), 1)
            shader.inputs['Metallic'].default_value = metal
            shader.inputs['Roughness'].default_value = .24 if metal > .7 else .42
            if metal < .6 and max(color[:3]) > .2:
                noise = material.node_tree.nodes.new('ShaderNodeTexNoise')
                noise.inputs['Scale'].default_value = 450
                bump = material.node_tree.nodes.new('ShaderNodeBump')
                bump.inputs['Strength'].default_value = .16
                bump.inputs['Distance'].default_value = .00012
                material.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
                material.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
            materials[key] = material
        layer = part['layer']
        collection = bpy.data.collections.get(layer.title())
        assert collection is not None, layer
        obj = bpy.data.objects.new(f"{part['name']} / {index:04d}", shared[part['type']])
        collection.objects.link(obj)
        if not obj.data.materials:
            obj.data.materials.append(materials[key])
        obj.material_slots[0].link = 'OBJECT'
        obj.material_slots[0].material = materials[key]
        basis, size, center = part['basis'], part['size'], part['center']
        transform = Matrix([[basis[c][r] * size[c] for c in range(3)] + [center[r]]
                            for r in range(3)] + [[0, 0, 0, 1]])
        obj.matrix_world = conversion @ transform
        obj['layer'], obj['part'] = layer, part['name']
        if part.get('cylinder'):
            obj['cylinder'] = part['cylinder']
        bank = -1 if center[0] < 0 else 1
        if part.get('cylinder'):
            bank = -1 if part['cylinder'] % 2 else 1
        offsets = {
            'block': (0, .115, 0), 'bearings': (0, -.075, 0), 'pan': (0, -.19, 0),
            'heads': (bank * .12 / math.sqrt(2), .15 + .12 / math.sqrt(2), 0),
            'valves': (0, .05, 0) if part['name'] == 'Camshaft' else (bank * .17 / math.sqrt(2), .18 + .17 / math.sqrt(2), 0),
            'covers': (bank * .23 / math.sqrt(2), .25 + .23 / math.sqrt(2), 0),
            'intake': (0, .39, 0), 'exhaust': (bank * .19, 0, 0),
            'timing': (0, 0, .16 if 'Flywheel' in part['name'] else -.16), 'rotating': (0, 0, 0),
        }
        offset = conversion.to_3x3() @ Vector(offsets[layer])
        for axis in range(3):
            if offset[axis]:
                driver = obj.driver_add('location', axis).driver
                variable = driver.variables.new()
                variable.name, variable.type = 'amount', 'SINGLE_PROP'
                variable.targets[0].id = controller
                variable.targets[0].data_path = '["explode"]'
                driver.expression = f'{obj.location[axis]:.9f}+amount*{offset[axis]:.9f}'
        objects.append(obj)
    scene = bpy.context.scene
    floor = bpy.data.objects['Studio floor']
    floor.location.z = -.158
    camera = scene.camera
    camera.data.ortho_scale = 1.01
    camera.location = (.85, 1.05, .69)
    target = Vector((0, .015, .07))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1050
    scene.render.resolution_percentage = 100
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    # Prefer an available CUDA/OptiX device; CPU rendering remains supported.
    preferences = bpy.context.preferences.addons['cycles'].preferences
    for backend in ['OPTIX', 'CUDA']:
        try:
            preferences.compute_device_type = backend
            preferences.get_devices()
            gpu = [d for d in preferences.devices if d.type != 'CPU']
            if gpu:
                for device in preferences.devices:
                    device.use = device.type != 'CPU'
                scene.cycles.device = 'GPU'
                break
        except TypeError:
            continue
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'v8-engine.glb'), export_format='GLB',
                             use_selection=True, export_animations=False, export_extras=True)
    bpy.ops.object.select_all(action='DESELECT')
    controller.select_set(True)
    bpy.context.view_layer.objects.active = controller
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'v8-engine.blend'))
    info['parts'] = len(objects)
    if args.render:
        scene.render.filepath = str(ROOT / 'v8-assembled.png')
        bpy.ops.render.render(write_still=True)
        controller['explode'] = .85
        controller.update_tag()
        scene.frame_set(1)
        bpy.context.view_layer.update()
        floor.location.z = -.32
        camera.data.ortho_scale = 1.37
        camera.location = (.95, 1.18, .8)
        target = Vector((0, 0, .20))
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.resolution_x, scene.render.resolution_y = 1200, 1400
        scene.render.filepath = str(ROOT / 'v8-exploded.png')
        bpy.ops.render.render(write_still=True)

info.update(version=bpy.app.version_string, validatedWith=bpy.app.version_string,
            meshCount=len(meshes), detailPass='Machined pistons, recessed hex hardware, ignition, fuel and accessory drive')
(ROOT / 'blender-meshes.js').write_text('globalThis.BlenderAssetInfo = ' + json.dumps(info) +
    ';\nglobalThis.BlenderMeshes = ' + json.dumps(meshes, separators=(',', ':')) + ';\n')
print(json.dumps(info), flush=True)
