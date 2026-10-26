"""Reproducible Blender 5.2 IRIS Coin render; run with blender -b -P this_file."""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'artifacts' / 'iris-coin'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 80
sc.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != 'CPU'
    sc.cycles.device = 'GPU'
except Exception:
    sc.cycles.device = 'CPU'
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = -.8
sc.world = bpy.data.worlds.new('Studio')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (.28, .19, .065, 1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = .4

def gold(name, color, rough=.23):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = .85
    bs.inputs['Roughness'].default_value = rough
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 210
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .12
    bump.inputs['Distance'].default_value = .006
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
    return m
base = gold('Brushed antique gold', (.6,.26,.025), .32)
bright = gold('Polished gold edges', (.95,.59,.105), .19)
recess = gold('Engraved shadow gold', (.22,.065,.008), .3)

def finish(ob, mat, bevel=.025):
    ob.data.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new('Rounded minted edge', 'BEVEL'); mod.width=bevel; mod.segments=3
    if ob.type == 'MESH':
        for f in ob.data.polygons: f.use_smooth=True
    return ob
def disc(name,r,z,depth,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=192,radius=r,depth=depth,location=(0,0,z))
    ob=bpy.context.object; ob.name=name
    return finish(ob,mat)
def ring(name,r,z,thickness,mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=192,minor_segments=16,location=(0,0,z),major_radius=r,minor_radius=thickness)
    ob=bpy.context.object; ob.name=name; return finish(ob,mat,0)
disc('Solid coin',2,0,.25,base)
disc('Outer mint rim',1.97,.135,.08,bright)
disc('Recessed face',1.78,.18,.06,recess)
disc('Brushed face',1.70,.215,.045,base)
for r,z,t,mat in [(1.96,.2,.035,bright),(1.84,.21,.025,bright),(1.71,.255,.025,bright),(1.49,.255,.015,recess),(1.40,.265,.02,bright)]:
    ring('Concentric engraved rim',r,z,t,mat)
# Precision ribs around the real, three dimensional coin edge.
for i in range(96):
    a=i*math.tau/96
    bpy.ops.mesh.primitive_cube_add(size=1,location=(1.989*math.cos(a),1.989*math.sin(a),-.015))
    ob=bpy.context.object; ob.name='Minted edge rib'; ob.scale=(.025,.035,.17); ob.rotation_euler.z=a
    finish(ob,bright,.01)
for i in range(8):
    a=i*math.tau/8
    bpy.ops.mesh.primitive_cube_add(size=1,location=(1.85*math.cos(a),1.85*math.sin(a),.24))
    ob=bpy.context.object; ob.name='Rim separator'; ob.scale=(.18,.055,.045); ob.rotation_euler.z=a
    finish(ob,recess,.01)
# Serif I, readable at a 20px HUD size, with deeply bevelled raised metal.
bpy.ops.object.text_add(location=(0,-.05,.28))
ob=bpy.context.object; ob.name='IRIS I embossed insignia'
ob.data.body='I'; ob.data.align_x='CENTER'; ob.data.align_y='CENTER'
ob.data.font=bpy.data.fonts.load('C:/Windows/Fonts/timesbd.ttf')
ob.data.size=3.55; ob.data.extrude=.09; ob.data.bevel_depth=.045; ob.data.bevel_resolution=4
ob.scale.x = 1.45
ob.data.materials.append(bright)
def star(x,y,r):
    verts=[]
    for i in range(8):
        a=i*math.tau/8
        rad=r if i%2==0 else r*.25
        verts.append((x+math.cos(a)*rad,y+math.sin(a)*rad,.29))
    verts.append((x,y,.37))
    faces=[(i,(i+1)%8,8) for i in range(8)]
    mesh=bpy.data.meshes.new('Faceted star'); mesh.from_pydata(verts,[],faces)
    ob=bpy.data.objects.new('Four point IRIS diamond',mesh); sc.collection.objects.link(ob)
    finish(ob,bright,.007)
for x,y,r in [(-1.08,0,.27),(1.08,0,.27),(0,1.17,.22),(0,-1.17,.22)]: star(x,y,r)
for loc,power,size,col in [((-3,1,6),800,4,(1,.87,.65)),((3,-1,5),650,3,(1,.76,.38)),((0,4,3),900,2,(1,1,.92))]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    light=bpy.context.object; light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.data.color=col
    light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-1.8,10))
cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.05))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=4.45;sc.camera=cam
sc.render.filepath=str(OUT/'iris-coin-v2.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'iris-coin-v2.blend'))
bpy.ops.render.render(write_still=True)
