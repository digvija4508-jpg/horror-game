import struct
import json

glb_path = 'd:/horror game/Avatars/Player-avatar.glb'
with open(glb_path, 'rb') as f:
    header = f.read(12)
    magic, version, length = struct.unpack('<III', header)
    chunk_header = f.read(8)
    chunk_length, chunk_type = struct.unpack('<II', chunk_header)
    chunk_data = f.read(chunk_length)
    gltf = json.loads(chunk_data.decode('utf-8'))
    
nodes = gltf.get('nodes', [])
print("Bones/Nodes in Player-avatar.glb:")
for i, node in enumerate(nodes):
    name = node.get('name')
    # Print if it looks like a bone
    if 'mixamorig' in name or 'bone' in name.lower() or 'armature' in name.lower():
        print(f" - {name}")
