"""Execute the real dependency-free Android ZIP writer with a host JDK."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'android/app/src/main/java/com/calorix/calorix/MealExportArchive.java'


@unittest.skipUnless(shutil.which('javac') and shutil.which('java'), 'Java17 JDK required')
class AndroidMealExportArchiveTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='meal-archive-')
        cls.addClassCleanup(cls.tmp.cleanup)
        cls.work = Path(cls.tmp.name)
        harness = cls.work / 'ArchiveHarness.java'
        harness.write_text('''import com.calorix.calorix.MealExportArchive;
import java.io.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
public class ArchiveHarness {
 public static void main(String[] args) throws Exception {
  byte[] photo = {(byte)255,(byte)216,1,2,(byte)255,(byte)217};
  byte[] record = "{\\"name\\":\\"Crème meal\\",\\"referenceMeasurementsIncluded\\":false}".getBytes(StandardCharsets.UTF_8);
  String mode=args[0];
  if(mode.equals("trailing")) photo=new byte[]{(byte)255,(byte)216,1,2,(byte)255,(byte)217,10,20,30};
  if(mode.equals("photo-large")) { photo=new byte[MealExportArchive.MAX_PHOTO_BYTES+1]; photo[0]=(byte)255; photo[1]=(byte)216; photo[photo.length-2]=(byte)255; photo[photo.length-1]=(byte)217; }
  if(mode.equals("json-large")) record=new byte[MealExportArchive.MAX_RECORD_BYTES+1];
  if(mode.equals("bad-photo")) photo=new byte[]{1,2,3,4};
  if(mode.equals("empty-record")) record=new byte[0];
  try {
   if(mode.equals("replace")) {
    Path destination=Path.of(args[1]);
    Files.write(destination,new byte[262144]);
    MealExportArchive.writeToDocument(requestedMode -> {
     RandomAccessFile file=new RandomAccessFile(destination.toFile(),"rw");
     if(requestedMode.equals("wt")) file.setLength(0);
     file.seek(0);
     return new OutputStream(){public void write(int b) throws IOException {file.write(b);}
      public void write(byte[] b,int start,int count) throws IOException {file.write(b,start,count);}
      public void close() throws IOException {file.close();}};
    },photo,record);
    System.out.println("saved");return;
   }
   if(mode.equals("refuse-mode")) {
    int[] opens={0};
    try {MealExportArchive.writeToDocument(requestedMode -> {opens[0]++;throw new IOException("Unsupported mode");},photo,record);}
    catch(IOException e) {System.out.println("write-failed:"+opens[0]);return;}
   }
   if(mode.equals("interrupted")) Thread.currentThread().interrupt();
   OutputStream output = mode.equals("io-failure") ? new OutputStream(){public void write(int b) throws IOException {throw new IOException("expected failure");}} : Files.newOutputStream(Path.of(args[1]));
   MealExportArchive.write(output,photo,record);
   System.out.println("saved");
  } catch(IllegalArgumentException e) {System.out.println("invalid");}
    catch(InterruptedIOException e) {System.out.println("interrupted");}
    catch(IOException e) {System.out.println("write-failed");}
 }
}''')
        subprocess.run(['javac', '--release', '17', '-encoding', 'UTF-8', '-d', str(cls.work), str(SOURCE), str(harness)], check=True, capture_output=True, text=True, timeout=60)

    def run_mode(self, mode):
        output = self.work / (mode + '.zip')
        result = subprocess.run(['java', '-Xmx128m', '-Djava.io.tmpdir='+str(self.work), '-cp', str(self.work), 'ArchiveHarness', mode, str(output)], check=True, capture_output=True, text=True, timeout=30)
        return result.stdout.strip(), output

    def test_actual_zip_has_only_portable_entries_and_exact_photo_and_unicode_json(self):
        state, p = self.run_mode('ok')
        self.assertEqual(state, 'saved')
        with zipfile.ZipFile(p) as z:
            self.assertEqual(z.namelist(), ['photo.jpg', 'meal.json'])
            self.assertEqual(z.read('photo.jpg'), bytes([255,216,1,2,255,217]))
            self.assertEqual(json.loads(z.read('meal.json')), {'name':'Crème meal','referenceMeasurementsIncluded':False})
            self.assertTrue(all(x.compress_type == zipfile.ZIP_STORED for x in z.infolist()))
            self.assertIsNone(z.testzip())

    def test_original_trailing_bytes_are_not_rewritten(self):
        state, p = self.run_mode('trailing')
        self.assertEqual(state, 'saved')
        with zipfile.ZipFile(p) as z:
            self.assertEqual(z.read('photo.jpg'), bytes([255,216,1,2,255,217,10,20,30]))

    def test_existing_long_document_is_truncated_without_old_tail(self):
        state, p = self.run_mode('replace')
        self.assertEqual(state, 'saved')
        _, fresh = self.run_mode('ok')
        self.assertEqual(p.read_bytes(), fresh.read_bytes())
        with zipfile.ZipFile(p) as z:
            self.assertEqual(z.namelist(), ['photo.jpg', 'meal.json'])
            self.assertIsNone(z.testzip())

    def test_unsupported_write_mode_does_not_retry_nontruncating_mode(self):
        self.assertEqual(self.run_mode('refuse-mode')[0], 'write-failed:1')

    def test_photo_and_json_limits_and_missing_data_reject_before_output(self):
        for mode in ('photo-large', 'json-large', 'bad-photo', 'empty-record'):
            with self.subTest(mode=mode):
                state, p = self.run_mode(mode)
                self.assertEqual(state, 'invalid')
                self.assertEqual(p.stat().st_size, 0)

    def test_interruption_stops_instead_of_reported_success(self):
        state, p = self.run_mode('interrupted')
        self.assertEqual(state, 'interrupted')
        self.assertEqual(p.stat().st_size, 0)

    def test_destination_io_failure_is_propagated(self):
        self.assertEqual(self.run_mode('io-failure')[0], 'write-failed')
