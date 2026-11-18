package com.calorix.calorix;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Writes an explicit owner-selected copy, without reading paths or mutating inputs. */
public final class MealExportArchive {
    public static final int MAX_PHOTO_BYTES = 20 * 1024 * 1024;
    public static final int MAX_RECORD_BYTES = 1024 * 1024;

    private MealExportArchive() {}

    public static void validate(byte[] photo, byte[] record) {
        if (photo == null || photo.length < 4 || photo.length > MAX_PHOTO_BYTES
                || (photo[0] & 255) != 255 || (photo[1] & 255) != 216
                || record == null || record.length == 0 || record.length > MAX_RECORD_BYTES) {
            throw new IllegalArgumentException("Invalid meal copy data");
        }
    }

    @FunctionalInterface
    public interface Destination {
        OutputStream open(String mode) throws IOException;
    }

    public static void writeToDocument(Destination destination, byte[] photo, byte[] record) throws IOException {
        validate(photo, record);
        checkInterrupted();
        try (OutputStream output = destination.open("wt")) {
            if (output == null) throw new IOException("Document output unavailable");
            write(output, photo, record);
        }
    }

    private static void checkInterrupted() throws InterruptedIOException {
        if (Thread.currentThread().isInterrupted()) {
            throw new InterruptedIOException("Meal copy interrupted");
        }
    }

    /** Owns/closes the output after validation; data validity is checked before any write. */
    public static void write(OutputStream output, byte[] photo, byte[] record) throws IOException {
        validate(photo, record);
        checkInterrupted();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            entry(zip, "photo.jpg", photo);
            entry(zip, "meal.json", record);
        }
    }

    private static void entry(ZipOutputStream zip, String name, byte[] bytes) throws IOException {
        checkInterrupted();
        CRC32 crc = new CRC32();
        crc.update(bytes);
        ZipEntry entry = new ZipEntry(name);
        entry.setMethod(ZipEntry.STORED); // JPEG is already compressed; avoid recompressing it.
        entry.setSize(bytes.length);
        entry.setCompressedSize(bytes.length);
        entry.setCrc(crc.getValue());
        entry.setTime(0);
        zip.putNextEntry(entry);
        for (int offset = 0; offset < bytes.length; offset += 65536) {
            checkInterrupted();
            zip.write(bytes, offset, Math.min(65536, bytes.length - offset));
        }
        zip.closeEntry();
    }
}
