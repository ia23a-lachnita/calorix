import 'package:cloud_functions/cloud_functions.dart';

typedef CallableInvoker = Future<Object?> Function(
  String name,
  Map<String, Object?> payload,
);

abstract class RetryAnalysisService {
  Future<void> retryEntryAnalysis(String entryId);
}

class RetryAnalysisException implements Exception {
  const RetryAnalysisException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => 'RetryAnalysisException($code): $message';
}

class CloudRetryAnalysisService implements RetryAnalysisService {
  CloudRetryAnalysisService([CallableInvoker? invoke])
      : _invoke = invoke ?? _invokeFirebase;

  final CallableInvoker _invoke;

  static Future<Object?> _invokeFirebase(
    String name,
    Map<String, Object?> payload,
  ) async =>
      (await FirebaseFunctions.instance.httpsCallable(name).call(payload)).data;

  @override
  Future<void> retryEntryAnalysis(String entryId) async {
    if (entryId.isEmpty) {
      throw const RetryAnalysisException(
          'invalid-argument', 'entryId is required');
    }
    try {
      await _invoke('retryEntryAnalysis', {'entryId': entryId});
    } on FirebaseFunctionsException catch (error) {
      throw RetryAnalysisException(error.code, error.message ?? error.code);
    }
  }
}
