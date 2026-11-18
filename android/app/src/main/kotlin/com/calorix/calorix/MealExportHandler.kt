package com.calorix.calorix

import android.app.Activity
import android.content.Intent
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Pending state lives on the activity thread. Document I/O never does. */
class MealExportHandler(private val activity: Activity, messenger: BinaryMessenger) {
    private val channel = MethodChannel(messenger, "com.calorix.calorix/meal_export")
    private val worker = Executors.newSingleThreadExecutor()
    private var pending: Pending? = null
    private var closed = false

    private class Pending(
        val result: MethodChannel.Result,
        val photo: ByteArray,
        val record: ByteArray,
        val fileName: String
    ) {
        var awaitingPicker = false
    }

    init {
        channel.setMethodCallHandler { call, result ->
            if (call.method != "saveMealCopy") {
                result.notImplemented()
            } else if (closed || pending != null) {
                result.error("busy", "A meal copy is already being saved.", null)
            } else {
                val arguments = call.arguments as? Map<*, *>
                val photo = arguments?.get("photo") as? ByteArray
                val record = arguments?.get("record") as? ByteArray
                val fileName = arguments?.get("fileName") as? String
                if (photo == null || record == null || fileName == null ||
                    !Regex("ravlo-[A-Za-z0-9_-]{1,80}\\.zip").matches(fileName)) {
                    result.error("invalid_data", "The meal copy could not be prepared.", null)
                } else {
                    try {
                        MealExportArchive.validate(photo, record)
                        val job = Pending(result, photo, record, fileName)
                        pending = job
                        worker.execute {
                            try {
                                val json = JSONObject(String(record, Charsets.UTF_8))
                                val meal = json.getJSONObject("meal")
                                val digest = MessageDigest.getInstance("SHA-256").digest(photo)
                                    .joinToString("") { (it.toInt() and 255).toString(16).padStart(2, '0') }
                                require(json.getInt("schemaVersion") == 1 &&
                                    json.getString("photoFile") == "photo.jpg" &&
                                    json.getString("photoSha256") == digest &&
                                    !json.getBoolean("referenceMeasurementsIncluded") &&
                                    !meal.has("photoPath") && meal.getInt("revision") > 0 &&
                                    fileName == "ravlo-${meal.getString("id")}.zip")
                                activity.runOnUiThread {
                                    if (pending === job && !closed) {
                                        try {
                                            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
                                                .addCategory(Intent.CATEGORY_OPENABLE)
                                                .setType("application/zip")
                                                .putExtra(Intent.EXTRA_TITLE, fileName)
                                            job.awaitingPicker = true
                                            activity.startActivityForResult(intent, REQUEST_CODE)
                                        } catch (_: Exception) {
                                            finish(job, error = "unavailable")
                                        }
                                    }
                                }
                            } catch (_: Exception) {
                                activity.runOnUiThread { finish(job, error = "invalid_data") }
                            }
                        }
                    } catch (_: Exception) {
                        pending = null
                        result.error("invalid_data", "The meal copy could not be prepared.", null)
                    }
                }
            }
        }
    }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false
        val job = pending ?: return true
        if (!job.awaitingPicker) return true
        job.awaitingPicker = false
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            finish(job, saved = false)
            return true
        }
        if (uri.scheme != "content") {
            finish(job, error = "write_failed")
            return true
        }
        try {
            worker.execute {
                try {
                    MealExportArchive.writeToDocument(
                        { mode -> activity.contentResolver.openOutputStream(uri, mode) },
                        job.photo, job.record
                    )
                    activity.runOnUiThread { finish(job, saved = true) }
                } catch (_: Exception) {
                    // A returned URI need not prove a newly owned document. Never delete it.
                    activity.runOnUiThread { finish(job, error = "write_failed") }
                }
            }
        } catch (_: Exception) {
            finish(job, error = "write_failed")
        }
        return true
    }

    private fun finish(job: Pending, saved: Boolean = false, error: String? = null) {
        if (pending !== job) return
        pending = null
        if (error == null) job.result.success(saved)
        else job.result.error(error, "The meal copy could not be saved.", null)
    }

    fun close() {
        if (closed) return
        closed = true
        channel.setMethodCallHandler(null)
        val job = pending
        pending = null
        worker.shutdownNow()
        job?.result?.success(false)
    }

    companion object {
        private const val REQUEST_CODE = 51825
    }
}
