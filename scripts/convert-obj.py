# Blender script (run by scripts/convert-obj.cjs): converts each OBJ given as `source target`
# pairs into a .glb with its textures inside, as WebP of at most 1024 px.
# The OBJ is Y up, -Z forward (Blender's OBJ export default). Paths are made absolute so the
# importer finds the images next to the OBJ.
import os
import sys
import bpy

MAX = 1024
args = [os.path.abspath(arg) for arg in sys.argv[sys.argv.index('--') + 1:]]
for source, target in zip(args[0::2], args[1::2]):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=source, forward_axis='NEGATIVE_Z', up_axis='Y')
    for image in bpy.data.images:
        width, height = image.size
        if max(width, height) > MAX:
            k = MAX / max(width, height)
            image.scale(round(width * k), round(height * k))
    bpy.ops.export_scene.gltf(filepath=target, export_format='GLB', export_image_format='WEBP', export_image_quality=85)
    print('GLB', target)
