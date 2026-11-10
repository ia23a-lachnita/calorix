"""Reproduce the pinned first-frame assets, optionally using existing video cache."""
import argparse,base64,hashlib,json,shutil,subprocess,urllib.request
from pathlib import Path
import PIL
from PIL import Image
from tool.prepare_tier1_public_eval import convert_jpeg

def verify(file,meta):
 data=file.read_bytes()
 if len(data)!=meta['sourceBytes'] or hashlib.sha256(data).hexdigest()!=meta['sourceSha256'] or base64.b64encode(hashlib.md5(data).digest()).decode()!=meta['sourceMd5Base64']:raise ValueError('Pinned source video integrity failure')

def main():
 p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--source-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--video-cache',type=Path);a=p.parse_args();m=json.loads(a.manifest.read_text());prep=m['preparation']
 if m['sampleCount']!=6 or len(m['cases'])!=6:raise ValueError('Fixed six cases required')
 if subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0]!=prep['ffmpegVersion'] or PIL.__version__!=prep['pillowVersion'] or Image.core.jpeglib_version!=prep['jpegLibrary']:raise ValueError('Pinned image codec version differs')
 if sum(c['sideSource']['sourceBytes'] for c in m['cases'])>72*1024*1024 or any(c['sideSource']['sourceBytes']>24*1024*1024 for c in m['cases']):raise ValueError('Fixed download byte cap exceeded')
 a.output.mkdir();(a.output/'inputs').mkdir();(a.output/'videos').mkdir();(a.output/'frames').mkdir();source=a.source_root.resolve()
 for c in m['cases']:
  overhead=(source/c['inputSourceRelativePath']).resolve()
  if not overhead.is_relative_to(source):raise ValueError('Overhead source outside cache root')
  raw=overhead.read_bytes()
  if len(raw)>4*1024*1024 or hashlib.sha256(raw).hexdigest()!=c['inputSha256']:raise ValueError('Original overhead input drift')
  with (a.output/c['inputPath']).open('xb') as out:out.write(raw)
  meta=c['sideSource'];video=a.video_cache/(c['id']+'.h264') if a.video_cache else a.output/'videos'/(c['id']+'.h264')
  if a.video_cache is None:
   expected='https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/side_angles/'+c['id']+'/camera_A.h264'
   if meta['sourceUrl']!=expected:raise ValueError('Unexpected source URL')
   count=0
   with urllib.request.urlopen(expected,timeout=30) as response,video.open('xb') as out:
    while True:
     chunk=response.read(1024*1024)
     if not chunk:break
     count+=len(chunk)
     if count>24*1024*1024 or count>meta['sourceBytes']:raise ValueError('Source download byte cap')
     out.write(chunk)
  verify(video,meta);png=a.output/'frames'/(c['id']+'.png')
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-threads','1','-fflags','+genpts','-i',str(video),'-frames:v','1','-threads','1','-n',str(png)],capture_output=True,check=True,timeout=45)
  if hashlib.sha256(png.read_bytes()).hexdigest()!=meta['firstFramePngSha256']:raise ValueError('First output frame differs')
  jpeg=convert_jpeg(png.read_bytes())
  if len(jpeg)>4*1024*1024 or hashlib.sha256(jpeg).hexdigest()!=c['sideInputSha256']:raise ValueError('Side JPEG differs')
  with (a.output/c['sideInputPath']).open('xb') as out:out.write(jpeg)
 print(json.dumps({'cases':6,'allPinnedImagesReproduced':True,'videoCacheUsed':a.video_cache is not None,'sdkEntries':0}))
if __name__=='__main__':main()
